/**
 * Split / separate / roll-call vote extraction and export.
 *
 * The EP "Results of votes" (VOT) document lists, per item, the groups' formal
 * requests for split votes (with the verbatim boundary text that divides each
 * part), separate votes, and roll-call votes. Group advisors copy these into
 * their voting instructions — so we flatten them into one export table and a
 * CSV serialiser. Input is the captured VOT structure (see
 * packages/parser/fixtures/vot-*.json), which a browser-side capture produces
 * (DOCEO VOT HTML is bot-gated to server fetches).
 */

export interface VotSplitPart {
  index: number;
  label: string;
  /** Verbatim boundary text that delimits this part, when the VOT states it. */
  boundary?: string;
}

export interface VotSplitRequest {
  group: string;
  subject: string;
  parts: VotSplitPart[];
}

export interface VotSeparateRequest {
  group: string;
  subjects: string[];
}

export interface VotRollCallRequest {
  group: string;
  targets: string[];
}

export interface CapturedVot {
  source_url?: string;
  item_label?: string;
  report?: string;
  requestsForSplitVotes?: VotSplitRequest[];
  requestsForSeparateVotes?: VotSeparateRequest[];
  requestsForRollCallVotes?: VotRollCallRequest[];
}

export interface SplitSeparateRow {
  type: "split" | "separate" | "rcv";
  subject: string;
  group: string;
  partIndex: number | null;
  partLabel: string | null;
  boundary: string | null;
}

/** Flatten a captured VOT's split/separate/RCV requests into export rows. */
export function extractSplitSeparate(vot: CapturedVot): SplitSeparateRow[] {
  const rows: SplitSeparateRow[] = [];

  for (const req of vot.requestsForSplitVotes ?? []) {
    for (const part of req.parts) {
      rows.push({
        type: "split",
        subject: req.subject,
        group: req.group,
        partIndex: part.index,
        partLabel: part.label,
        boundary: part.boundary ?? null,
      });
    }
  }

  for (const req of vot.requestsForSeparateVotes ?? []) {
    for (const subject of req.subjects) {
      rows.push({ type: "separate", subject, group: req.group, partIndex: null, partLabel: null, boundary: null });
    }
  }

  for (const req of vot.requestsForRollCallVotes ?? []) {
    for (const target of req.targets) {
      rows.push({ type: "rcv", subject: target, group: req.group, partIndex: null, partLabel: null, boundary: null });
    }
  }

  return rows;
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS: Array<[string, keyof SplitSeparateRow]> = [
  ["Type", "type"],
  ["Subject", "subject"],
  ["Group", "group"],
  ["Part", "partLabel"],
  ["Boundary", "boundary"],
];

/** Serialise export rows to CSV (with a header row). */
export function splitSeparateToCsv(rows: SplitSeparateRow[]): string {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(([, key]) => csvCell(row[key])).join(","));
  }
  return lines.join("\n");
}
