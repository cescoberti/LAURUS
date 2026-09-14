/**
 * The EP's "Order and lists of votes" page (plenary/en/votes.html): during a
 * plenary week it lists, per sitting day, every file to be voted with its
 * Tabling Service voting list (PDF + DOCX) and a version label — "initial",
 * "REVISED VERSION", "FINAL VERSION". Outside plenary weeks the slots are
 * empty. Verified 2026-09-14 (September I part-session).
 *
 * The DOCX is bot-gated like DOCEO: it needs a browser User-Agent and the
 * page as Referer, else the server answers 202 with an empty body.
 */

export interface VotesPageEntry {
  code: string; // 'A10-0224/2026' — or 'B10-0390' when the page gives no year
  rapporteur: string | null; // 'HALICKI'
  title: string | null;
  day: string | null; // ISO date of the sitting the file is scheduled on
  docxUrl: string | null;
  pdfUrl: string | null;
  versionLabel: string | null; // 'FINAL VERSION'
}

export const VOTES_PAGE_URL = "https://www.europarl.europa.eu/plenary/en/votes.html";

/** Headers that get past the EP's bot gate for votes.html and its files. */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,it;q=0.8",
  Referer: VOTES_PAGE_URL,
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Tuesday, 15 September 2026" → "2026-09-15" */
function isoDay(heading: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(heading);
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

export function parseVotesPage(html: string): VotesPageEntry[] {
  const out: VotesPageEntry[] = [];
  // Walk the page in order: a day heading sets the current sitting; each
  // notice block is one file.
  const tokens = html.matchAll(/<h3 class="collapsible[^"]*"[^>]*>([\s\S]*?)<\/h3>|<!-- start notice -->([\s\S]*?)<!-- end notice -->/gi);
  let day: string | null = null;
  for (const t of tokens) {
    if (t[1] !== undefined) {
      const d = isoDay(text(t[1]));
      if (d) day = d;
      continue;
    }
    const block = t[2] ?? "";
    const docxUrl = /href="([^"]+\.docx[^"]*)"/i.exec(block)?.[1]?.replace(/&amp;/g, "&") ?? null;
    // Reports carry the code in a reference span; motions/objections put a
    // code (often the Commission's C document) where the rapporteur goes and
    // the file name is the only place the B code may appear — so the code can
    // come back without its "/year", to be matched by prefix.
    const code =
      /<span class="reference">\s*(?:<span class="reference">)?\s*([A-Z]+\d+-\d+\/\d{4})/i.exec(block)?.[1] ??
      /<p class="rapporteurs">\s*([A-Z]+\d+-\d+\/\d{4})\s*<\/p>/i.exec(block)?.[1] ??
      (docxUrl ? /\/votingList\/\(?([A-Z]+\d+-\d{4})(?:_(\d{4}))?/i.exec(docxUrl) : null)?.slice(1).filter(Boolean).join("/") ??
      null;
    if (!code) continue;
    const pdfUrl = /href="([^"]+\.pdf[^"]*)"/i.exec(block)?.[1]?.replace(/&amp;/g, "&") ?? null;
    // Label as printed next to the files ("FINAL VERSION [budget]"); the DOCX
    // URL carries the same label as ?version=.
    const printed = /<p class="themes float">([\s\S]*?)<\/p>/i.exec(block)?.[1];
    const fromUrl = docxUrl ? /[?&]version=([^&]+)/.exec(docxUrl)?.[1] : null;
    const versionLabel =
      (printed ? text(printed).replace(/\s*\[[^\]]*\]\s*$/, "").trim() : "") ||
      (fromUrl ? decodeURIComponent(fromUrl.replace(/\+/g, " ")) : null);
    out.push({
      code,
      rapporteur: /<p class="rapporteurs">([\s\S]*?)<\/p>/i.exec(block)?.[1] ? text(/<p class="rapporteurs">([\s\S]*?)<\/p>/i.exec(block)![1]!) || null : null,
      title: /<p class="title bold">([\s\S]*?)<\/p>/i.exec(block)?.[1] ? text(/<p class="title bold">([\s\S]*?)<\/p>/i.exec(block)![1]!) || null : null,
      day,
      docxUrl,
      pdfUrl,
      versionLabel: versionLabel || null,
    });
  }
  return out;
}
