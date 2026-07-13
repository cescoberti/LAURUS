import type { ParsedVotingListRow, SplitPart } from "./types.ts";

/**
 * Shape of a captured VOT-document row, as extracted from the EP "Results of
 * votes" table. See packages/parser/fixtures/*.json for real examples — this
 * is the intermediate format a future HTML/DOCX table extractor produces
 * before normalising into `voting_list_rows`.
 */
export interface RawVotRow {
  subject: string;
  amNo?: string | null;
  author?: string | null;
  voteType?: "rcv" | "split" | "electronic" | string;
  splitParts?: Array<{ index: number; label: string }>;
}

const AM_NUMBER_RE = /\b(\d+)\b/;

/** Extract an amendment number from the "Am No" cell, if that cell holds one. */
function amendmentNumberFrom(amNo?: string | null): number | null {
  if (!amNo) return null;
  // Group-name cells ("PfE", "ECR", "Members", "original text") are not
  // amendment numbers even though the column is literally "Am No" — the EP
  // table reuses this column for the vote's author when there is no amendment.
  const m = AM_NUMBER_RE.exec(amNo);
  if (!m) return null;
  return Number(m[1]);
}

function classifyVoteType(row: RawVotRow): ParsedVotingListRow["voteType"] {
  if (row.splitParts?.length) return "split";
  if (row.voteType === "rcv") return "rcv";
  return "final_vote";
}

/** Normalise one captured VOT row into a `voting_list_rows` candidate. */
export function normaliseVotRow(row: RawVotRow, orderIndex: number): ParsedVotingListRow {
  const splitParts: SplitPart[] = (row.splitParts ?? []).map((p) => ({
    index: p.index,
    boundary: p.label,
  }));

  return {
    orderIndex,
    subject: row.subject,
    amendmentNumber: amendmentNumberFrom(row.amNo),
    author: row.author ?? undefined,
    voteType: classifyVoteType(row),
    splitParts,
  };
}

export function normaliseVotRows(rows: RawVotRow[]): ParsedVotingListRow[] {
  return rows.map((r, i) => normaliseVotRow(r, i + 1));
}
