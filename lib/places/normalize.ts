// Turns a place name or a typed search into a plain lowercase key, so "Peñasquitos",
// "Carmel-by-the-Sea" and "St. Louis" match what people type.

/** Words that are written both ways in place names. Each maps to the form the key keeps. */
const SAME_WORD: Record<string, string> = {
  saint: "st",
  sainte: "ste",
  mount: "mt",
  fort: "ft",
};

function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’ʼ`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** The search key for a name: no accents, no punctuation, single spaces, and "Saint" as "st". */
export function normalizeName(text: string): string {
  return tokens(text)
    .map((t) => SAME_WORD[t] ?? t)
    .join(" ");
}

/** A half-typed long form this long or longer, like "sai" or "moun", is tried as its short form too. */
const PARTIAL_LONG_FORM_MIN = 3;

/**
 * The keys to try for a typed search. The last word may still be half typed, so "fort" is
 * tried both as "ft" (Fort Worth) and as itself (Fortuna). Since keys keep "st", "mt" and "ft",
 * a long form still being typed, like "Sain" or "Moun", is also tried as the short form followed
 * by a space, so it finds St. Louis and Mount Vernon before the word is done.
 */
export function queryVariants(text: string): string[] {
  const words = tokens(text);
  if (words.length === 0) return [];
  const head = words.slice(0, -1).map((t) => SAME_WORD[t] ?? t);
  const last = words[words.length - 1];
  const variants = [[...head, SAME_WORD[last] ?? last].join(" "), [...head, last].join(" ")];
  if (last.length >= PARTIAL_LONG_FORM_MIN && !(last in SAME_WORD)) {
    for (const [long, short] of Object.entries(SAME_WORD)) {
      if (long.startsWith(last)) variants.push(`${[...head, short].join(" ")} `);
    }
  }
  return [...new Set(variants)];
}
