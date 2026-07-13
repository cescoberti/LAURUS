export type VlStatus = "final" | "draft" | "none";

export interface Item {
  code: string;
  title: string;
  rapporteur?: string;
  committee: string; // committee code or "TBD"
  amDeadline?: { label: string; state: "closed" | "open" | "split" };
  amr?: number; // amendments tabled count badge
  vl: VlStatus;
  docs: { file?: boolean; vl?: boolean; ams?: boolean; split?: boolean };
  staff?: string;
}

export interface DayGroup {
  day: string; // "Tue 16 Jun"
  items: Item[];
}

export interface Session {
  month: string; // "June 2026"
  subtitle: string; // "Plenary 18-18 June, Brussels"
  votes: number;
  allocated: number;
  withVl: number;
  days: DayGroup[];
}
