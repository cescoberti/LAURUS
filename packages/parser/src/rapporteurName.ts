/**
 * How a rapporteur's name is shown wherever LAURUS shows one.
 *
 * Site-wide rule: a file is presented as a hierarchy — MEP surname (UPPER
 * CASE), then the file name (subject), then the code. This resolves the label
 * for that first line, and the same label names the documents LAURUS hands
 * back ("STAĶIS DEL ITA.docx").
 *
 * It lives here, and not in the web app, because it is also the only sane unit
 * of comparison between sources. `items.rapporteur` is filled by whichever
 * sync reaches a row first and they do not agree on form — the agenda prints
 * "Aurelijus Veryga", the votes page "STAĶIS", open data "Mārtiņš STAĶIS".
 * Compared as raw strings those are three disagreements; compared as the site
 * renders them, two are the same name written differently and only a missing
 * co-rapporteur is a real difference. See `sync-texts-tabled --check`.
 */

// Lower-case surname particles that stay attached to the family name
// ("van Luik", "de Vroede", "do Nascimento").
const PARTICLES = new Set([
  "van", "von", "de", "den", "der", "del", "della", "di", "da", "do", "dos",
  "das", "du", "le", "la", "ten", "ter", "af", "av", "zu", "of",
]);

/**
 * One-letter words that join or open a family name: the Catalan and Spanish
 * conjunctions in "Comín i Oliveres" and "Ortega y Gasset", the Portuguese one,
 * and the Irish "Ó". They are read only where the source capitalises the
 * surname, because in a name with no capitals to go by a lone letter is far
 * more likely to be a middle initial than part of anyone's surname.
 */
const JOINERS = new Set(["i", "y", "e", "ó"]);

/**
 * A token the source shouted: two letters or more, no lower case among them.
 * The length test keeps initials ("J.") out, and comparing against both cases
 * keeps out tokens with no cased letters at all.
 */
function shouted(token: string): boolean {
  const letters = token.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && token === token.toUpperCase() && token !== token.toLowerCase();
}

/** A word that attaches to the family name beside it. */
function joins(token: string): boolean {
  const w = token.toLowerCase();
  return PARTICLES.has(w) || JOINERS.has(w);
}

/**
 * Surname portion of a name, keeping every word of it.
 *
 * The EP shouts the family name and only the family name: open data writes
 * "Juan Fernando LÓPEZ AGUILAR", the votes page writes "STAĶIS". So where
 * there is capitalisation to read, read it — the surname is the shouted run,
 * however many words long, plus any particle leading into it. All 747 members
 * of the tenth term are written that way, and 58 of them carry a surname of
 * two words or more.
 *
 * Guessing from position instead is what this replaces, and it was wrong for
 * every Spanish and Portuguese double surname in the house: it kept the last
 * word and dropped the first, so López Aguilar was filed under AGUILAR and
 * García Hermida-van der Walle under DER WALLE. Half of a person's name, on
 * the documents they are handed.
 *
 * Two cases leave nothing to read. A source that shouts the whole string is
 * giving the family name alone, so all of it is kept. A source that shouts
 * nothing — the agenda's "Aurelijus Veryga" — is genuinely ambiguous, and
 * there the last word is still the best available guess; it is also why the
 * ingest side prefers the open-data form when it can get it.
 */
function surname(name: string): string {
  const t = name.trim().split(/\s+/);
  if (t.length <= 1) return name.trim();

  const caps = t.map(shouted);
  if (caps.every(Boolean)) return t.join(" ");

  let start: number;
  let end: number;
  if (caps.some(Boolean)) {
    // Walk back from the last shouted word over anything that belongs to a
    // family name: more shouted words, particles, and the joining letters.
    // "Antoni COMÍN I OLIVERES" is one surname of three words, not OLIVERES.
    end = caps.lastIndexOf(true);
    start = end;
    while (start > 0 && (caps[start - 1]! || joins(t[start - 1]!))) start--;
  } else {
    // Nothing is shouted: assume the first token is the given name and take
    // the last one, as before.
    end = t.length - 1;
    start = end;
    if (start <= 1) return t.slice(1).join(" ");
  }
  while (start > 0 && PARTICLES.has(t[start - 1]!.toLowerCase())) start--;
  return t.slice(start, end + 1).join(" ");
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
