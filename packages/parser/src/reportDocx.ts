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
  /**
   * The lettered points under a paragraph, and the roman sub-points under
   * those, each its own paragraph in the DOCX and each its own row in a
   * voting list. Keyed "15.f" and "22.b.i".
   *
   * A budget report is mostly these: paragraph 15 of A10-0272/2026 is one
   * line of chapeau over a dozen "(a) … (b) …" points carrying the actual
   * figures. Indexing only the chapeau left every row that votes on a point
   * with an empty Remarks column.
   */
  points: Map<string, string>;
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
const POINT_RE = /^\(([a-z])\)\s*(.+)$/;
// Lower-case roman only: a recital opens "A." / "AA." in capitals, so the two
// never collide, and the sub-point is only read while a point is open anyway.
const SUBPOINT_RE = /^([ivxl]+)\.\s*(.+)$/;

export async function parseMotionText(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<MotionText | null> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, { styleMap: STYLE_MAP });

  const read = (section: string): MotionText => {
    const motion: MotionText = { citations: [], recitals: new Map(), paragraphs: new Map(), points: new Map() };
    // A point belongs to the paragraph above it and a sub-point to the point
    // above that, so the reading carries both along.
    let para: number | null = null;
    let point: string | null = null;
    for (const m of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const text = plain(m[1] ?? "");
      if (!text) continue;
      let r: RegExpExecArray | null;
      if ((r = CITATION_RE.exec(text))) motion.citations.push(r[1]!.trim());
      else if ((r = PARAGRAPH_RE.exec(text))) {
        para = Number(r[1]);
        point = null;
        motion.paragraphs.set(para, text);
      } else if (para !== null && (r = POINT_RE.exec(text))) {
        point = r[1]!;
        motion.points.set(`${para}.${point}`, text);
      } else if (para !== null && point !== null && (r = SUBPOINT_RE.exec(text))) {
        motion.points.set(`${para}.${point}.${r[1]!.toLowerCase()}`, text);
      } else if ((r = RECITAL_RE.exec(text))) motion.recitals.set(r[1]!, text);
    }
    return motion;
  };

  // A report carries its motion in a section of its own, after the explanatory
  // statement and the annexes — take the first that reads as one.
  for (const section of html.split(/<h1>/i).slice(1)) {
    const motion = read(section);
    if (motion.citations.length && motion.paragraphs.size) return motion;
  }
  // A motion for a resolution (B-…) IS the motion: no section to pick.
  const whole = read(html);
  return whole.citations.length && whole.paragraphs.size ? whole : null;
}

/**
 * The motion text a voting-list subject points at, or null when the subject
 * is not a plain reference ("After § 1" is a new paragraph — nothing to
 * quote; "§ 2 – parts" is handled by the split logic, not here).
 */
export function originalTextFor(subject: string, motion: MotionText): string | null {
  const s = subject.trim();
  let m: RegExpExecArray | null;
  const P = "(?:§|paragraph|paragrafo|par\\.?)";
  if ((m = new RegExp(`^${P}\\s*(\\d+)$`, "i").exec(s))) return motion.paragraphs.get(Number(m[1])) ?? null;
  // "§ 22, point b, sub-point i" before "§ 15, point f": the longer shape
  // would otherwise be cut short by the shorter one.
  if ((m = new RegExp(`^${P}\\s*(\\d+),\\s*point\\s+([a-z]),\\s*sub-?point\\s+([ivxl]+)$`, "i").exec(s))) {
    return motion.points.get(`${Number(m[1])}.${m[2]!.toLowerCase()}.${m[3]!.toLowerCase()}`) ?? null;
  }
  if ((m = new RegExp(`^${P}\\s*(\\d+),\\s*point\\s+([a-z])$`, "i").exec(s))) {
    return motion.points.get(`${Number(m[1])}.${m[2]!.toLowerCase()}`) ?? null;
  }
  if ((m = /^citation\s*(\d+)$/i.exec(s))) return motion.citations[Number(m[1]) - 1] ?? null;
  if ((m = /^(?:recital|considerando)\s*([A-Z]{1,2})$/i.exec(s))) return motion.recitals.get(m[1]!.toUpperCase()) ?? null;
  return null;
}
