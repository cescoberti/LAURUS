// Site-wide rule: a file is presented as a hierarchy — MEP surname (UPPER CASE),
// then the file name (subject), then the code. This resolves the display label
// for the first line: the rapporteur's surname(s), upper-cased.

// Lower-case surname particles that stay attached to the family name
// ("van Luik", "de Vroede", "do Nascimento").
const PARTICLES = new Set([
  "van", "von", "de", "den", "der", "del", "della", "di", "da", "do", "dos",
  "das", "du", "le", "la", "ten", "ter", "af", "av", "zu", "of",
]);

/** Surname portion of a "Given Family" name, keeping leading particles. */
function surname(name: string): string {
  const t = name.trim().split(/\s+/);
  if (t.length <= 1) return name.trim();
  // Assume the first token is the given name; walk back from the end so any
  // particle chain ("van der") stays with the family name.
  let start = t.length - 1;
  while (start > 1 && PARTICLES.has(t[start - 1].toLowerCase())) start--;
  return t.slice(start).join(" ");
}

/**
 * Display label for a file's rapporteur: surname(s) in upper case. Handles
 * several co-rapporteurs separated by commas (e.g. "Fourlas, Razza"). Returns
 * null when there is no rapporteur so callers can show a placeholder.
 */
export function rapporteurLabel(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return name
    .split(",")
    .map((part) => surname(part).toUpperCase())
    .filter(Boolean)
    .join(", ");
}

/** Diacritics folded and anything a file name cannot carry dropped. */
function asciiName(label: string): string {
  return label
    .replace(/\//g, "-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stem for a file LAURUS hands back: the rapporteur's surname(s), then who the
 * file is for — `DEL ITA` when the content is Italian, so it is the version
 * that goes to the Italian delegation as it is, the language code otherwise.
 *
 * These files land in a folder held per session, where several rapporteurs'
 * documents sit side by side, so the surname is the handle that finds one
 * again and the suffix says at a glance whether it still needs translating.
 * `fallback` is used when the file has no rapporteur — the report code.
 */
export function fileStem(rapporteur: string | null | undefined, language: string, fallback: string): string {
  const who = rapporteurLabel(rapporteur) ?? fallback;
  const lang = language.toLowerCase();
  return `${asciiName(who)} ${lang === "it" ? "DEL ITA" : lang.toUpperCase()}`;
}
