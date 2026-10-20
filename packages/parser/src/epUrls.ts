/** Where the EP distributes the files LAURUS reads — pure string rules. */

export const EP_BASE = "https://data.europarl.europa.eu";
/** The public site, where a person reads a file rather than a client fetching it. */
export const EP_WWW = "https://www.europarl.europa.eu";

/**
 * The EP's own page for a plenary file, for a reader rather than a parser:
 * the text, and for a committee report the amendments tabled on it.
 *
 * Two shapes, because the EP keeps two. A committee report (A-…) has a
 * report-details page keyed by the display code with dashes —
 * `?reference=A10-0272-2026` — and that is the one worth linking, because it
 * puts the amendments beside the text. A motion for a resolution (B-…) has
 * no such page: the same URL 301s to a legacy `sides/getDoc.do` that answers
 * 404, so it goes to its DOCEO document instead. Both verified 2026-10-20 on
 * A10-0272/2026 and B10-0468/2026, in English and Italian.
 */
export function plenaryFileUrl(code: string, language = "en"): string | null {
  const m = /^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/.exec(code.trim());
  if (!m) return null;
  const [, prefix, term, num, year] = m;
  const lang = language.toLowerCase();
  if (prefix === "A") return `${EP_WWW}/plenary/${lang}/report-details.html?reference=${prefix}${term}-${num}-${year}`;
  return `${EP_WWW}/doceo/document/${prefix}-${term}-${year}-${num!.padStart(4, "0")}_${lang.toUpperCase()}.html`;
}

/**
 * DOCX of one plenary amendment block (`A-10-2026-0224-AM-003-008`).
 * Amendments to a report (A-…) live under `reds_iPlRp_Amd`, amendments to a
 * motion for a resolution (B-…) under `reds_iPlRe_Amd`. Verified 2026-09-14
 * on B-10-2026-0390-AM-001-003 (404 on the report store, 200 on the
 * resolution store).
 */
export function amendmentBlockUrl(identifier: string, language: string): string {
  const store = identifier.startsWith("B-") ? "reds_iPlRe_Amd" : "reds_iPlRp_Amd";
  return `${EP_BASE}/distribution/${store}/${identifier}/${identifier}_${language}.docx`;
}

/**
 * DOCX of the text itself: a report (A-…) under `reds_iPlRp`, a motion for a
 * resolution (B-…) under `reds_iPlRe`. Same split as the amendment stores.
 */
export function documentTextUrl(identifier: string, language: string): string {
  const store = identifier.startsWith("B-") ? "reds_iPlRe" : "reds_iPlRp";
  return `${EP_BASE}/distribution/${store}/${identifier}/${identifier}_${language.toLowerCase()}.docx`;
}
