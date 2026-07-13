export interface ParsedAmendment {
  number: number;
  tabledBy?: string;
  target?: string;         // 'Recital C', 'Article 4', '§ 15'
  originalText?: string;
  amendedText?: string;
  language: string;
  kind: "standard" | "oral" | "compromise_cam" | "withdrawn";
}

export interface SplitPart {
  index: number;           // 1st part, 2nd part, ...
  boundary: string;        // 'from the beginning to "..."', 'the rest'
}

export interface ParsedVotingListRow {
  orderIndex: number;
  subject: string;         // 'Am 72', '§ 15', 'Considerando C'
  amendmentNumber: number | null;
  author?: string;
  voteType: "am" | "split" | "separate" | "rcv" | "final_vote";
  splitParts: SplitPart[];
}

/** Result of resolving a voting-list row's subject against the amendment set. */
export type RefResolution =
  | { status: "auto"; amendmentNumber: number }
  | { status: "anomaly"; reason: AnomalyReason };

export type AnomalyReason =
  | "unresolvable"        // no amendment number could be parsed
  | "not_found"           // number parsed but no matching amendment record
  | "withdrawn"           // amendment exists but was withdrawn
  | "oral"                // oral amendment — no tabled text
  | "compromise_cam"      // compromise amendment
  | "paragraph_ref";      // refers to a §/recital, not an amendment
