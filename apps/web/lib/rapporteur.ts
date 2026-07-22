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
