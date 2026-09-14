/** Where the EP distributes the files LAURUS reads — pure string rules. */

export const EP_BASE = "https://data.europarl.europa.eu";

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
