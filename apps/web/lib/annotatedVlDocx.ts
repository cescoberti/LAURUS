import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  AlignmentType,
  TabStopType,
  TableLayoutType,
  VerticalAlign,
} from "docx";
import type { AnnotatedVotingList, AnnotatedVlRow } from "@laurus/parser/voting-list-docx";

// Black-and-white Tabling Service layout (matches the EP original). Column
// widths are FIXED in twips — percentage widths get overridden by Word's
// auto-fit, which is what squashed the columns before.
const COLUMNS = ["Subject of the amendment", "Am No", "Author", "RCV etc.", "Vote", "Remarks"];
const COL_W = [1400, 700, 1000, 850, 650, 4426]; // twips, sum ≈ 9026 (A4 usable)
const PAGE_W = COL_W.reduce((a, b) => a + b, 0);
const HEADER_FILL = "D9D9D9";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "999999" };

/**
 * Turn light HTML (only <b>, <i>, <s> — as produced by @laurus/parser's
 * remarks diff and rich extraction) into Word runs. Added text renders bold,
 * deleted text struck through, exactly like the hand-made Tabling Service
 * lists. Unknown tags are ignored as text-free noise.
 */
function runs(value: string | null, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): TextRun[] {
  const out: TextRun[] = [];
  const state = { b: false, i: false, s: false };
  let pendingBreaks = 0;
  for (const piece of (value ?? "").split(/(<\/?[bis]>|\n)/)) {
    if (!piece) continue;
    if (piece === "\n") {
      pendingBreaks++;
      continue;
    }
    const tag = /^<(\/?)([bis])>$/.exec(piece);
    if (tag) {
      state[tag[2] as "b" | "i" | "s"] = tag[1] !== "/";
      continue;
    }
    out.push(
      new TextRun({
        text: piece,
        bold: opts.bold || state.b,
        italics: opts.italics || state.i,
        strike: state.s,
        size: opts.size ?? 18,
        color: "000000",
        break: pendingBreaks || undefined,
      }),
    );
    pendingBreaks = 0;
  }
  if (out.length === 0) out.push(new TextRun({ text: "", size: opts.size ?? 18, color: "000000" }));
  return out;
}

function para(value: string | null, align: (typeof AlignmentType)[keyof typeof AlignmentType], opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({ alignment: align, children: runs(value, opts) });
}

function cell(
  width: number,
  children: Paragraph[],
  opts: { fill?: string; valign?: "top" | "center" | "bottom" } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill } : undefined,
    verticalAlign: opts.valign ?? VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 90, right: 90 },
    children,
  });
}

function headerRow(): TableRow {
  return new TableRow({
    tableHeader: true,
    children: COLUMNS.map(
      (c, i) =>
        cell(
          COL_W[i]!,
          [para(c, i === 5 ? AlignmentType.CENTER : AlignmentType.CENTER, { bold: true, italics: i === 5 })],
          { fill: HEADER_FILL },
        ),
    ),
  });
}

const C = AlignmentType.CENTER;
const J = AlignmentType.JUSTIFIED;

function dataRows(row: AnnotatedVlRow): TableRow[] {
  const out: TableRow[] = [];
  out.push(
    new TableRow({
      children: [
        cell(COL_W[0]!, [para(row.subject, C, { bold: row.isFinalVote })]),
        cell(COL_W[1]!, [para(row.amNo, C)]),
        cell(COL_W[2]!, [para(row.author, C)]),
        cell(COL_W[3]!, [para(row.voteType, C)]),
        cell(COL_W[4]!, [para(row.vote, C, { bold: true })]),
        cell(COL_W[5]!, [para(row.remarks, J, { italics: true })], { valign: VerticalAlign.TOP }),
      ],
    }),
  );
  for (const part of row.splitParts) {
    out.push(
      new TableRow({
        children: [
          cell(COL_W[0]!, [para("", C)]),
          cell(COL_W[1]!, [para("", C)]),
          cell(COL_W[2]!, [para("", C)]),
          cell(COL_W[3]!, [para(part.label, C)]),
          cell(COL_W[4]!, [para(part.vote, C, { bold: true })]),
          cell(COL_W[5]!, [para(part.remarks, J, { italics: true })], { valign: VerticalAlign.TOP }),
        ],
      }),
    );
  }
  return out;
}

/** Render an annotated voting list to a .docx Buffer (EP Tabling Service B/W layout). */
export async function renderAnnotatedVlDocx(vl: AnnotatedVotingList): Promise<Buffer> {
  const rightTab = [{ type: TabStopType.RIGHT, position: PAGE_W }];

  const table = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: COL_W,
    layout: TableLayoutType.FIXED,
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [headerRow(), ...vl.rows.flatMap(dataRows)],
  });

  const doc = new Document({
    creator: "LAURUS — EP Plenary Companion",
    title: `Annotated Voting List — ${vl.rapporteur ?? ""} ${vl.reportCode ?? ""}`.trim(),
    styles: { default: { document: { run: { font: "Times New Roman", size: 22, color: "000000" } } } },
    sections: [
      {
        children: [
          // TABLING SERVICE  ......................  INDICATIVE VOTING LIST
          new Paragraph({
            tabStops: rightTab,
            children: [
              new TextRun({ text: "TABLING SERVICE", bold: true, size: 20, color: "000000" }),
              new TextRun({ text: "\t" }),
              new TextRun({ text: vl.documentTitle, bold: true, italics: true, size: 24, color: "000000" }),
            ],
          }),
          vl.version
            ? new Paragraph({ alignment: C, spacing: { before: 80, after: 160 }, children: [new TextRun({ text: vl.version, bold: true, italics: true, size: 28, color: "000000" })] })
            : new Paragraph({ text: "" }),
          new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 1600 }],
            children: [
              new TextRun({ text: "Report:", italics: true, color: "000000" }),
              new TextRun({ text: "\t" }),
              new TextRun({ text: vl.rapporteur ?? "", bold: true, color: "000000" }),
              new TextRun({ text: `\t(${vl.reportCode ?? ""})\t`, bold: true, color: "000000" }),
              new TextRun({ text: vl.procedureType ?? "", bold: true, color: "000000" }),
            ],
          }),
          vl.reportTitle
            ? new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 1600 }], children: [new TextRun({ text: "\t" }), new TextRun({ text: vl.reportTitle, color: "000000" })] })
            : new Paragraph({ text: "" }),
          new Paragraph({
            spacing: { after: 160 },
            tabStops: [{ type: TabStopType.LEFT, position: 1600 }],
            children: [
              new TextRun({ text: "Committee:", italics: true, color: "000000" }),
              new TextRun({ text: "\t" }),
              new TextRun({ text: vl.committee ?? "", color: "000000" }),
            ],
          }),
          table,
          new Paragraph({
            spacing: { before: 200 },
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Generated by LAURUS", italics: true, color: "808080", size: 14 })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
