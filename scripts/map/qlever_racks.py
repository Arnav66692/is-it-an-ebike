"""Reads OpenStreetMap's bike racks, public repair stations and bike shops for every US state, DC
and Puerto Rico from the public QLever SPARQL endpoint over all of OpenStreetMap, and writes one
Overpass-style answer per state, which build_states.py reads with --osm.

Usage: python3 qlever_racks.py --cache /private/tmp/claude-501/mapdata/qlever [--out DIR] [--refresh]

One national query per layer, with no key. Each spot's state comes from OpenStreetMap's own
boundaries: the query joins the spot to the relation tagged ISO3166-2 US-XX that contains it, so
every spot lands in exactly one state file. A spot in a territory with no state file, like Guam,
is left out. Raw answers are cached as TSV in the cache folder, so a rerun reads them offline.
Nodes come back as POINT(lon lat). Ways and relations come back as polygons or lines, and their
centroid stands in for the point, the way Overpass gives a center.
"""

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request

from states import STATES

ENDPOINT = "https://qlever.dev/api/osm-planet"
KEY = "https://www.openstreetmap.org/wiki/Key:"
PREFIXES = "PREFIX ogc: <http://www.opengis.net/rdf#> PREFIX geo: <http://www.opengis.net/ont/geosparql#> "
OSM_IRI = re.compile(r"^https://www\.openstreetmap\.org/(node|way|relation)/(\d+)$")
TIMEOUT_S = 600

# Each layer: the pattern that picks its spots, the tags read with them, and the tags all of them have.
LAYERS = {
    "racks": ('?osm <%samenity> "bicycle_parking" .' % KEY, ["capacity", "covered", "access"],
              {"amenity": "bicycle_parking"}),
    "stations": ('?osm <%samenity> "bicycle_repair_station" .' % KEY,
                 ["name", "access", "opening_hours", "phone", "contact:phone", "website", "contact:website"],
                 {"amenity": "bicycle_repair_station"}),
    "shops": ('{ ?osm <%sshop> "bicycle" . } UNION { ?osm <%sservice:bicycle:repair> "yes" . }' % (KEY, KEY),
              ["shop", "amenity", "service:bicycle:repair", "name", "addr:housenumber", "addr:street", "addr:city",
               "phone", "contact:phone", "website", "contact:website", "opening_hours", "access"], {}),
}


def query(layer):
    pattern, keys, _ = LAYERS[layer]
    columns = " ".join("?t%d" % i for i in range(len(keys)))
    optional = " ".join("OPTIONAL { ?osm <%s%s> ?t%d }" % (KEY, k, i) for i, k in enumerate(keys))
    return (PREFIXES + "SELECT ?iso ?osm ?wkt %s WHERE { ?state <%sISO3166-2> ?iso . "
            'FILTER(STRSTARTS(STR(?iso), "US-")) ?state ogc:sfContains ?osm . %s '
            "?osm geo:hasGeometry/geo:asWKT ?wkt . %s }") % (columns, KEY, pattern, optional)


# Geometry


def coords(text):
    """'lon lat, lon lat' as [(lon, lat), ...], skipping anything that isn't a pair of numbers."""
    out = []
    for pair in text.split(","):
        parts = pair.split()
        if len(parts) < 2:
            continue
        try:
            out.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue
    return out


def outer_rings(wkt):
    """The outer ring of each polygon in a POLYGON or MULTIPOLYGON, the first ring in its parentheses."""
    polygon_depth = 2 if wkt.lstrip().upper().startswith("MULTIPOLYGON") else 1
    rings, depth, start, first = [], 0, None, False
    for i, ch in enumerate(wkt):
        if ch == "(":
            depth += 1
            if depth == polygon_depth:
                first = True
            start = i + 1
        elif ch == ")":
            if start is not None:
                if first:
                    rings.append(coords(wkt[start:i]))
                first = False
                start = None
            depth -= 1
    return rings


def ring_centroid(ring):
    """(lon, lat, area) of a ring by the shoelace formula, measured from its first vertex so the
    sums stay small. None when the ring has no area."""
    x0, y0 = ring[0]
    area2 = cx = cy = 0.0
    for (ax, ay), (bx, by) in zip(ring, ring[1:] + ring[:1]):
        ax, ay, bx, by = ax - x0, ay - y0, bx - x0, by - y0
        cross = ax * by - bx * ay
        area2 += cross
        cx += (ax + bx) * cross
        cy += (ay + by) * cross
    if area2 == 0:
        return None
    return x0 + cx / (3 * area2), y0 + cy / (3 * area2), abs(area2) / 2


def wkt_point(wkt):
    """(lat, lon) for a WKT geometry: a point as it is, a polygon or multipolygon by the area
    centroid of its outer rings, and a line, or a polygon with no area, by its mean vertex."""
    kind = wkt.lstrip().split("(", 1)[0].strip().upper()
    if kind in ("POLYGON", "MULTIPOLYGON"):
        parts = [c for c in (ring_centroid(r) for r in outer_rings(wkt) if len(r) >= 3) if c]
        total = sum(a for _, _, a in parts)
        if total > 0:
            return sum(y * a for _, y, a in parts) / total, sum(x * a for x, _, a in parts) / total
    pts = coords(re.sub(r"[()]", ",", wkt.split("(", 1)[1])) if "(" in wkt else []
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return None
    lat, lon = sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)
    return (lat, lon) if -90 <= lat <= 90 and -180 <= lon <= 180 else None


# Answers


def term(cell):
    """One TSV cell as plain text: an IRI's address, a literal's value, or a bare number. None when empty."""
    if not cell:
        return None
    if cell.startswith("<") and cell.endswith(">"):
        return cell[1:-1]
    if cell.startswith('"'):
        end = cell.rfind('"')
        body = cell[1:end] if end > 0 else cell[1:]
        return re.sub(r"\\(.)", lambda m: {"t": "\t", "n": "\n", "r": "\r"}.get(m.group(1), m.group(1)), body)
    return cell


def element(layer, row):
    """An Overpass-style element for one answer row, or None without an OpenStreetMap id or a point."""
    found = OSM_IRI.match(row.get("osm") or "")
    point = wkt_point(row.get("wkt") or "")
    if not found or point is None:
        return None
    _, keys, fixed = LAYERS[layer]
    tags = dict(fixed)
    for i, key in enumerate(keys):
        value = row.get("t%d" % i)
        if value is not None and value.strip():
            tags[key] = value.strip()
    kind, lat, lon = found.group(1), round(point[0], 7), round(point[1], 7)
    el = {"type": kind, "id": int(found.group(2)), "tags": tags}
    if kind == "node":
        el.update(lat=lat, lon=lon)
    else:
        el["center"] = {"lat": lat, "lon": lon}
    return el


def by_state(layer, tsv, seen=None):
    """The layer's elements grouped by state code. A spot already in seen, from an earlier row or
    layer, is skipped, so each spot lands in one state only."""
    seen = {} if seen is None else seen
    lines = tsv.split("\n")
    header = [h.strip().lstrip("?") for h in lines[0].split("\t")] if lines else []
    found, stats = {}, {"rows": 0, "kept": 0, "repeat": 0, "territory": 0, "bad": 0}
    for line in lines[1:]:
        if not line.strip():
            continue
        stats["rows"] += 1
        cells = line.split("\t")
        if len(cells) != len(header):
            stats["bad"] += 1
            continue
        row = dict(zip(header, (term(c) for c in cells)))
        code = (row.get("iso") or "")[3:]
        if code not in STATES:
            stats["territory"] += 1
            continue
        el = element(layer, row)
        if el is None:
            stats["bad"] += 1
            continue
        key = (el["type"], el["id"])
        if key in seen:
            stats["repeat"] += 1
            continue
        seen[key] = code
        found.setdefault(code, []).append(el)
        stats["kept"] += 1
    return found, stats


# Downloads


class KeepPost(urllib.request.HTTPRedirectHandler):
    """Follows a redirect with the same POST body, the way curl -L does for 307 and 308."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return urllib.request.Request(newurl, data=req.data, headers=dict(req.header_items()), method="POST")


def post(text):
    data = urllib.parse.urlencode({"query": text}).encode()
    req = urllib.request.Request(ENDPOINT, data=data, method="POST", headers={
        "Accept": "text/tab-separated-values", "User-Agent": "is-it-an-ebike map build"})
    with urllib.request.build_opener(KeepPost).open(req, timeout=TIMEOUT_S) as res:
        return res.read().decode("utf-8")


def write_atomic(path, text):
    with open(path + ".part", "w") as f:
        f.write(text)
    os.replace(path + ".part", path)


def planet_date(cache, refresh):
    """The date of the OpenStreetMap planet file the endpoint serves, from its stats, as YYYY-MM-DD."""
    path = os.path.join(cache, "stats.json")
    if refresh or not os.path.exists(path):
        with urllib.request.urlopen(ENDPOINT + "?cmd=stats", timeout=60) as res:
            write_atomic(path, res.read().decode("utf-8"))
    found = re.search(r"planet-(\d\d)(\d\d)(\d\d)\.osm\.pbf", json.load(open(path)).get("name-index", ""))
    return "20%s-%s-%s" % found.groups() if found else None


def answer(cache, layer, refresh):
    """The layer's TSV answer, from the cache unless refresh. The meta file is written last, so a
    download cut short is never read as a whole one."""
    tsv_path, meta_path = os.path.join(cache, layer + ".tsv"), os.path.join(cache, layer + ".json")
    if not refresh and os.path.exists(tsv_path) and os.path.exists(meta_path):
        return open(tsv_path).read(), json.load(open(meta_path))
    text = query(layer)
    start = time.time()
    tsv = post(text)
    meta = {"layer": layer, "endpoint": ENDPOINT, "fetched": time.strftime("%Y-%m-%d %H:%M %Z"),
            "seconds": round(time.time() - start, 1), "bytes": len(tsv.encode()), "query": text}
    write_atomic(tsv_path, tsv)
    write_atomic(meta_path, json.dumps(meta, indent=1))
    return tsv, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", help="where the per-state files go, by default CACHE/osm")
    ap.add_argument("--refresh", action="store_true", help="download again instead of reading the cache")
    args = ap.parse_args()
    out = args.out or os.path.join(args.cache, "osm")
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(out, exist_ok=True)

    planet = planet_date(args.cache, args.refresh)
    seen, states, report = {}, {}, {"planet": planet}
    for layer in LAYERS:
        tsv, meta = answer(args.cache, layer, args.refresh)
        found, stats = by_state(layer, tsv, seen)
        for code, els in found.items():
            states.setdefault(code, []).extend(els)
        report[layer] = {**stats, "seconds": meta["seconds"], "bytes": meta["bytes"], "fetched": meta["fetched"]}
    for code in STATES:
        meta = {"state": code, "read": planet, "source": "QLever osm-planet, " + ENDPOINT}
        write_atomic(os.path.join(out, code + ".json"),
                     json.dumps({"_meta": meta, "elements": states.get(code, [])}, separators=(",", ":")))
    report["perState"] = {code: len(states.get(code, [])) for code in STATES}
    print(json.dumps(report))


if __name__ == "__main__":
    main()
