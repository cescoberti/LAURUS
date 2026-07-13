export type VlStatus = "final" | "draft" | "none";

/** Row shape the dashboard tables render, derived from laurus.items. */
export interface DisplayItem {
  code: string;
  title: string;
  rapporteur?: string;
  committee: string; // committee code or "TBD"
  voteDate?: string; // ISO date of the plenary vote
  vl: VlStatus;
  /** Report PDF URL (English), from laurus.documents. */
  fileUrl?: string;
  staff?: string;
}

export interface DayGroup {
  day: string; // "Tue 16 Jun"
  items: DisplayItem[];
}
