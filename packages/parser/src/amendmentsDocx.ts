import mammoth from "mammoth";
import type { ParsedAmendment } from "./types.ts";

/**
 * Parse the two-column "Parliament amendments" out of an EP report DOCX.
 *
 * EP report templates (PR_COD, PR_REG, PR_INI, second-reading recommendations,
 * Rules-of-Procedure amendment reports, …) wrap every amendment in a fixed set
 * of literal template tokens that survive into the document body as text:
 *
 *   <RepeatBlock-Amend>
 *     <Amend>Amendment  <NumAm>12</NumAm>
 *     <DocAmend>Proposal for a regulation</DocAmend>
 *     <Article>Recital 4</Article>
 *     <table>                                  ← the two-column amendment table
 *       <tr><td colspan=2/></tr>               ← spacer row
 *       <tr><td>Text proposed…</td><td>Amendment</td></tr>   ← header row
 *       <tr><td>ORIGINAL…</td><td>AMENDED…</td></tr>         ← content row(s)
 *     </table>
 *     </Amend>
 *
 * We drive the parse off the structural tokens (`<NumAm>`, `<Article>`) and the
 * table shape — never off the header text, which is language-dependent
 * ("Testo della Commissione", "Text proposed by the Commission", …). Deletions
 * appear as a left cell with an empty right cell; insertions as the reverse.
 * We keep the columns verbatim: left → originalText, right → amendedText.
 *
 * Deterministic and text-faithful: it extracts what the document contains and
 * never invents or paraphrases. Validated against real fixtures under
 * packages/parser/fixtures/.
 */

// Template tokens arrive HTML-escaped in mammoth's output (`&lt;NumAm&gt;`).
const NUM_AM_RE = /&lt;NumAm&gt;\s*([0-9]+\s*[a-z]?)\s*&lt;\/NumAm&gt;/i;
const DOC_AMEND_RE = /&lt;DocAmend&gt;([\s\S]*?)&lt;\/DocAmend&gt;/i;
const ARTICLE_RE = /&lt;Article&gt;([\s\S]*?)&lt;\/Article&gt;/i;
// Plenary AM blocks carry the tabling group as `<AuNomDe> {ECR} a nome…` —
// the braces hold the canonical group short name.
const AU_NOM_DE_RE = /&lt;AuNomDe&gt;\s*\{([^}]+)\}/i;
const MEMBERS_RE = /&lt;Members&gt;([\s\S]*?)&lt;\/Members&gt;/i;

/** Split the report HTML into one chunk per `<Amend>` block. */
function amendBlocks(html: string): string[] {
  // Each amendment starts at an `<Amend>` token and runs to the next one (or to
  // the closing `</RepeatBlock-Amend>` / end of document).
  const parts = html.split(/&lt;Amend&gt;/i);
  return parts.slice(1); // drop the preamble before the first <Amend>
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;[^&]*?&gt;/g, " ") // drop any remaining template tokens
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"');
}

/** Strip HTML tags to plain text, collapsing whitespace. */
function textOf(html: string): string {
  return decodeEntities(
    html.replace(/<\/(p|td|tr|table|div|li)>/gi, " ").replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep inline formatting as light HTML: only <b>, <i>, <s> survive (normalised
 * from mammoth's <strong>/<em>/<s>), paragraphs become newlines. The EP
 * two-column template marks every textual change in bold italic, so keeping
 * these runs is what lets the annotated VL show additions in bold exactly as
 * the published document does.
 */
function richTextOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<\/p>/gi, "\n")
      .replace(/<(\/?)strong>/gi, "<$1b>")
      .replace(/<(\/?)em>/gi, "<$1i>")
      .replace(/<(\/?)s>/gi, "<$1s>")
      .replace(/<(?!\/?[bis]>)[^>]+>/g, ""), // drop every other tag
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

interface Cell {
  html: string;
}

/** Pull the rows of the first `<table>` in a block as [left, right] cell pairs. */
function firstTableRows(block: string): Array<[Cell, Cell | undefined]> {
  const tableMatch = /<table[\s\S]*?<\/table>/i.exec(block);
  if (!tableMatch) return [];
  const table = tableMatch[0];
  const rows: Array<[Cell, Cell | undefined]> = [];
  for (const rowMatch of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => ({ html: m[1] ?? "" }));
    const left = cells[0];
    if (!left) continue;
    rows.push([left, cells[1]]);
  }
  return rows;
}

function classifyKind(numAm: string, header: string): ParsedAmendment["kind"] {
  const h = header.toLowerCase();
  if (/\boral/.test(h)) return "oral";
  if (/\bcompromis|\bcam\b/.test(h)) return "compromise_cam";
  return "standard";
}

/**
 * Parse all amendments from one report DOCX.
 *
 * @param buffer   the .docx bytes (Node Buffer / Uint8Array / ArrayBuffer)
 * @param language ISO 639-1 code the file is in (stored on each amendment)
 */
export async function parseAmendmentsDocx(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  language: string,
): Promise<ParsedAmendment[]> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });

  const out: ParsedAmendment[] = [];
  for (const block of amendBlocks(html)) {
    const numMatch = NUM_AM_RE.exec(block);
    if (!numMatch) continue;
    const rawNum = (numMatch[1] ?? "").replace(/\s+/g, "");
    const number = parseInt(rawNum, 10);
    if (!Number.isFinite(number)) continue;

    const target = ARTICLE_RE.exec(block)?.[1]?.trim();
    // Tabling author: the group in `<AuNomDe>{…}` when present (plenary
    // amendments), else the MEP names in `<Members>`, else the DocAmend
    // context (committee-report amendments have no author block).
    const group = AU_NOM_DE_RE.exec(block)?.[1]?.trim();
    const members = MEMBERS_RE.exec(block)?.[1]?.trim();
    const docAmend = group || (members ? textOf(members) : undefined) || DOC_AMEND_RE.exec(block)?.[1]?.trim();

    const rows = firstTableRows(block);
    // Row 0 is the colspan spacer, row 1 the language-specific header; content
    // starts at row 2. Guard for templates without the spacer row.
    let headerText = "";
    let contentStart = 0;
    for (let i = 0; i < rows.length && i < 3; i++) {
      const row = rows[i];
      if (!row) continue;
      const [l, r] = row;
      const lt = textOf(l.html);
      const rt = r ? textOf(r.html) : "";
      // A header row has short labels in BOTH columns and no long body text.
      if (rt && lt && lt.length < 60 && rt.length < 40 && contentStart === i) {
        headerText = `${lt} | ${rt}`;
        contentStart = i + 1;
      } else if (!lt && !rt && contentStart === i) {
        contentStart = i + 1; // spacer row
      }
    }

    const originalParts: string[] = [];
    const amendedParts: string[] = [];
    const originalRichParts: string[] = [];
    const amendedRichParts: string[] = [];
    for (let i = contentStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const [l, r] = row;
      const lt = textOf(l.html);
      const rt = r ? textOf(r.html) : "";
      if (lt) {
        originalParts.push(lt);
        originalRichParts.push(richTextOf(l.html));
      }
      if (rt) {
        amendedParts.push(rt);
        amendedRichParts.push(richTextOf(r!.html));
      }
    }

    out.push({
      number,
      language,
      kind: classifyKind(rawNum, headerText),
      target: target || undefined,
      tabledBy: docAmend || undefined,
      originalText: originalParts.join("\n") || undefined,
      amendedText: amendedParts.join("\n") || undefined,
      originalRich: originalRichParts.join("\n") || undefined,
      amendedRich: amendedRichParts.join("\n") || undefined,
    });
  }

  return out;
}
