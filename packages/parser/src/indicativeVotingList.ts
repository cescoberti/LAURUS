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
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });

  const tableStart = html.indexOf("<table");
  const pre = tableStart >= 0 ? html.slice(0, tableStart) : html;
  const preText = cellText(pre.replace(/<\/p>/gi, " | "));

  const version = /FINAL VERSION/i.test(pre) ? "FINAL VERSION" : /DRAFT/i.test(pre) ? "DRAFT" : null;

  // "Report: STREIT (A10-0170/2026) [init.]  <title>"
  const reportLine = metaField(pre, "Report") ?? "";
  const codeMatch = reportLine.match(/\(([A-Z0-9-]+\/\d{4})\)/);
  const rapporteur = reportLine.split("(")[0]?.trim() || null;
  const procMatch = reportLine.match(/\[([^\]]+)\]/);
  const committee = metaField(pre, "Committee");
  // The report title is the paragraph between the code line and "Committee:".
  const titleMatch = preText.match(/\[[^\]]+\]\s*\|?\s*([^|]+?)\s*\|\s*Committee:/i);

  const table = tableStart >= 0 ? /<table[\s\S]*?<\/table>/i.exec(html)?.[0] ?? "" : "";
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
    documentTitle: /INDICATIVE VOTING LIST/i.test(pre) ? "INDICATIVE VOTING LIST" : "VOTING LIST",
    version,
    rapporteur,
    reportCode: codeMatch?.[1] ?? null,
    procedureType: procMatch ? `[${procMatch[1]}]` : null,
    reportTitle: titleMatch?.[1]?.trim() || null,
    committee,
    rows,
  };
}
