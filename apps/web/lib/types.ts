export type VlStatus = "final" | "draft" | "none";

/** Row shape the dashboard renders, derived from laurus.items. */
export interface DisplayItem {
  id: string;
  code: string;
  title: string;
  rapporteur?: string;
  committee: string; // committee code or "TBD"
  voteDate?: string; // ISO date of the plenary vote
  vl: VlStatus;
  /** Amendments ingested for the file — the VL can be generated once > 0. */
  amCount: number;
  /** Report PDF URL (English), from laurus.documents. */
  fileUrl?: string;
  /** Report in the member's VL language, when the EP published it. */
  fileUrlLang?: string;
  staff?: string;
  /** The EP's own list, when the live sync has it: version label + fetch time. */
  officialVl?: { versionLabel: string; fetchedAt: string };
  /** The viewer follows this file (alerts on). */
  following: boolean;
  /** One of the viewer's own committees. */
  mine: boolean;
}

export interface DayGroup {
  day: string; // "Tue 16 Jun"
  iso: string; // "" when the vote date is not known yet
  items: DisplayItem[];
}
