"""Reads Overture bike shops and repair shops for every US state, one box per state, resumably.

Usage: python3 overture_states.py BOX_DIR MERGED_FILE [RELEASE]   (needs: pip install duckdb)
Each state's box is one plain range query (never an OR of boxes), so DuckDB skips row groups by
their bbox statistics. It uses the categories, fields and SQL of overture_places.py. Each finished
box is saved to BOX_DIR/XX.jsonl and is skipped on the next run, so a dropped connection costs one
box at most. A failed box is retried with backoff, then tried again in a later pass. Bytes received
per box go to BOX_DIR/_bytes.tsv, so the total survives restarts. When every box is done, the rows
are merged by id into MERGED_FILE, since the state boxes overlap. Run it detached, for example
nohup python3 overture_states.py /tmp/mapdata/overture-us /tmp/mapdata/overture-us.jsonl > overture.log 2>&1 &
"""

import json
import os
import sys
import time

import duckdb

from overture_places import COLUMNS, sql
from states import STATES

OUT_DIR, MERGED = sys.argv[1], sys.argv[2]
LEDGER = os.path.join(OUT_DIR, "_bytes.tsv")
RELEASE = sys.argv[3] if len(sys.argv) > 3 else "2026-10-21.0"
ATTEMPTS = 4
BACKOFF_S = 30
PASSES = 3


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def received():
    """Bytes received on all non-loopback interfaces, or None when netstat fails."""
    try:
        out = os.popen("netstat -ib").read().splitlines()
        total, seen = 0, set()
        for line in out[1:]:
            parts = line.split()
            if len(parts) < 10 or parts[0].startswith("lo") or parts[0] in seen or "<Link#" not in parts[2]:
                continue
            seen.add(parts[0])
            total += int(parts[6])
        return total
    except Exception:  # noqa: BLE001
        return None


def connect():
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    con.sql("SET disable_parquet_prefetching = true; SET parquet_metadata_cache = true;")
    con.sql("SET http_timeout = 120; SET http_retries = 8; SET http_retry_wait_ms = 2000; SET http_retry_backoff = 2;")
    return con


def done_path(st):
    return os.path.join(OUT_DIR, st + ".jsonl")


def read_box(con, st):
    s, w, n, e = STATES[st]
    before, began = received(), time.time()
    rows = con.sql(sql(RELEASE, (w, s, e, n))).fetchall()
    after = received()
    used = max(0, after - before) if before is not None and after is not None else -1
    tmp = done_path(st) + ".tmp"
    with open(tmp, "w") as f:
        for row in rows:
            f.write(json.dumps(dict(zip(COLUMNS, row)), default=str) + "\n")
    os.replace(tmp, done_path(st))
    with open(LEDGER, "a") as f:
        f.write("%s\t%d\t%d\t%.0f\n" % (st, len(rows), used, time.time() - began))
    return len(rows), used, time.time() - began


def run_pass(todo):
    con, failed = connect(), []
    for st in todo:
        for attempt in range(1, ATTEMPTS + 1):
            try:
                rows, used, secs = read_box(con, st)
                log("%s %d rows, %.1f MB, %.0fs" % (st, rows, used / 1e6, secs))
                break
            except Exception as err:  # noqa: BLE001  logged, retried, then left for the next pass
                log("%s attempt %d failed: %s" % (st, attempt, str(err)[:200]))
                try:
                    con.close()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(BACKOFF_S * 2 ** (attempt - 1))
                con = connect()
        else:
            failed.append(st)
    return failed


def merge():
    seen, total = set(), 0
    with open(MERGED + ".tmp", "w") as out:
        for st in STATES:
            for line in open(done_path(st)):
                row = json.loads(line)
                total += 1
                if row["id"] in seen:
                    continue
                seen.add(row["id"])
                out.write(line)
    os.replace(MERGED + ".tmp", MERGED)
    return total, len(seen)


def ledger_bytes():
    if not os.path.exists(LEDGER):
        return 0
    return sum(max(0, int(line.split("\t")[2])) for line in open(LEDGER) if line.strip())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    log("release %s, %d boxes, %d already done" % (RELEASE, len(STATES), sum(os.path.exists(done_path(s)) for s in STATES)))
    for p in range(1, PASSES + 1):
        todo = [st for st in STATES if not os.path.exists(done_path(st))]
        if not todo:
            break
        log("pass %d: %d boxes to read" % (p, len(todo)))
        failed = run_pass(todo)
        if failed:
            log("pass %d left %s" % (p, " ".join(failed)))
            time.sleep(300)
    left = [st for st in STATES if not os.path.exists(done_path(st))]
    if left:
        log("NOT DONE, still missing: %s. Run again to resume." % " ".join(left))
        sys.exit(1)
    total, unique = merge()
    log("ALL DONE: %d rows, %d unique, %.1f MB received in all box reads" % (total, unique, ledger_bytes() / 1e6))


if __name__ == "__main__":
    main()
