import mammoth from "mammoth";

/**
 * The motion for a resolution inside an EP report DOCX, indexed the way a
 * voting list refers to it: citation N, recital X, paragraph N.
 *
 * A voting list's "original text" rows ("§ 2 | § | original text | RCV") vote
 * on the report's own text, so their Remarks must carry that text, in the
 * language the list is being prepared in. The report DOCX (one per language
 * under `distribution/reds_iPlRp/{ID}/{ID}_{lang}.docx`) is the source.
 *
 * The motion is the first `PageHeading` section that has citations ("–  visto
 * …" / "–  having regard to …") followed by numbered paragraphs — found by
 * shape, never by the heading's words, so it works in every language. Text
 * is kept verbatim; footnote markers are dropped.
 */

export interface MotionText {
  /** In document order; "Citation 6" is `citations[5]`. */
  citations: string[];
  /** Keyed by letter(s): "A", "B", … "AA". */
  recitals: Map<string, string>;
  /** Keyed by number. */
  paragraphs: Map<number, string>;
}

const STYLE_MAP = ["p[style-name='PageHeading'] => h1:fresh"];

function plain(html: string): string {
  return html
    .replace(/<sup>[\s\S]*?<\/sup>/gi, "") // footnote references
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "’")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const CITATION_RE = /^[–-]\s*(.+)$/;
const RECITAL_RE = /^([A-Z]{1,2})\.\s*(.+)$/;
const PARAGRAPH_RE = /^(\d+)\.\s*(.+)$/;

export async function parseMotionText(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<MotionText | null> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, { styleMap: STYLE_MAP });

  for (const section of html.split(/<h1>/i).slice(1)) {
    const motion: MotionText = { citations: [], recitals: new Map(), paragraphs: new Map() };
    for (const m of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const text = plain(m[1] ?? "");
      if (!text) continue;
      let r: RegExpExecArray | null;
      if ((r = CITATION_RE.exec(text))) motion.citations.push(r[1]!.trim());
      else if ((r = RECITAL_RE.exec(text))) motion.recitals.set(r[1]!, text);
      else if ((r = PARAGRAPH_RE.exec(text))) motion.paragraphs.set(Number(r[1]), text);
    }
    if (motion.citations.length && motion.paragraphs.size) return motion;
  }
  return null;
}

/**
 * The motion text a voting-list subject points at, or null when the subject
 * is not a plain reference ("After § 1" is a new paragraph — nothing to
 * quote; "§ 2 – parts" is handled by the split logic, not here).
 */
export function originalTextFor(subject: string, motion: MotionText): string | null {
  const s = subject.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(?:§|paragraph|paragrafo|par\.?)\s*(\d+)$/i.exec(s))) return motion.paragraphs.get(Number(m[1])) ?? null;
  if ((m = /^citation\s*(\d+)$/i.exec(s))) return motion.citations[Number(m[1]) - 1] ?? null;
  if ((m = /^(?:recital|considerando)\s*([A-Z]{1,2})$/i.exec(s))) return motion.recitals.get(m[1]!.toUpperCase()) ?? null;
  return null;
}
