import mammoth from "mammoth";

/**
 * Parser for the EP Tabling Service "INDICATIVE VOTING LIST" DOCX — the
 * document a group advisor annotates before a plenary vote. Its table has the
 * columns:
 *
 *   Subject of the amendment | Am No | Author | RCV etc. | Vote | Remarks
 *
 * with three row shapes:
 *   - a full 6-cell row = one amendment/point put to the vote;
 *   - a 5-cell row = a further amendment on the SAME subject (subject cell
 *     merged upward — inherits the previous row's subject);
 *   - a 3-cell row = one part of a split vote on the row above
 *     (part label | vote | remarks).
 * A trailing 4-cell row is the final vote ("vote: resolution (as a whole)").
 *
 * The "Remarks" column is Feature 4's target: LAURUS fills it with the
 * published amendment text. This parser reads the whole structure (including
 * any Remarks already present) so the annotated list can be regenerated.
 */

export interface AnnotatedVlSplitPart {
  label: string; // '1 RCV', 'First part', …
  vote: string;
  remarks: string;
  /**
   * The official VOT notation for this part (e.g. 'text as a whole excluding
   * the words "…"'). Kept when `remarks` is expanded to the full part text, so
   * verification can still compare the request against the official source.
   */
  notation?: string;
}

export interface AnnotatedVlRow {
  subject: string;
  amNo: string | null;
  author: string | null;
  voteType: string | null; // 'RCV', 'split', '' …
  vote: string | null; // '+', '-', '0', or an annotation
  remarks: string;
  splitParts: AnnotatedVlSplitPart[];
  isFinalVote?: boolean;
}

export interface AnnotatedVotingList {
  documentTitle: string; // 'INDICATIVE VOTING LIST'
  version: string | null; // 'FINAL VERSION'
  rapporteur: string | null; // 'STREIT'
  reportCode: string | null; // 'A10-0170/2026'
  procedureType: string | null; // '[init.]'
  reportTitle: string | null;
  committee: string | null;
  rows: AnnotatedVlRow[];
  /**
   * Paragraphs printed under the table, verbatim: "Ams 2 and 14 were
   * cancelled…", "Requests for roll-call votes", the per-group request lists.
   * They are part of the list and are reproduced as they are — which means
   * with their markup, so each carries the light HTML the DOCX writer reads
   * (`<b>`, `<i>`, `<u>`, `<s>`) and keeps the tabs that align the group
   * lines. Use `noteText` to match on the words.
   */
  notes: string[];
}

/**
 * A paragraph printed under the table, kept as the light markup the DOCX
 * writer understands (`<b>`, `<i>`, `<u>`, `<s>`) with its tabs intact.
 *
 * The block under the table is not prose, it is layout: "Requests for
 * roll-call votes" is italic and underlined, and each group line is
 * "Greens/ EFA:" then a TAB then the amendment numbers. Flattening it to
 * plain text, which is what `cellText` does, reprinted it as two bare lines
 * that no longer looked like the EP's list.
 */
function noteHtml(html: string): string {
  return html
    .replace(/<(\/?)(strong|em)>/gi, (_, slash: string, tag: string) => `<${slash}${tag.toLowerCase() === "strong" ? "b" : "i"}>`)
    .replace(/<(\/?)(?:strike|del)>/gi, "<$1s>")
    .replace(/<(?!\/?[bius]>)[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "’")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

/** The words of a note, without the markup — for matching, never for printing. */
export function noteText(note: string): string {
  return note.replace(/<\/?[bius]>/g, "").replace(/\t/g, " ").replace(/ {2,}/g, " ").trim();
}

function cellText(html: string): string {
  return html
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "’")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/^\s+|\s+$/g, "");
}

function metaField(pre: string, label: string): string | null {
  // Header lines look like "<em>Report:</em>\tSTREIT\t(A10-0170/2026)\t..."
  const re = new RegExp(`${label}:\\s*([^]*?)(?:</p>|<p>)`, "i");
  const m = re.exec(pre.replace(/<\/?(strong|em)>/gi, ""));
  return m ? cellText(m[1]) : null;
}

export async function parseIndicativeVotingList(
  buffer: Buffer | Uint8Array | ArrayBuffer,
): Promise<AnnotatedVotingList> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  // mammoth drops underline unless asked: the Tabling Service underlines the
  // "Requests for …" headings under the table, and that has to survive if the
  // generated list is to reprint the block the way the EP printed it.
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, { styleMap: ["u => u"] });

  const tableStart = html.indexOf("<table");
  const pre = tableStart >= 0 ? html.slice(0, tableStart) : html;
  const preText = cellText(pre.replace(/<\/p>/gi, " | "));

  // "FINAL VERSION", "REVISED VERSION", … as printed; a LAURUS draft says so.
  const version = /\b([A-Z]+ VERSION)\b/.exec(cellText(pre))?.[1] ?? (/DRAFT/i.test(pre) ? "DRAFT" : null);

  // Header, Tabling Service variant: "Report: STREIT (A10-0170/2026) [init.]".
  const reportLine = metaField(pre, "Report") ?? "";
  let codeMatch = reportLine.match(/\(([A-Z0-9-]+\/\d{4})\)/);
  let rapporteur = reportLine.split("(")[0]?.trim() || null;
  const procMatch = reportLine.match(/\[([^\]]+)\]/);
  const committee = metaField(pre, "Committee");
  // The report title is the paragraph between the code line and "Committee:".
  let titleMatch = preText.match(/\[[^\]]+\]\s*\|?\s*([^|]+?)\s*\|\s*Committee:/i);

  // Header, group-internal variant ("ECR VOTING LIST"): no "Report:" line.
  // The rapporteur is the short all-caps paragraph after the title, the code
  // sits on a "Doc n° …" line, and the first long paragraph is the EN title.
  if (!codeMatch) {
    codeMatch = preText.match(/\b([A-Z]+\d+-\d+\/\d{4})\b/);
    const paras = preText.split("|").map((s) => s.trim()).filter(Boolean);
    const titleIdx = paras.findIndex((p) => /VOTING LIST/i.test(p));
    if (!rapporteur) {
      rapporteur =
        paras.find((p, i) => i > titleIdx && p.length >= 2 && p.length <= 40 && p === p.toUpperCase() && /[A-Z]{2}/.test(p)) ??
        null;
    }
    if (!titleMatch) {
      const title = paras.find((p, i) => i > titleIdx && p.length > 40 && !/^Doc n|Rapporteur|Coordinator|Advisor/i.test(p));
      if (title) titleMatch = [title, title] as unknown as RegExpMatchArray;
    }
  }

  const tableMatch = tableStart >= 0 ? /<table[\s\S]*?<\/table>/i.exec(html) : null;
  const table = tableMatch?.[0] ?? "";
  const post = tableMatch ? html.slice(tableMatch.index + table.length) : "";
  const notes = [...post.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => noteHtml(m[1] ?? "")).filter((n) => noteText(n));
  const rows: AnnotatedVlRow[] = [];
  let current: AnnotatedVlRow | null = null;
  let lastSubject = "";

  for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => cellText(m[1]));
    if (cells.length === 0) continue;
    // Skip the column-header row.
    if (/^subject/i.test(cells[0] ?? "") || cells.every((c) => c === "")) continue;

    if (cells.length >= 6) {
      lastSubject = cells[0] ?? "";
      current = {
        subject: lastSubject,
        amNo: cells[1] || null,
        author: cells[2] || null,
        voteType: cells[3] || null,
        vote: cells[4] || null,
        remarks: cells[5] ?? "",
        splitParts: [],
      };
      rows.push(current);
    } else if (cells.length === 5) {
      // continuation on the previous subject (subject cell merged upward)
      current = {
        subject: lastSubject,
        amNo: cells[0] || null,
        author: cells[1] || null,
        voteType: cells[2] || null,
        vote: cells[3] || null,
        remarks: cells[4] ?? "",
        splitParts: [],
      };
      rows.push(current);
    } else if (cells.length === 4 && /^vote:/i.test(cells[0] ?? "")) {
      rows.push({
        subject: cells[0] ?? "",
        amNo: null,
        author: null,
        voteType: cells[1] || null,
        vote: cells[2] || null,
        remarks: cells[3] ?? "",
        splitParts: [],
        isFinalVote: true,
      });
      current = null;
    } else if (cells.length === 3 && current) {
      // a part of a split vote on the current row
      current.splitParts.push({ label: cells[0] ?? "", vote: cells[1] ?? "", remarks: cells[2] ?? "" });
    }
  }

  return {
    documentTitle: /INDICATIVE VOTING LIST/i.test(preText)
      ? "INDICATIVE VOTING LIST"
      : preText.match(/\b([A-Z]+ VOTING LIST)\b/)?.[1] ?? "VOTING LIST", // 'ECR VOTING LIST'
    version,
    rapporteur,
    reportCode: codeMatch?.[1] ?? null,
    procedureType: procMatch ? `[${procMatch[1]}]` : null,
    reportTitle: titleMatch?.[1]?.trim() || null,
    committee,
    rows,
    notes,
  };
}

/**
 * A list that puts the act itself to the vote rather than a text of
 * Parliament's: a second reading on the Council position, where the vote goes
 * article by article and there is no final vote at all.
 *
 * Two things in the document say so, and only those two: the procedure marker
 * the header prints ("[***II]") and the Tabling Service's own note under the
 * table ("N.B. There is no final vote in second reading."), which is written
 * in English whatever the file. Guessing it from the rows instead would catch
 * a report that amends the Rules of Procedure, whose subjects are articles
 * too and which does end in a final vote.
 */
export function isSecondReading(vl: Pick<AnnotatedVotingList, "procedureType" | "notes">): boolean {
  if (/\*{2,3}\s*II\b/i.test(vl.procedureType ?? "")) return true;
  return vl.notes.some((n) => /\bno final vote\b/i.test(noteText(n)));
}

export interface SplitRequest {
  group: string;
  subject: string;
  parts: Array<{ section: string; text: string }>;
}

/**
 * The split-vote requests printed under the list, in the shape the VOT gives
 * them after the vote — so the same expansion code serves before the vote:
 *
 *   Requests for split votes
 *   EPP
 *   § 54
 *   1st part: Text as a whole excluding the words “of all kinds”
 *   2nd part: These words
 *
 * A group line opens a block, a subject line ("§ 54", "Am 3", "Recital C",
 * and in a second reading "Article 5, § 1, point 31") opens a request,
 * "Nth part: …" lines are its parts. Ends at the next "Requests for …"
 * heading or at the "Voting scheme" block.
 */
export function splitRequestsFromNotes(notes: string[]): SplitRequest[] {
  // The notes carry their markup now, so match on the words, not the HTML:
  // the heading this looks for is the underlined one.
  return requestBlock(notes, /^requests? for split votes?/i);
}

export interface OralAmendment {
  /** "Teodorescu" — the member who moves it, as the list names them. */
  mep: string;
  /** What it amends, as the list writes it: "article 4, § 5". */
  subject: string;
  /** The text as printed, with its <b>/<s> markup, quotation marks taken off. */
  text: string;
}

/**
 * Oral amendments the Tabling Service announces under "Miscellaneous":
 *
 *   MEP Teodorescu will move the following oral amendment to article 4, § 5
 *   “Member States shall ensure that … <b>added</b> <s>deleted</s> …”
 *
 * The table row for it has an empty Remarks cell holding only "oral
 * amendment"; the words to vote on are here, in English, and nowhere else.
 */
export function oralAmendmentsFromNotes(notes: string[]): OralAmendment[] {
  const out: OralAmendment[] = [];
  for (let i = 0; i < notes.length; i++) {
    const head = /^(?:MEPs?\s+)?(.+?)\s+will\s+move\s+the\s+following\s+oral\s+amendment\s+(?:to|on)\s+(.+?)\s*:?$/i.exec(noteText(notes[i]!));
    if (!head) continue;
    const body: string[] = [];
    for (const raw of notes.slice(i + 1)) {
      const line = noteText(raw);
      if (!line || /^generated by laurus/i.test(line) || /will move the following oral amendment/i.test(line)) break;
      if (/^requests? for /i.test(line) || VOTING_SCHEME.test(line) || /^miscellaneous$/i.test(line)) break;
      body.push(raw.trim());
    }
    const text = body.join("\n").replace(/^(<[bius]>)*[“”"„]\s*/, "$1").replace(/\s*[“”"]\s*((<\/[bius]>)*)$/, "$1").trim();
    if (text) out.push({ mep: head[1]!.trim(), subject: head[2]!.trim(), text });
  }
  return out;
}

/**
 * The "Voting scheme" block, when the Tabling Service prints one: the split
 * as it will actually be PUT, after merging the competing requests.
 *
 * Two groups asking to cut the same subject in different places do not give
 * two votes, they give one vote in more parts — A10-0297/2026 (MONTSERRAT,
 * second reading) has ECR cutting Article 5, § 1, point 31 in two and ESN
 * cutting it elsewhere, and the table votes it in three. Neither request
 * matches the row; only the scheme does. Same shape as the requests, with no
 * group to name, so the expansion reads it the same way.
 */
export function votingSchemeFromNotes(notes: string[]): SplitRequest[] {
  return requestBlock(notes, VOTING_SCHEME);
}

/** The heading, printed with or without its colon depending on the list. */
const VOTING_SCHEME = /^voting scheme\s*:?$/i;

/** The subject-and-parts block under `heading`, in the order printed. */
function requestBlock(notes: string[], heading: RegExp): SplitRequest[] {
  const out: SplitRequest[] = [];
  const start = notes.findIndex((n) => heading.test(noteText(n)));
  if (start < 0) return out;
  let group = "";
  let current: SplitRequest | null = null;
  for (const raw of notes.slice(start + 1)) {
    const line = noteText(raw);
    if (!line) continue;
    if (/^requests? for /i.test(line) || VOTING_SCHEME.test(line)) break;
    const part = /^(\d+)(?:st|nd|rd|th)\s+part\s*:\s*(.*)$/i.exec(line);
    if (part && current) {
      current.parts.push({ section: part[1]!, text: part[2]!.trim() });
      continue;
    }
    if (SUBJECT_LINE.test(line)) {
      current = { group, subject: line, parts: [] };
      out.push(current);
      continue;
    }
    // Anything else is the tabling group's name (may end with a colon).
    group = line.replace(/:$/, "").trim();
    current = null;
  }
  return out.filter((r) => r.parts.length > 0);
}

/**
 * A line that names what is voted, as against the group that asked for it.
 * "Article …" is the second-reading shape: there the vote is on the articles
 * of the Council position, not on paragraphs of a motion, and a line read as
 * a group name instead cost every split of such a list its expansion.
 */
const SUBJECT_LINE = /^(§|am\b|ams?\.?\s*\d|amendment|recital|citation|paragraph|article|annex)/i;

/**
 * One subject written two ways is still one subject: the table's column says
 * "Article 5, § 1, point 32, intro", the footer "…, point 32, introductory
 * part", and the row and its request have to find each other across that.
 * Case, spacing, the paragraph sign and the EP's abbreviations are levelled;
 * nothing else is touched.
 */
export function subjectKey(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\bintroductory part\b/g, "intro")
    .replace(/\bsub-?point\b/g, "subpoint")
    .replace(/\bparagraphs?\b|\bpar\.?\b/g, "§")
    .replace(/\barticle\b|\bart\.?\b/g, "article")
    .replace(/\bamendment\b|\bams?\b\.?/g, "am")
    // "§6" and "§ 6" are the same paragraph, and the footer writes it both
    // ways in one list (A10-0200: the scheme says "§6", the requests "§ 6:").
    .replace(/§\s*(?=\d)/g, "§ ")
    .replace(/\b(article|am)\s*(?=\d)/g, "$1 ")
    .replace(/[(),.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The amendments a row or a request names: "60cp3=86=" and "Am 60cp3 and 86"
 * both give ["60cp3", "86"]. Empty for a row that votes the text itself
 * ("§"), which is matched on its subject instead. With `base`, the part
 * suffix goes too, so the row "83cp1" meets the request on "Am 83".
 */
function amendmentTokens(text: string | null | undefined, base = false): string[] {
  const s = (text ?? "").toLowerCase().replace(/^\s*(?:amendments?|ams?)\b\.?/, "");
  const found = s.match(/\d+(?:\s*cp\s*\d+)?/g)?.map((t) => t.replace(/\s+/g, "")) ?? [];
  return [...new Set(base ? found.map((t) => t.replace(/cp\d+$/, "")) : found)].sort();
}

/**
 * The request a split row is the vote on, or null when it cannot be told.
 *
 * The two sides of one list name the same vote differently. The table says
 * what is amended — "Article 9, § 4", "After recital 15", or just the block
 * heading "Amendments by the committee responsible - separate and split
 * votes" — and the footer says which amendment was asked to be divided,
 * "Am 68". Matching the words alone left a quarter of the split rows in the
 * lists LAURUS holds without a request. So the row is looked up four ways,
 * from the most explicit down:
 *
 *   1. the amendment it carries, exactly ("Am 60cp3 and 86" ↔ "60cp3=86=");
 *   2. its subject, levelled by `subjectKey`;
 *   3. the amendment without the part suffix — amendment 83 voted in
 *      corresponding parts is "83cp1" on the list and "Am 83" in the footer;
 *   4. a subject the footer writes shorter than the table does
 *      ("Article 2, point 12" for "Article 2, § 1, point 12"), and only when
 *      the number of parts agrees.
 *
 * Groups often ask for the very same cut — three of them did on Am 83 of
 * A10-0201 — and that is one vote, not three, so identical requests count as
 * one. Requests that differ and no scheme to merge them is not a match:
 * which cut is put is the Tabling Service's call, not ours.
 */
export function splitRequestFor(
  row: Pick<AnnotatedVlRow, "subject" | "amNo" | "splitParts">,
  requests: SplitRequest[],
): SplitRequest | null {
  const parts = row.splitParts.length;
  /** One request, or none: identical cuts are one vote, and a tie is no answer. */
  const only = (candidates: SplitRequest[]): SplitRequest | null => {
    const distinct = (list: SplitRequest[]) => {
      const seen = new Map<string, SplitRequest>();
      for (const r of list) {
        const cut = r.parts.map((p) => subjectKey(p.text)).join("|");
        if (!seen.has(cut)) seen.set(cut, r);
      }
      return [...seen.values()];
    };
    const all = distinct(candidates);
    if (all.length === 1) return all[0]!;
    // Several different cuts: the one with as many parts as the row, if only one has.
    const fitting = all.filter((r) => r.parts.length === parts);
    return fitting.length === 1 ? fitting[0]! : null;
  };

  const names = (r: SplitRequest) => /^\s*(?:amendments?|ams?)\b/i.test(r.subject);
  const exact = amendmentTokens(row.amNo);
  if (exact.length) {
    // Only a request that says so names an amendment: "§ 80" is a paragraph,
    // not amendment 80.
    const hit = only(requests.filter((r) => names(r) && sameTokens(amendmentTokens(r.subject), exact)));
    if (hit) return hit;
  }

  const key = subjectKey(row.subject);
  const bySubject = only(requests.filter((r) => subjectKey(r.subject) === key));
  if (bySubject) return bySubject;

  const base = amendmentTokens(row.amNo, true);
  if (base.length) {
    const hit = only(requests.filter((r) => names(r) && sameTokens(amendmentTokens(r.subject, true), base)));
    if (hit) return hit;
  }

  // Last, the shorter spelling — never without the parts agreeing.
  const words = key.split(" ");
  const shorter = requests.filter((r) => parts > 0 && r.parts.length === parts && isSubsequence(subjectKey(r.subject).split(" "), words));
  return only(shorter);
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Every word of `needle`, in order, somewhere in `hay`. */
function isSubsequence(needle: string[], hay: string[]): boolean {
  if (needle.length === 0 || needle.length === hay.length) return false;
  let i = 0;
  for (const w of hay) if (w === needle[i]) i++;
  return i === needle.length;
}
