import { createClient } from "@/lib/supabase/server";
import {
  consolidateAmendments,
  type ConsolidatedAmendment,
  type ParsedAmendment,
} from "@laurus/parser";

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
  am_count: number;
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
    .select("id, code, title, rapporteur, committee, vote_date, vl_status, am_count, documents (type, language, source_url)")
    .eq("session_id", sessionId)
    .order("vote_date")
    .order("code");
  return (data as ItemRow[]) ?? [];
}

export type { ConsolidatedAmendment } from "@laurus/parser";

interface AmendmentDbRow {
  number: number;
  language: string;
  target: string | null;
  tabled_by: string | null;
  original_text: string | null;
  amended_text: string | null;
  kind: ParsedAmendment["kind"];
}

/**
 * Fetch an item's amendments and consolidate them across languages (one record
 * per amendment number, with per-language text). Returns the languages present
 * so the UI can offer a language toggle.
 */
export async function getItemAmendments(
  itemId: string,
): Promise<{ amendments: ConsolidatedAmendment[]; languages: string[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("amendments")
    .select("number, language, target, tabled_by, original_text, amended_text, kind")
    .eq("item_id", itemId)
    .order("number");

  const rows = (data as AmendmentDbRow[] | null) ?? [];
  const byLanguage: Record<string, ParsedAmendment[]> = {};
  for (const r of rows) {
    (byLanguage[r.language] ??= []).push({
      number: r.number,
      language: r.language,
      kind: r.kind,
      target: r.target ?? undefined,
      tabledBy: r.tabled_by ?? undefined,
      originalText: r.original_text ?? undefined,
      amendedText: r.amended_text ?? undefined,
    });
  }

  const amendments = consolidateAmendments(byLanguage);
  const languages = Object.keys(byLanguage).sort();
  return { amendments, languages };
}

export interface VotPayload {
  itemTitle?: string;
  splitVotes: Array<{ group: string; subject: string; parts: Array<{ section: string; text: string }> }>;
  separateVotes: Array<{ group: string; targets: string }>;
  rollCalls: Array<{ group: string; targets: string }>;
}

/** Vote-request data (splits with full part text, separate votes, RCVs) per language. */
export async function getItemVotRequests(itemId: string): Promise<Record<string, VotPayload>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vot_requests")
    .select("language, payload")
    .eq("item_id", itemId);
  const out: Record<string, VotPayload> = {};
  for (const r of (data as Array<{ language: string; payload: VotPayload }> | null) ?? []) {
    out[r.language] = r.payload;
  }
  return out;
}

export async function getItemByCode(code: string): Promise<ItemRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, vote_date, vl_status, am_count, documents (type, language, source_url)")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  return (data as ItemRow) ?? null;
}

export interface OfficialVlRow {
  version_label: string;
  source_url: string;
  fetched_at: string;
}

/** Latest official list per item, for a whole part-session at once. */
export async function getOfficialVlByItem(itemIds: string[]): Promise<Map<string, OfficialVlRow>> {
  const out = new Map<string, OfficialVlRow>();
  if (itemIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("voting_lists")
    .select("item_id, version_label, source_url, fetched_at")
    .in("item_id", itemIds)
    .order("fetched_at", { ascending: false });
  for (const row of (data ?? []) as Array<OfficialVlRow & { item_id: string }>) {
    if (!out.has(row.item_id)) out.set(row.item_id, row);
  }
  return out;
}

/** What the signed-in member follows and works on, for the dashboard. */
export async function getViewerContext(): Promise<{
  followedItemIds: Set<string>;
  committees: string[];
  vlLanguage: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { followedItemIds: new Set(), committees: [], vlLanguage: "it" };
  const [{ data: subs }, { data: profile }] = await Promise.all([
    supabase.from("subscriptions").select("target_id").eq("user_id", user.id).eq("scope", "item"),
    supabase.from("users").select("committees, vl_language").eq("id", user.id).single(),
  ]);
  return {
    followedItemIds: new Set((subs ?? []).map((s) => s.target_id as string)),
    committees: (profile?.committees as string[] | null) ?? [],
    vlLanguage: (profile?.vl_language as string | null) ?? "it",
  };
}

/** The latest official Tabling Service list the live sync stored for an item. */
export async function getItemOfficialVl(itemId: string): Promise<OfficialVlRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("voting_lists")
    .select("version_label, source_url, fetched_at")
    .eq("item_id", itemId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OfficialVlRow | null) ?? null;
}
