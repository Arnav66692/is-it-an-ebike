"""Reads bike shops and bike repair shops from Overture Maps Places with DuckDB.

Usage: python3 overture_places.py RELEASE OUT_FILE [REGION] [MAX_MB]   (needs: pip install duckdb)
RELEASE is a folder under s3://overturemaps-us-west-2/release/, such as 2026-10-21.0.
REGION is "us" (default), "ca" or "sd". MAX_MB stops the read past that many megabytes (default 2000).

The read is anonymous and free, but it is not small. Measured on Oct 22, 2026: the file footers
cost about 40 MB, San Diego County about 20 MB more, and the whole US is estimated at about
1.3 to 1.6 GB from the row group sizes. Each box is its own query with a plain range filter, so DuckDB
skips row groups outside it by their bbox statistics (an OR of boxes defeats that and reads the
world). Prefetching is off, so only the columns we keep are read. Rows go to OUT_FILE as one
JSON object per line.
"""

import json
import subprocess
import sys
import threading
import time

import duckdb

REGIONS = {  # (west, south, east, north)
    "us": [(-125.0, 24.4, -66.9, 49.4), (-179.2, 51.2, -129.9, 71.5), (-160.3, 18.9, -154.8, 22.3), (-67.95, 17.8, -65.2, 18.6)],
    "ca": [(-124.5, 32.5, -114.1, 42.0)],
    "sd": [(-117.6, 32.53, -116.08, 33.51)],
}
CATEGORIES = ["bike_store", "bike_repair_maintenance"]
COLUMNS = ["id", "name", "lat", "lon", "confidence", "status", "cat", "alts", "addr", "phone", "website"]


def received():
    route = subprocess.run(["route", "get", "default"], capture_output=True, text=True).stdout
    iface = [line.split()[1] for line in route.splitlines() if "interface" in line][0]
    out = subprocess.run(["netstat", "-ib", "-I", iface], capture_output=True, text=True).stdout
    return int(out.splitlines()[1].split()[6])


def sql(release, box):
    w, s, e, n = box
    cats = ", ".join("'%s'" % c for c in CATEGORIES)
    return """
    SELECT md5(names.primary || bbox.xmin::VARCHAR || bbox.ymin::VARCHAR) AS id, names.primary AS name,
      bbox.ymin AS lat, bbox.xmin AS lon, confidence, operating_status AS status, taxonomy.primary AS cat,
      taxonomy.alternates AS alts, addresses[1] AS addr, phones[1] AS phone, websites[1] AS website
    FROM read_parquet('s3://overturemaps-us-west-2/release/%s/theme=places/type=place/*')
    WHERE bbox.xmin BETWEEN %s AND %s AND bbox.ymin BETWEEN %s AND %s
      AND (taxonomy.primary IN (%s) OR list_has_any(taxonomy.alternates, [%s]))
    """ % (release, w, e, s, n, cats, cats)


def main():
    release, out = sys.argv[1], sys.argv[2]
    region = sys.argv[3] if len(sys.argv) > 3 else "us"
    max_bytes = int(sys.argv[4] if len(sys.argv) > 4 else 2000) * 1_000_000
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    con.sql("SET disable_parquet_prefetching = true; SET parquet_metadata_cache = true;")
    start, began = received(), time.time()
    stop = threading.Event()

    def watch():
        while not stop.wait(1):
            if received() - start > max_bytes:
                print("over %d MB, stopping" % (max_bytes // 1_000_000), flush=True)
                con.interrupt()
                return

    threading.Thread(target=watch, daemon=True).start()
    rows = []
    for box in REGIONS[region]:
        rows += con.sql(sql(release, box)).fetchall()
        print("box %s: %d rows so far, %.0f MB" % (box, len(rows), (received() - start) / 1e6), flush=True)
    stop.set()
    with open(out, "w") as f:
        for row in rows:
            f.write(json.dumps(dict(zip(COLUMNS, row)), default=str) + "\n")
    print("%d rows, %.0f MB, %.0fs" % (len(rows), (received() - start) / 1e6, time.time() - began))


if __name__ == "__main__":
    main()
