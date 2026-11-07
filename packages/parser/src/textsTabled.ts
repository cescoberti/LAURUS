/**
 * The EP's "Texts tabled → Reports" page, which is where a report appears as
 * soon as it is tabled — the week before the plenary that votes it:
 *
 *   https://www.europarl.europa.eu/plenary/en/texts-submitted.html
 *
 * It is the authoritative pre-vote source for who the rapporteur is, and it
 * gives the FULL name ("Robert BIEDROŃ"), the responsible committees, the
 * procedure reference and the tabling date. The per-sitting VOT XML carries
 * names too, but only after the vote, which is no use to anyone preparing a
 * list.
 *
 * Each result is a `<div class="notice">` holding:
 *
 *   <p class="title"><a href="…A-10-2026-0277_EN.html">REPORT on …</a></p>
 *   <span class="date">20-10-2026</span>
 *   <span class="reference">A10-0277/2026</span>
 *   <span class="reference"><a …>2025/0227(COD)</a></span>
 *   <span class="acronym_comdel floatright" title="DEVE">DEVE</span>
 *   <p class="rapporteurs clearfix">Robert BIEDROŃ , Michael GAHLER</p>
 *
 * Parsed with regexes rather than a DOM library, like the rest of this package:
 * the markup is a flat, stable server-rendered list, and the alternative is a
 * dependency for one page.
 */

export interface TabledReport {
  /** `A10-0277/2026`. */
  code: string;
  /** Full names as the EP prints them: `["Robert BIEDROŃ", "Michael GAHLER"]`. */
  rapporteurs: string[];
  /** Responsible committees, in the order the page lists them. */
  committees: string[];
  title: string;
  /** `2025/0227(COD)`, when the report carries one. */
  procedureRef: string | null;
  /** Tabling date, ISO: `2026-10-20`. */
  tabledOn: string | null;
}

const NOTICE = /<div class="notice">([\s\S]*?)(?=<div class="notice">|<div id="content_r|<\/div>\s*<\/div>\s*<\/div>)/g;
const REFERENCE = /<span class="reference">\s*([^<]+?)\s*<\/span>/;
const PROCEDURE = /<span class="reference">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/;
const RAPPORTEURS = /<p class="rapporteurs[^"]*">([\s\S]*?)<\/p>/;
const COMMITTEE = /acronym_comdel[^>]*title="([^"]+)"/g;
const TITLE = /<p class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/;
const DATE = /<span class="date">[\s\S]*?(\d{2})-(\d{2})-(\d{4})/;
const CODE = /^[A-Z]\d+-\d+\/\d{4}$/;

/** Tags out, entities in, whitespace collapsed. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every report listed on the page, in the order it prints them. A notice whose
 * reference is not a report code is skipped rather than guessed at.
 */
export function parseTextsTabled(html: string): TabledReport[] {
  const out: TabledReport[] = [];
  for (const m of html.matchAll(NOTICE)) {
    const block = m[1] ?? "";
    const code = plain(REFERENCE.exec(block)?.[1] ?? "");
    if (!CODE.test(code)) continue;
    const rap = RAPPORTEURS.exec(block)?.[1];
    const date = DATE.exec(block);
    out.push({
      code,
      // The page separates co-rapporteurs with " , " — spaces and all.
      rapporteurs: rap
        ? plain(rap)
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
        : [],
      committees: [...block.matchAll(COMMITTEE)].map((c) => c[1]!).filter(Boolean),
      title: plain(TITLE.exec(block)?.[1] ?? ""),
      procedureRef: plain(PROCEDURE.exec(block)?.[1] ?? "") || null,
      tabledOn: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    });
  }
  return out;
}
