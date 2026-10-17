# Photo pilot v3, step 2. Tunes the OWLv2 q4 pedal rule on the 71 dev photos only, from the saved
# per-query best box scores (dev-raw-v3.json). No model runs here.
#
# Rule family. The first version (170 rules, max logit over pedal-part queries minus max logit over
# foot-peg queries) was fixed before any scores existed. After a dry run on 44 dev photos, three
# variants were added: the mean of the pedal-group maxima, the same difference on probabilities, and
# an optional whole-object term (bicycle minus motorcycle). The nested leave-one-out estimate reruns
# the whole widened search for every held-out photo, so it covers that change.
#
# Call "pedals" when the score clears a threshold. The threshold sits halfway between the highest
# no-pedal score and the next pedal score above it, so dev has zero no-pedal misses by construction.
# Rules are ranked by pedal bikes cleared, then by that gap in units of the score's spread, then by
# fewer queries.
#
# Usage: python3 -I tune_v3.py <dev-raw-v3.json> <dev-labels.json> [out.json]
import itertools, json, math, statistics, sys

PEDAL_GROUPS = {
    "pedal": ["bicycle pedal", "pedal", "bicycle pedals"],
    "crank": ["pedal crank arm", "crank arm", "bicycle crankset"],
    "chain": ["chainring", "bicycle chainring", "bicycle chain", "chain"],
}
PEG_GROUPS = {
    "peg": ["motorcycle foot peg", "foot peg", "motorcycle foot pegs"],
    "footrest": ["motorcycle footrest", "footrest", "footboard"],
}
WHOLE_POS = ["bicycle", "electric bicycle"]
WHOLE_NEG = ["motorcycle", "dirt bike"]
SCORE_TYPES = ["max_logit", "group_mean_logit", "max_prob"]
WHOLE_WEIGHTS = [0.0, 0.5, 1.0]
HARD = {"moto_styled", "fat_tire", "mtb"}
GROUP_OF = {q: g for g, qs in PEDAL_GROUPS.items() for q in qs}


def options(groups, allow_none):
    singles = [[q] for qs in groups.values() for q in qs]
    names = list(groups)
    unions = [sum((groups[n] for n in combo), []) for k in range(1, len(names) + 1) for combo in itertools.combinations(names, k)]
    return ([[]] if allow_none else []) + singles + [u for u in unions if len(u) > 1]


def rules():
    out = []
    for pos in options(PEDAL_GROUPS, False):
        for neg in options(PEG_GROUPS, True):
            for stype in SCORE_TYPES:
                if stype == "group_mean_logit" and len({GROUP_OF[q] for q in pos}) < 2:
                    continue
                for w in WHOLE_WEIGHTS:
                    out.append((tuple(pos), tuple(neg), stype, w))
    return out


def score(row, rule):
    pos, neg, stype, w = rule
    v = row["prob"] if stype == "max_prob" else row["logit"]
    if stype == "group_mean_logit":
        groups = {}
        for q in pos:
            groups[GROUP_OF[q]] = max(groups.get(GROUP_OF[q], -math.inf), v[q])
        a = statistics.mean(groups.values())
    else:
        a = max(v[q] for q in pos)
    b = max(v[q] for q in neg) if neg else 0.0
    whole = max(v[q] for q in WHOLE_POS) - max(v[q] for q in WHOLE_NEG)
    return a - b + w * whole


def fit(scores, ys, skip=None):
    top_no = max(s for i, (s, y) in enumerate(zip(scores, ys)) if not y and i != skip)
    above = sorted(s for i, (s, y) in enumerate(zip(scores, ys)) if y and i != skip and s > top_no)
    spread = statistics.pstdev([s for i, s in enumerate(scores) if i != skip]) or 1.0
    if above:
        return (top_no + above[0]) / 2, len(above), (above[0] - top_no) / spread
    return top_no + 1e-6, 0, 0.0


def select(table, ys, skip=None):
    best = None
    for rule, scores in table.items():
        t, cleared, gap = fit(scores, ys, skip)
        key = (cleared, gap, -(len(rule[0]) + len(rule[1]) + (2 if rule[3] else 0)))
        if best is None or key > best[0]:
            best = (key, rule, t)
    return best[1], best[2]


def tally(rows, calls):
    def count(pred):
        sel = [(r, c) for r, c in zip(rows, calls) if pred(r)]
        return {"right": sum(1 for r, c in sel if c == r["y"]), "of": len(sel)}
    return {
        "overall": count(lambda r: True),
        "no_pedal": count(lambda r: not r["y"]),
        "pedal": count(lambda r: r["y"]),
        "hard_pedal_v2": count(lambda r: r["y"] and r["style"] in HARD),
        "real_world_v2": count(lambda r: r["setting"] == "real_world"),
        "v1": count(lambda r: r["set"] == "v1"),
        "v2_train": count(lambda r: r["set"] == "v2_train"),
        "v2_test_spent": count(lambda r: r["set"] == "v2_test"),
    }


def describe(rule, t):
    pos, neg, stype, w = rule
    return {"pedal_queries": list(pos), "peg_queries": list(neg), "score_type": stype, "whole_object_weight": w, "whole_object_queries": {"plus": WHOLE_POS, "minus": WHOLE_NEG}, "threshold": t}


def main():
    raw = json.load(open(sys.argv[1]))
    labels = {l["file"]: l for l in json.load(open(sys.argv[2]))}
    rows = []
    for p in raw["photos"]:
        name = p["file"].split("/")[-1]
        l = labels[name]
        rows.append({"file": name, "set": l["set"], "product": l["product"], "y": l["pedals"] == "yes", "style": l["style"], "setting": l["setting"], "logit": {q: v["logit"] for q, v in p["q"].items()}, "prob": {q: v["max"] for q, v in p["q"].items()}, "ms": p["ms"], "long_side": max(p["width"], p["height"])})
    full = len(rows) == 71
    ys = [r["y"] for r in rows]
    table = {rule: [score(r, rule) for r in rows] for rule in rules()}

    rule, t = select(table, ys)
    calls = [s >= t for s in table[rule]]
    apparent = tally(rows, calls)

    loo_calls, picks = [], {}
    for i in range(len(rows)):
        r_i, t_i = select(table, ys, skip=i)
        loo_calls.append(table[r_i][i] >= t_i)
        picks[r_i] = picks.get(r_i, 0) + 1
    loo = tally(rows, loo_calls)

    # Context only: the rule's best overall accuracy at any threshold, ignoring the no-pedal constraint.
    s_sorted = sorted(set(table[rule]))
    best_any = max(((sum((s >= c) == y for s, y in zip(table[rule], ys)), c) for c in s_sorted), key=lambda x: x[0])
    no_ok_at_best = sum(1 for s, y in zip(table[rule], ys) if not y and s < best_any[1])

    small = [r["ms"] for r in rows if r["long_side"] <= 1024]
    per_photo = sorted(({"file": r["file"], "set": r["set"], "product": r["product"], "pedals": "yes" if r["y"] else "no", "style": r["style"], "setting": r["setting"], "score": round(s, 4), "call": "pedals" if c else "no pedals", "right": c == r["y"]} for r, s, c in zip(rows, table[rule], calls)), key=lambda x: x["score"])
    report = {
        "photos": len(rows),
        "complete": full,
        "rule": describe(rule, t),
        "candidates_searched": len(table),
        "apparent_dev": apparent,
        "nested_leave_one_out": loo,
        "loo_rule_picks": [{"count": c, "rule": describe(r_, None)} for r_, c in sorted(picks.items(), key=lambda x: -x[1])[:5]],
        "context_best_threshold_any": {"right": best_any[0], "of": len(rows), "no_pedal_right": no_ok_at_best, "threshold": best_any[1]},
        "time_ms_20_queries": {"mean_all": round(statistics.mean(r["ms"] for r in rows)), "mean_long_side_le_1024": round(statistics.mean(small)) if small else None, "max": max(r["ms"] for r in rows)},
        "per_photo": per_photo,
    }
    if len(sys.argv) > 3:
        json.dump(report, open(sys.argv[3], "w"), indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != "per_photo"}, indent=1))


if __name__ == "__main__":
    main()
