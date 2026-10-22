"""Builds the map's saved data: one compact file per state (or per tile of a big state) in
public/map/states/, plus index.json, from OpenStreetMap answers and Overture Maps places.

Usage: python3 build_states.py --osm DIR --overture FILE --overture-region sd|ca|us
           --overture-release 2026-10-21.0 --seed public/map/san-diego.json --out public/map/states

A state read from OpenStreetMap gets a full file (racks and public repair stations come only from
there), with Overture shops and repair shops merged in. A state the Overture read covered but
OpenStreetMap did not gets a shops-only file, marked racksSaved false, so the page shows its shops
at once and asks the live route for racks. The seed snapshot's box becomes its own full area inside
its state, and that state's shops-only file leaves the box out. A state neither read covered is
listed as missing, so the page asks the live route for everything there.

Compact format, version 1:
  r: racks as [lat, lon, capacity or 0, flags], flags 1 covered, 2 not covered, 4 private or customers
  p: places as objects. k kind (s shop, r repair shop, st public repair station), y lat, x lon,
     n name, a address, p phone, w website, h hours, f 1 when a shop also repairs, c 1 when private,
     s source (o OpenStreetMap, v Overture, ov both)
"""

import argparse
import glob
import json
import math
import os
import re
import time

from states import STATES

MAX_FILE_BYTES = 3_000_000
MIN_CONFIDENCE = 0.5
DEDUPE_M = 75
UNNAMED_DEDUPE_M = 25
CLOSE_M = 30
SAME_PHONE_M = 5000
NEAR_DEG = 0.05
CLOSED = {"permanently_closed", "temporarily_closed", "closed"}
RESTRICTED = {"private", "no", "customers", "permissive_customers", "residents"}
FILLER = {"bike", "bikes", "bicycle", "bicycles", "shop", "store", "cycle", "cycles", "cycling", "co", "company",
          "the", "inc", "llc", "and", "of", "repair", "service", "services", "e", "ebike", "ebikes", "electric"}
OVERTURE_KIND = {"bike_store": "s", "bike_repair_maintenance": "r"}
# State boxes reach over the borders, into Tijuana, Ciudad Juarez and Toronto, so rows whose address
# names another country are dropped.
US_COUNTRIES = {"US", "PR"}


def r5(v):
    return round(float(v), 5)


def meters(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(min(1, math.sqrt(h)))


def name_tokens(name):
    words = re.findall(r"[a-z0-9]+", (name or "").lower())
    return {w for w in words if w not in FILLER}


def compact(name):
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def similar_names(a, b):
    """'Bike Bling' and 'BikeBling', or 'The Bike Shop' and 'The Bike Shop Temecula Valley'."""
    ca, cb = compact(a), compact(b)
    if min(len(ca), len(cb)) >= 5 and (ca in cb or cb in ca):
        return True
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / len(ta | tb) >= 0.5 or ta <= tb or tb <= ta


def phone_key(raw):
    digits = re.sub(r"\D", "", raw or "")
    return digits[-10:] if len(digits) >= 10 else None


def same_place(a, b):
    d = meters((a["y"], a["x"]), (b["y"], b["x"]))
    na, nb = a.get("n"), b.get("n")
    if d <= DEDUPE_M and similar_names(na, nb):
        return True
    if d <= 2 * DEDUPE_M and compact(na) and compact(na) == compact(nb):
        return True
    if d <= CLOSE_M and name_tokens(na) & name_tokens(nb):
        return True
    # One shop listed at an old and a new address shares its phone number.
    if d <= SAME_PHONE_M and phone_key(a.get("p")) and phone_key(a.get("p")) == phone_key(b.get("p")):
        return True
    return d <= UNNAMED_DEDUPE_M and (not na or not nb)


def us_phone(raw):
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return "(%s) %s-%s" % (digits[:3], digits[3:6], digits[6:])
    return raw.strip() or None


def web(raw):
    s = (raw or "").strip()
    return s if re.match(r"^https?://[^\s/]+\.[^\s]+$", s, re.I) else None


def clean(place):
    return {k: v for k, v in place.items() if v not in (None, "", 0, False)}


# OpenStreetMap


def osm_point(el):
    if "lat" in el:
        return el["lat"], el["lon"]
    c = el.get("center") or {}
    return (c["lat"], c["lon"]) if "lat" in c else None


def osm_address(t):
    street = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
    return ", ".join(x for x in (street, t.get("addr:city")) if x) or None


def osm_rows(elements):
    racks, places, seen = [], [], set()
    for el in elements:
        key = (el.get("type"), el.get("id"))
        pt = osm_point(el)
        if key in seen or pt is None:
            continue
        seen.add(key)
        t = el.get("tags") or {}
        private = t.get("access") in RESTRICTED
        if t.get("amenity") == "bicycle_parking":
            cap = t.get("capacity", "")
            cap = int(cap) if re.fullmatch(r"\d{1,4}", cap.strip()) and int(cap) > 0 else 0
            flags = (1 if t.get("covered") == "yes" else 2 if t.get("covered") == "no" else 0) | (4 if private else 0)
            racks.append([r5(pt[0]), r5(pt[1]), cap, flags])
            continue
        repairs = t.get("service:bicycle:repair") == "yes"
        if t.get("shop") == "bicycle":
            kind = "s"
        elif t.get("amenity") == "bicycle_repair_station":
            kind = "st"
        elif repairs:
            kind = "r"
        else:
            continue
        places.append({
            "k": kind, "y": r5(pt[0]), "x": r5(pt[1]), "n": (t.get("name") or "").strip() or None,
            "a": osm_address(t) if kind != "st" else None,
            "p": (t.get("phone") or t.get("contact:phone") or "").strip() or None,
            "w": web(t.get("website") or t.get("contact:website")),
            "h": (t.get("opening_hours") or "").strip() or None,
            "f": 1 if repairs and kind == "s" else 0, "c": 1 if private else 0, "s": "o",
        })
    return racks, places


# Overture


def overture_place(row):
    kind = OVERTURE_KIND.get(row["cat"])
    alts = row.get("alts") or []
    if kind is None:
        kind = "s" if "bike_store" in alts else "r"
    addr = row.get("addr") or {}
    if isinstance(addr, str):
        addr = {}
    short = ", ".join(x for x in (addr.get("freeform"), addr.get("locality")) if x) or None
    return {
        "k": kind, "y": r5(row["lat"]), "x": r5(row["lon"]), "n": (row.get("name") or "").strip() or None,
        "a": short, "p": us_phone(row.get("phone")), "w": web(row.get("website")), "h": None,
        "f": 1 if kind == "s" and "bike_repair_maintenance" in alts else 0, "c": 0, "s": "v",
        "_conf": row.get("confidence") or 0, "_region": addr.get("region"),
    }


def country_of(row):
    addr = row.get("addr")
    return addr.get("country") if isinstance(addr, dict) else None


def overture_rows(path):
    kept, dropped = [], {"low_confidence": 0, "closed": 0, "no_name": 0, "outside_us": 0}
    for line in open(path):
        row = json.loads(line)
        if country_of(row) not in (None, *US_COUNTRIES):
            dropped["outside_us"] += 1
        elif (row.get("confidence") or 0) < MIN_CONFIDENCE:
            dropped["low_confidence"] += 1
        elif row.get("status") in CLOSED:
            dropped["closed"] += 1
        elif not (row.get("name") or "").strip():
            dropped["no_name"] += 1
        else:
            kept.append(overture_place(row))
    # Surer rows first, so when Overture lists one shop twice the surer row is the one kept.
    kept.sort(key=lambda p: -p["_conf"])
    return kept, dropped


def merge_into(osm_place, ov):
    """One shop seen in both sources: OpenStreetMap's point and fields first, Overture fills gaps."""
    merged = dict(osm_place)
    for key in ("n", "a", "p", "w"):
        merged[key] = osm_place.get(key) or ov.get(key)
    if osm_place["k"] == "r" and ov["k"] == "s":
        merged["k"] = "s"
        merged["f"] = 1
    elif osm_place["k"] == "s" and ov["k"] == "r":
        merged["f"] = 1
    else:
        merged["f"] = osm_place.get("f") or ov.get("f")
    merged["s"] = "ov"
    return merged


def find_same(places, ov, osm_only):
    return next((i for i, p in enumerate(places) if p["k"] != "st" and (not osm_only or "o" in p["s"])
                 and abs(p["y"] - ov["y"]) < NEAR_DEG and same_place(p, ov)), None)


def merge_places(osm_places, ov_places):
    """Two passes. First each Overture row that matches an OpenStreetMap shop fills its gaps, so
    that shop picks up a phone number. Then the other Overture rows are added unless they repeat
    a shop already listed, which also catches a shop Overture lists at an old and a new address."""
    out = list(osm_places)
    stats = {"matched": 0, "duplicate": 0}
    leftover = []
    for ov in ov_places:
        hit = find_same(out, ov, osm_only=True)
        if hit is None:
            leftover.append(ov)
        else:
            out[hit] = merge_into(out[hit], ov)
            stats["matched"] += 1
    for ov in leftover:
        hit = find_same(out, ov, osm_only=False)
        if hit is None:
            out.append(ov)
        elif "o" in out[hit]["s"]:
            out[hit] = merge_into(out[hit], ov)
            stats["matched"] += 1
        else:
            stats["duplicate"] += 1
    return [clean({k: v for k, v in p.items() if not k.startswith("_")}) for p in out], stats


# Areas and files


def in_box(y, x, box):
    s, w, n, e = box
    return s <= y <= n and w <= x <= e


def state_of(place):
    region = place.get("_region")
    if region in STATES and in_box(place["y"], place["x"], STATES[region]):
        return region
    return next((st for st, box in STATES.items() if in_box(place["y"], place["x"], box)), None)


def counts(racks, places):
    return {
        "rack": len(racks),
        "shop": sum(p["k"] == "s" for p in places),
        "repair": sum(p["k"] in ("r", "st") for p in places),
        "shopRepairs": sum(p["k"] == "s" and p.get("f") == 1 for p in places),
        "stand": sum(p["k"] == "st" for p in places),
        "fromOsm": sum("o" in p["s"] for p in places),
        "fromOverture": sum("v" in p["s"] for p in places),
        "both": sum(p["s"] == "ov" for p in places),
    }


def payload(area_id, racks, places, read):
    return {"v": 1, "id": area_id, "read": read, "r": racks, "p": places}


def dumps(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def split(area_id, box, racks, places, read):
    """Halves an area along its longer side until each file is under MAX_FILE_BYTES."""
    if len(dumps(payload(area_id, racks, places, read)).encode()) <= MAX_FILE_BYTES:
        return [(area_id, box, racks, places)]
    s, w, n, e = box
    if n - s >= e - w:
        mid = (s + n) / 2
        a, b = (s, w, mid, e), (mid, w, n, e)
        first = lambda y, x: y < mid  # noqa: E731
    else:
        mid = (w + e) / 2
        a, b = (s, w, n, mid), (s, mid, n, e)
        first = lambda y, x: x < mid  # noqa: E731
    ra = [r for r in racks if first(r[0], r[1])]
    pa = [p for p in places if first(p["y"], p["x"])]
    rb = [r for r in racks if not first(r[0], r[1])]
    pb = [p for p in places if not first(p["y"], p["x"])]
    return split(area_id + "a", a, ra, pa, read) + split(area_id + "b", b, rb, pb, read)


def osm_by_state(osm_dir):
    found = {}
    for path in sorted(glob.glob(os.path.join(osm_dir, "*.json"))):
        data = json.load(open(path))
        meta = data.get("_meta") or {}
        if meta.get("state") in STATES:
            entry = found.setdefault(meta["state"], {"elements": [], "read": meta.get("read")})
            entry["elements"] += data.get("elements", [])
    return found


def area_jobs(st, box, osm_state, ov, seed_area, covered):
    """The files one state gets. osm_state is its OpenStreetMap answer or None, ov its Overture
    places, seed_area the seed snapshot when it lies in this state, covered whether the Overture
    read covered the whole state. Each job is one area: its id, box, OpenStreetMap elements and
    read date, Overture places, and whether its racks are saved."""
    if osm_state is not None:
        return [{"id": st, "box": box, "elements": osm_state["elements"], "osmRead": osm_state["read"],
                 "overture": ov, "racksSaved": True}]
    jobs = []
    if seed_area is not None:
        sb = seed_area["box"]
        jobs.append({"id": st + "-sd", "box": sb, "elements": seed_area["elements"], "osmRead": seed_area["read"],
                     "overture": [p for p in ov if in_box(p["y"], p["x"], sb)], "racksSaved": True})
        ov = [p for p in ov if not in_box(p["y"], p["x"], sb)]
    if covered:
        jobs.append({"id": st, "box": box, "elements": [], "osmRead": None, "overture": ov, "racksSaved": False})
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--osm", required=True)
    ap.add_argument("--overture", required=True)
    ap.add_argument("--overture-region", required=True, choices=["sd", "ca", "us"])
    ap.add_argument("--overture-release", required=True)
    ap.add_argument("--seed", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    osm = osm_by_state(args.osm)
    ov_all, ov_dropped = overture_rows(args.overture)
    ov_by_state = {}
    for p in ov_all:
        ov_by_state.setdefault(state_of(p), []).append(p)
    seed = json.load(open(args.seed))
    sb = seed["bbox"]
    seed_box = (sb["south"], sb["west"], sb["north"], sb["east"])
    seed_state = next(st for st, box in STATES.items() if in_box((sb["south"] + sb["north"]) / 2, (sb["west"] + sb["east"]) / 2, box))

    os.makedirs(args.out, exist_ok=True)
    stale = glob.glob(os.path.join(args.out, "*.json"))
    if stale:
        raise SystemExit("%s already has %d .json files. Build into an empty folder, then copy the files over." % (args.out, len(stale)))
    areas, missing, totals = [], [], {}
    seed_area = {"box": seed_box, "elements": seed["elements"], "read": seed["read"]}
    for st, box in STATES.items():
        covered = args.overture_region == "us" or (args.overture_region == "ca" and st == "CA")
        jobs = area_jobs(st, box, osm.get(st), ov_by_state.get(st, []), seed_area if st == seed_state else None, covered)
        if not any(job["id"] == st for job in jobs):
            missing.append({"id": st, "bbox": list(box)})
        for job in jobs:
            ov = job["overture"]
            racks, osm_places = osm_rows(job["elements"])
            places, merge_stats = merge_places(osm_places, ov)
            read = {"osm": job["osmRead"], "overture": args.overture_release if ov else None}
            sources = (["osm"] if job["racksSaved"] else []) + (["overture"] if ov else [])
            for part_id, part_box, pr, pp in split(job["id"], job["box"], racks, places, read):
                text = dumps(payload(part_id, pr, pp, read))
                with open(os.path.join(args.out, part_id + ".json"), "w") as f:
                    f.write(text)
                areas.append({"id": part_id, "state": st, "bbox": [round(v, 4) for v in part_box], "file": part_id + ".json",
                              "counts": counts(pr, pp), "sources": sources, "racksSaved": job["racksSaved"], "read": read,
                              "bytes": len(text.encode())})
            totals[job["id"]] = {"osm_places": len(osm_places), "overture_places": len(ov), **merge_stats}
    index = {
        "v": 1,
        "built": time.strftime("%Y-%m-%d"),
        "about": "Bike racks, bike shops and repair shops by US state. Racks, public repair stations and some shops "
                 "from OpenStreetMap, data (c) OpenStreetMap contributors, ODbL. More shops and repair shops from "
                 "Overture Maps Places, CDLA Permissive 2.0, with ODbL for rows Overture took from OpenStreetMap.",
        "overture": {"release": args.overture_release, "region": args.overture_region, "minConfidence": MIN_CONFIDENCE,
                     "dropped": ov_dropped},
        "areas": areas,
        "missing": missing,
    }
    with open(os.path.join(args.out, "index.json"), "w") as f:
        f.write(json.dumps(index, separators=(",", ":")))
    print(json.dumps({"areas": len(areas), "missing": len(missing), "merge": totals, "overture_dropped": ov_dropped}))
    for a in areas:
        print(a["id"], a["counts"], a["bytes"])


if __name__ == "__main__":
    main()
