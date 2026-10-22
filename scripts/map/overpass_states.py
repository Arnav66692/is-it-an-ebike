"""Reads OpenStreetMap bike racks, bike shops, repair-capable shops and public repair stations
for every US state from the public Overpass servers, one state (or tile) at a time.

Usage: python3 overpass_states.py OUT_DIR [STATE ...]
Each answer is saved as OUT_DIR/XX[-n].json, and a saved answer is never asked for again,
so the run can stop and resume. Failures go to OUT_DIR/failed.txt.
"""

import gzip
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from states import BIG, STATES, tiles

SERVERS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
UA = "is-it-an-ebike map (https://is-it-an-ebike.vercel.app)"
PAUSE_S = 4
MAX_DEPTH = 2

CLAUSES = [
    '["amenity"="bicycle_parking"]',
    '["shop"="bicycle"]',
    '["amenity"="bicycle_repair_station"]',
    '["service:bicycle:repair"="yes"]',
]


def query(state, box):
    clip = "" if box is None else "(%s,%s,%s,%s)" % box
    nodes = "".join("node%s(area.a)%s;" % (c, clip) for c in CLAUSES)
    others = "".join("way%s(area.a)%s;rel%s(area.a)%s;" % (c, clip, c, clip) for c in CLAUSES)
    return (
        "[out:json][timeout:600][maxsize:1073741824];"
        'area["ISO3166-2"="US-%s"]["boundary"="administrative"]->.a;'
        "(%s)->.n;(%s)->.w;.n out;.w out tags center;" % (state, nodes, others)
    )


def bad_remark(data):
    remark = str(data.get("remark", "")).lower()
    return any(word in remark for word in ("error", "timed out", "memory"))


def ask(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in SERVERS:
        for attempt in range(2):
            headers = {"User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip"}
            req = urllib.request.Request(url, data=body, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=300) as res:
                    raw = res.read()
                    if res.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    data = json.loads(raw)
                if bad_remark(data):
                    raise RuntimeError("remark: " + str(data.get("remark"))[:120])
                return data, url
            except Exception as err:  # noqa: BLE001, each failure is logged and the next try made
                last = "%s %s" % (url.split("/")[2], str(err)[:120])
                print("  retry:", last, flush=True)
                time.sleep(PAUSE_S * (attempt + 2))
    raise RuntimeError(last)


def fetch(state, box, name, out, depth=0):
    path = os.path.join(out, name + ".json")
    if os.path.exists(path):
        return True
    started = time.time()
    try:
        data, url = ask(query(state, box))
    except RuntimeError as err:
        if box is None or depth >= MAX_DEPTH:
            with open(os.path.join(out, "failed.txt"), "a") as f:
                f.write("%s %s\n" % (name, err))
            return False
        print("  split", name, flush=True)
        ok = True
        for i, sub in enumerate(tiles(box, 2, 2)):
            ok = fetch(state, sub, "%s.%d" % (name, i), out, depth + 1) and ok
        return ok
    data["_meta"] = {"state": state, "box": box, "server": url, "read": time.strftime("%Y-%m-%d")}
    with open(path + ".tmp", "w") as f:
        json.dump(data, f)
    os.replace(path + ".tmp", path)
    print("%s %d elements %.0fs %s" % (name, len(data.get("elements", [])), time.time() - started, url.split("/")[2]), flush=True)
    time.sleep(PAUSE_S)
    return True


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for st in sys.argv[2:] or list(STATES):
        if st in BIG:
            for i, box in enumerate(tiles(STATES[st], *BIG[st])):
                fetch(st, box, "%s-%d" % (st, i), out)
        elif not fetch(st, None, st, out):
            # A whole-state query that failed is tried again as tiles.
            for i, box in enumerate(tiles(STATES[st], 2, 2)):
                fetch(st, box, "%s-%d" % (st, i), out)
    print("done", flush=True)


if __name__ == "__main__":
    main()
