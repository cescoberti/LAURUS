import { createClient } from "@/lib/supabase/server";

export interface SessionSummary {
  id: string;
  month_label: string;
  start_date: string;
  end_date: string;
  location: "BXL" | "STR";
  vote_count: number;
}

export interface ItemRow {
  id: string;
  code: string;
  title: { en?: string; it?: string };
  rapporteur: string | null;
  committee: string | null;
  vote_date: string | null;
  vl_status: "none" | "draft" | "final";
  documents: Array<{ type: string; language: string; source_url: string }>;
}

export async function getSessions(year: number): Promise<SessionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, month_label, start_date, end_date, location, vote_count")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`)
    .order("start_date");
  return (data as SessionSummary[]) ?? [];
}

export async function getSessionItems(sessionId: string): Promise<ItemRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, vote_date, vl_status, documents (type, language, source_url)")
    .eq("session_id", sessionId)
    .order("vote_date")
    .order("code");
  return (data as ItemRow[]) ?? [];
}

export async function getItemByCode(code: string): Promise<ItemRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, vote_date, vl_status, documents (type, language, source_url)")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  return (data as ItemRow) ?? null;
}
