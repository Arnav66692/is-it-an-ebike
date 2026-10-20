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

/**
 * The keys to try for a typed search. The last word may still be half typed, so "fort" is
 * tried both as "ft" (Fort Worth) and as itself (Fortuna).
 */
export function queryVariants(text: string): string[] {
  const words = tokens(text);
  if (words.length === 0) return [];
  const full = words.map((t) => SAME_WORD[t] ?? t).join(" ");
  const lastAsTyped = [...words.slice(0, -1).map((t) => SAME_WORD[t] ?? t), words[words.length - 1]].join(" ");
  return full === lastAsTyped ? [full] : [full, lastAsTyped];
}
