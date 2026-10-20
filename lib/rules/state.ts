// State-level verdicts. The order of checks is built around the costly error,
// a "yes" for a bike or rider the table does not support. Anything the facts
// can't settle becomes a follow-up question or "can't confirm".

import {
  compare,
  evaluateCondition,
  FIELD_QUESTION,
  parseCondition,
  unknownFields,
  type ConditionNode,
  type Env,
} from "./condition";
import { getState, type CompiledCaution, type CompiledState } from "./compile";
import { inWindow } from "./dates";
import { factsEnv, ratedWattsInterval } from "./facts";
import {
  CAUTION_FAST_MODE_UNVERIFIED,
  CLASS_KEYS,
  type BikeFacts,
  type ClassNum,
  type EngineInput,
  type Line,
  type QuestionId,
  type Source,
  type Status,
  type Verdict,
} from "./types";

/** Every class caps the motor alone at 20 mph, and pedal assist tops out at 28 mph. */
const GENERIC_FAST_MODE: ConditionNode = parseCondition(
  "motor_only_max_mph > 20 or switchable_out_of_class",
);
const MAX_ASSIST_ANY_CLASS = 28;
/** The speeds a class label itself promises. State-specific limits are handled by verdict_cautions. */
const LABEL_CLASS_MAX: Record<ClassNum, number> = { 1: 20, 2: 20, 3: 28 };
const WATTS_PER_HP = 745.7;

type DeviceStatus = "ok" | "not_ebike" | "cant_confirm" | "need_info";

interface DeviceResult {
  status: DeviceStatus;
  reason: Line | null;
  questions: QuestionId[];
  cautions: Line[];
}

interface RiderResult {
  status: "yes" | "no";
  reason: Line | null;
  requirements: Line[];
}

export interface ClassOutcome {
  cls: ClassNum;
  status: Status;
  reason: Line;
  requirements: Line[];
  cautions: Line[];
  questions: QuestionId[];
}

export interface StateEvaluation {
  verdict: Verdict;
  classesKnown: boolean;
  outcomes: ClassOutcome[];
}

const SEVERITY: Record<Status, number> = {
  not_ebike: 4,
  no: 3,
  cant_confirm: 2,
  need_info: 1,
  yes: 0,
};

function line(code: string, params?: Line["params"], source?: Source, detail?: string | null): Line {
  return { code, params, source, detail: detail ?? null };
}

function classMatches(appliesTo: string, cls: ClassNum): boolean {
  return appliesTo === "all_ebikes" || appliesTo === CLASS_KEYS[cls];
}

/** Picks the sub-condition that made an "or" true, so the headline names the real reason. */
function deciding(node: ConditionNode, env: Env): ConditionNode {
  if (node.t === "or") {
    if (evaluateCondition(node.a, env) === true) return deciding(node.a, env);
    if (evaluateCondition(node.b, env) === true) return deciding(node.b, env);
  }
  return node;
}

function topicOf(node: ConditionNode | null, caution: CompiledCaution): string {
  if (caution.riderUnderAge !== null) return "class_age_unclear";
  if (!node) return caution.verdict === "not_an_ebike" ? "class_not_recognized" : "class_unclear";
  const text = JSON.stringify(node);
  if (text.includes("wheel_diameter")) return "wheel_size";
  if (text.includes("wheel_count")) return "trike";
  if (text.includes("has_foot_pegs")) return "foot_pegs";
  if (text.includes("needs_pedal_kit")) return "pedal_kit";
  if (text.includes("bike_weight_lb")) return "weight";
  if (text.includes("label_watts")) return "watts_hp";
  return "fast_mode";
}

function cautionLine(caution: CompiledCaution, env: Env, cls: ClassNum): Line {
  const node = caution.node ? deciding(caution.node, env) : null;
  return line(
    `caution_${topicOf(node, caution)}`,
    { cls, verdict: caution.verdict },
    caution.source,
    caution.reason,
  );
}

function checkWatts(cs: CompiledState, f: BikeFacts, date: string): DeviceResult | null {
  const iv = ratedWattsInterval(f);
  const { comparison, maxWatts, maxHp } = cs.def;
  const ok = null;
  if (comparison === "no_watt_cap") return ok;

  // Rhode Island caps power in horsepower. Compare conservatively in watts.
  if (maxWatts === null && maxHp !== null) {
    const capW = maxHp * WATTS_PER_HP;
    if (compare(iv, "<", capW) === true) return ok;
    if (f.ratedWatts === null && f.peakWatts === null && f.wattsUpTo === null) {
      return device("cant_confirm", line("watts_unknown", undefined, cs.def.source));
    }
    return device("cant_confirm", line("hp_cap_unclear", { hp: maxHp }, cs.def.source));
  }
  if (maxWatts === null) return ok;

  const strict = comparison === "less_than";
  const within = strict ? compare(iv, "<", maxWatts) : compare(iv, "<=", maxWatts);
  if (within === true) return ok;

  const fallback = cs.wattFallbacks.find(
    (w) =>
      (w.from === null || date >= w.from) &&
      iv.lo >= w.min_watts &&
      (w.max_watts === null || iv.hi <= w.max_watts),
  );

  if (compare(iv, ">", maxWatts) === true || (strict && compare(iv, ">=", maxWatts) === true)) {
    if (fallback) {
      return device(
        "not_ebike",
        line(fallback.code, { watts: iv.lo }, { citation: cs.def.source.citation, url: cs.def.source.url, quote: fallback.source_quote, kind: "rules_table" }),
      );
    }
    if (compare(iv, ">", maxWatts) === true) {
      return device(
        "not_ebike",
        line("over_watts", { watts: iv.lo, cap: maxWatts, strict: strict ? 1 : 0 }, cs.def.source),
      );
    }
    return device("cant_confirm", line("watts_750_strict", { cap: maxWatts }, cs.def.source));
  }

  if (f.ratedWatts === null && f.peakWatts !== null) {
    return device("cant_confirm", line("watts_peak_only", { peak: f.peakWatts, cap: maxWatts }, cs.def.source));
  }
  if (f.ratedWatts === null && f.wattsUpTo !== null) {
    return device("cant_confirm", line("watts_upper_only", { watts: f.wattsUpTo, cap: maxWatts }, cs.def.source));
  }
  return device("cant_confirm", line("watts_unknown", undefined, cs.def.source));
}

function device(status: DeviceStatus, reason: Line | null, questions: QuestionId[] = [], cautions: Line[] = []): DeviceResult {
  return { status, reason, questions, cautions };
}

/**
 * The fastest speed the text states, for pedal assist or for a mode it doesn't name. A top
 * speed of unknown mode still counts when an assist speed is also given, so adding a slower
 * assist figure can never hide a faster one.
 */
function fastestStated(f: BikeFacts): number | null {
  const speeds = [f.assistMph, f.topSpeedMph].filter((v): v is number => v !== null);
  return speeds.length > 0 ? Math.max(...speeds) : null;
}

/**
 * True when the bike has a throttle, or when the throttle answer is "not sure" but a throttle
 * speed is still stated. A less certain answer must never make the verdict stronger.
 */
function throttleLikely(f: BikeFacts): boolean {
  return f.hasThrottle === true || (f.hasThrottle === null && f.throttleMph !== null);
}

/**
 * True when the label names no Class 2 and the throttle answer is blank or "not sure". Class 1
 * and 3 help only while the rider pedals, so a YES needs a clear "no throttle". A blank answer
 * must never do better than a "yes", which is a class conflict.
 */
function throttleOpen(f: BikeFacts, classes: ClassNum[]): boolean {
  return f.hasThrottle === null && classes.length > 0 && !classes.includes(2);
}

function evaluateDevice(
  cs: CompiledState,
  f: BikeFacts,
  env: Env,
  cls: ClassNum,
  age: number,
  date: string,
  noThrottleUnconfirmed: boolean,
): DeviceResult {
  // Definite "not an e-bike" answers win over "can't confirm", so they are checked first.
  const watts = checkWatts(cs, f, date);
  if (watts?.status === "not_ebike") return watts;

  let unclear: Line | null = watts?.reason ?? (noThrottleUnconfirmed ? line("throttle_unknown", { cls }) : null);
  const questions = new Set<QuestionId>();
  const cautions: Line[] = [];

  const fastest = fastestStated(f);
  if (fastest !== null && fastest > MAX_ASSIST_ANY_CLASS) {
    unclear = unclear ?? line("fits_no_class_speed", { mph: fastest });
  }

  for (const caution of cs.cautions) {
    if (!inWindow(date, caution.window)) continue;
    if (!classMatches(caution.appliesTo, cls)) continue;
    if (caution.riderUnderAge !== null && !(age < caution.riderUnderAge)) continue;

    const result = caution.node ? evaluateCondition(caution.node, env) : true;
    if (result === true) {
      const reason = cautionLine(caution, env, cls);
      if (caution.verdict === "not_an_ebike") return device("not_ebike", reason);
      unclear = unclear ?? reason;
      continue;
    }
    if (result === null && caution.node) {
      const asked = unknownFields(caution.node, env)
        .map((field) => FIELD_QUESTION[field])
        .filter((q): q is QuestionId => q !== null && q !== undefined);
      const pending = asked.filter((q) => !f.unsure.includes(q));
      if (pending.length > 0) {
        pending.forEach((q) => questions.add(q));
      } else {
        const topic = topicOf(caution.node, caution);
        unclear = unclear ?? line(`unsure_${topic}`, { cls, verdict: caution.verdict }, caution.source, caution.reason);
      }
    }
  }

  const fast = evaluateCondition(GENERIC_FAST_MODE, env);
  if (fast === true) {
    unclear = unclear ?? line("fits_no_class_mode");
  } else if (fast === null) {
    if (!f.unsure.includes("fast_mode")) {
      questions.add("fast_mode");
    } else if (cs.fastModeExplicit) {
      unclear = unclear ?? line("unsure_fast_mode", { cls });
    } else {
      cautions.push(line(CAUTION_FAST_MODE_UNVERIFIED));
    }
  }

  if (unclear) return device("cant_confirm", unclear, [], cautions);
  if (questions.size > 0) return device("need_info", line("need_info"), [...questions], cautions);
  return device("ok", null, [], cautions);
}

function evaluateRider(cs: CompiledState, cls: ClassNum, age: number, date: string): RiderResult {
  const requirements: Line[] = [];
  let block: { line: Line; absolute: boolean; minAge: number } | null = null;

  for (const rule of cs.ages) {
    if (!inWindow(date, rule.window)) continue;
    if (!classMatches(rule.appliesTo, cls)) continue;
    if (age >= rule.minAge) continue;
    if (rule.exception && age >= rule.exception.fromAge) {
      requirements.push(
        line(
          rule.exception.type === "supervision" ? "req_supervision" : "req_supervision_or_certificate",
          { minAge: rule.minAge },
          rule.source,
          rule.exception.quote,
        ),
      );
      continue;
    }
    const candidate = {
      line: line(
        rule.licenseBars ? "under_min_age_license" : "under_min_age",
        { minAge: rule.minAge, cls: rule.appliesTo === "all_ebikes" ? 0 : cls },
        rule.source,
        rule.detail,
      ),
      absolute: rule.exception === null,
      minAge: rule.minAge,
    };
    const better =
      !block ||
      (candidate.absolute && !block.absolute) ||
      (candidate.absolute === block.absolute && candidate.minAge > block.minAge);
    if (better) block = candidate;
  }
  if (block) return { status: "no", reason: block.line, requirements: [] };

  const helmets = cs.helmets.filter(
    (h) =>
      inWindow(date, h.window) &&
      classMatches(h.appliesTo, cls) &&
      (h.allAges || (h.underAge !== null && age < h.underAge)),
  );
  const allAges = helmets.find((h) => h.allAges);
  if (allAges) {
    requirements.push(line("req_helmet_all_ages", { cls }, allAges.source));
  } else if (helmets.length > 0) {
    const strictest = helmets.reduce((a, b) => ((a.underAge ?? 0) >= (b.underAge ?? 0) ? a : b));
    requirements.push(line("req_helmet_under", { underAge: strictest.underAge ?? 0 }, strictest.source));
  }

  if (cls === 3) {
    for (const e of cs.class3Equipment) requirements.push(line(e.code, { definition: e.definition ? 1 : 0 }, e.source));
  }

  const key = CLASS_KEYS[cls];
  const until = cs.license.byClassUntil[key];
  const useByClass = cs.license.byClass !== null && (until === undefined || date < until);
  const flags = useByClass && cs.license.byClass ? cs.license.byClass[key] : cs.license.flags;
  if (flags.license_required) {
    requirements.push(line(cs.licenseDetailCode ?? "req_license", { age }, cs.license.source));
  }
  if (flags.registration_required) requirements.push(line("req_registration", undefined, cs.license.source));
  if (flags.insurance_required) requirements.push(line("req_insurance", undefined, cs.license.source));

  return { status: "yes", reason: null, requirements };
}

function combineClass(cs: CompiledState, cls: ClassNum, dev: DeviceResult, rider: RiderResult, age: number): ClassOutcome {
  // A device "not an e-bike" beats everything. A rider who is too young gets "no" even
  // when the bike itself is still uncertain, because no answer about the bike changes that.
  const base = { cls, requirements: [] as Line[], cautions: dev.cautions, questions: [] as QuestionId[] };
  if (dev.status === "not_ebike" && dev.reason) {
    return { ...base, status: "not_ebike", reason: { ...dev.reason, params: { ...dev.reason.params, treatedAs: cs.nonEbike.treatedAs ?? "" } } };
  }
  if (rider.status === "no" && rider.reason) {
    return { ...base, status: "no", reason: rider.reason };
  }
  if (dev.status === "cant_confirm" && dev.reason) {
    return { ...base, status: "cant_confirm", reason: dev.reason };
  }
  if (dev.status === "need_info") {
    return { ...base, status: "need_info", reason: line("need_info"), questions: dev.questions };
  }
  const cautions = [...dev.cautions];
  if (cls === 2 && cs.stopPedalingClass2) {
    cautions.push(line("caution_stop_pedaling_class2", undefined, cs.def.source));
  }
  return {
    ...base,
    status: "yes",
    reason: line("allowed", { cls, age }, cs.def.source),
    requirements: rider.requirements,
    cautions,
  };
}

function determineClasses(f: BikeFacts): { classes: ClassNum[]; problem: Line | null } {
  const fastest = fastestStated(f);
  if (f.classes.length > 0) {
    const classes = [...new Set(f.classes)].sort() as ClassNum[];
    if (throttleLikely(f) && !classes.includes(2)) {
      return { classes, problem: line("class_conflict_throttle", { cls: classes[classes.length - 1] }) };
    }
    const cap = Math.max(...classes.map((c) => LABEL_CLASS_MAX[c]));
    if (fastest !== null && fastest > cap && fastest <= MAX_ASSIST_ANY_CLASS) {
      return { classes, problem: line("class_conflict_speed", { cls: classes[classes.length - 1], mph: fastest }) };
    }
    return { classes, problem: null };
  }
  if (f.hasThrottle === false && fastest !== null) {
    if (fastest <= 20) return { classes: [1], problem: null };
    if (fastest <= MAX_ASSIST_ANY_CLASS) return { classes: [3], problem: null };
  }
  if (
    f.hasThrottle === true &&
    f.throttleMph !== null &&
    f.throttleMph <= 20 &&
    f.assistMph !== null &&
    f.assistMph <= 20 &&
    (f.topSpeedMph === null || f.topSpeedMph <= 20)
  ) {
    return { classes: [2], problem: null };
  }
  return { classes: [], problem: line("class_unknown") };
}

function sourcesOf(lines: Line[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const l of lines) {
    if (!l.source || (!l.source.citation && !l.source.url)) continue;
    const key = `${l.source.citation ?? ""}|${l.source.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l.source);
  }
  return out;
}

function upcomingNotes(cs: CompiledState, date: string): Line[] {
  return cs.scheduled
    .filter((c) => c.effective_date > date)
    .map((c) =>
      line("upcoming_change", { date: c.effective_date, change: c.code }, {
        citation: c.bill,
        url: c.source_url,
        effective: c.effective_date,
        kind: "bill",
      }),
    );
}

function worst(outcomes: ClassOutcome[]): ClassOutcome {
  return outcomes.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a));
}

function aggregateUnknownClass(outcomes: ClassOutcome[], problem: Line): ClassOutcome {
  const blocked = outcomes.every((o) => o.status === "no" || o.status === "not_ebike");
  if (outcomes.every((o) => o.status === "not_ebike")) return outcomes[0];
  if (blocked) {
    return {
      cls: 3,
      status: "no",
      reason: line("no_any_class"),
      requirements: [],
      cautions: [],
      questions: [],
    };
  }
  return { cls: 3, status: "cant_confirm", reason: problem, requirements: [], cautions: [], questions: [] };
}

function baseVerdict(cs: CompiledState): Omit<Verdict, "status" | "reason"> {
  return {
    scope: "state",
    id: cs.code,
    requirements: [],
    cautions: [],
    notes: [],
    questions: [],
    classes: [],
    sources: [],
    lastChecked: cs.lastChecked,
    verified: cs.confidence,
  };
}

export function evaluateState(input: EngineInput): StateEvaluation {
  const cs = getState(input.state);
  const f = input.facts;
  const date = input.rideDate;
  const age = input.riderAge;
  const base = baseVerdict(cs);
  const notes = upcomingNotes(cs, date);

  const finish = (outcome: ClassOutcome, outcomes: ClassOutcome[], classesKnown: boolean, extraNotes: Line[] = []): StateEvaluation => {
    const allNotes = [...extraNotes, ...notes];
    if (outcome.status === "yes") {
      if (cs.ageStatus === "none_in_state_law") allNotes.unshift(line("no_state_min_age"));
      if (cs.helmetStatus === "none_in_state_law") allNotes.unshift(line("no_state_helmet"));
    }
    const cautions = [...outcome.cautions];
    if (cs.helmetStatus === "unknown") cautions.push(line("caution_helmet_unknown"));
    if (outcome.status === "no" && outcome.reason.code === "no_any_class") {
      allNotes.unshift(...outcomes.map((o) => ({ ...o.reason, params: { ...o.reason.params, cls: o.cls } })));
    }
    const lines = [outcome.reason, ...outcome.requirements, ...cautions, ...allNotes];
    if (outcome.status === "not_ebike") lines.push({ code: "treated_as", source: cs.nonEbike.source });
    return {
      verdict: {
        ...base,
        status: outcome.status,
        reason: outcome.reason,
        requirements: outcome.requirements,
        cautions,
        notes: allNotes,
        questions: outcome.questions,
        classes: classesKnown ? [...new Set(outcomes.map((o) => o.cls))] : [],
        sources: sourcesOf(lines),
      },
      classesKnown,
      outcomes,
    };
  };

  const single = (status: Status, reason: Line): StateEvaluation =>
    finish({ cls: 3, status, reason, requirements: [], cautions: [], questions: [] }, [], false);

  if (cs.neverLegal) {
    if (cs.def.requiresPedals === true && f.hasPedals === false) {
      return single("not_ebike", line("no_pedals", { treatedAs: cs.nonEbike.treatedAs ?? "" }, cs.def.source));
    }
    return single("cant_confirm", line("never_legal", undefined, cs.def.source, cs.neverLegalReason));
  }
  if (f.hasPedals === false) {
    return cs.def.requiresPedals === true
      ? single("not_ebike", line("no_pedals", { treatedAs: cs.nonEbike.treatedAs ?? "" }, cs.def.source))
      : single("cant_confirm", line("no_pedals_unclear", undefined, cs.def.source));
  }
  if (f.hasPedals === null) {
    return single("cant_confirm", line("pedals_unknown"));
  }

  const fe = factsEnv(f);
  if (fe.conflict) return single("cant_confirm", line("facts_conflict"));

  const { classes, problem } = determineClasses(f);
  const classesKnown = classes.length > 0 && problem === null;
  // When the class is unknown or contradicted, the bike could be any class, so check all three.
  const candidates: ClassNum[] = classesKnown ? classes : [1, 2, 3];

  const noThrottleUnconfirmed = classesKnown && throttleOpen(f, classes);
  const outcomes = candidates.map((cls) => {
    const dev = evaluateDevice(cs, f, fe.env, cls, age, date, noThrottleUnconfirmed);
    const rider = evaluateRider(cs, cls, age, date);
    if (!classesKnown && dev.status !== "not_ebike") {
      const unknown = device("cant_confirm", problem ?? line("class_unknown"), [], dev.cautions);
      return combineClass(cs, cls, unknown, rider, age);
    }
    return combineClass(cs, cls, dev, rider, age);
  });

  if (!classesKnown) {
    return finish(aggregateUnknownClass(outcomes, problem ?? line("class_unknown")), outcomes, false);
  }

  const decided = worst(outcomes);
  if (decided.status === "yes" && outcomes.length > 1) {
    const top = outcomes[outcomes.length - 1];
    return finish(
      {
        ...top,
        reason: line("allowed", { cls: top.cls, age, multi: outcomes.map((o) => o.cls).join("/") }, cs.def.source),
        requirements: dedupeLines(outcomes.flatMap((o) => o.requirements)),
        cautions: dedupeLines(outcomes.flatMap((o) => o.cautions)),
      },
      outcomes,
      true,
    );
  }
  if (decided.status === "need_info") {
    const questions = [...new Set(outcomes.flatMap((o) => o.questions))];
    return finish({ ...decided, questions }, outcomes, true);
  }
  return finish(decided, outcomes, true);
}

function dedupeLines(lines: Line[]): Line[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = `${l.code}|${JSON.stringify(l.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
