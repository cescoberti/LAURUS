/**
 * Load everything a voting list needs for one report and build it. Shared by
 * the instant draft download and the verified-by-email route, so both start
 * from exactly the same list — the only difference is whether it is verified.
 */
import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import type { VotPayload } from "@laurus/parser/vot-xml";
import { buildVlFromAmendments, type DbAmendment } from "./fromDb";
import { getAnnotatedVl } from "./index";

export interface LoadedVl {
  vl: AnnotatedVotingList;
  /** Null for statically registered lists, which have no DB item behind them. */
  item: { id: string; code: string; vote_date: string | null } | null;
  amendments: DbAmendment[];
  vot: VotPayload | null;
}

/**
 * Either `laurus`-schema client: the request-scoped one (RLS as the signed-in
 * user) or the service-role one used by work that runs after the response.
 */
type LaurusClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export async function loadVotingList(
  supabase: LaurusClient,
  code: string,
  lang: string,
): Promise<LoadedVl | null> {
  const { data: item } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, vote_date")
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (item) {
    const langsWanted = [...new Set([lang, "it", "en"])];
    const [{ data: amRows }, { data: votRows }] = await Promise.all([
      supabase
        .from("amendments")
        .select("number, language, target, tabled_by, original_text, amended_text, kind")
        .eq("item_id", item.id)
        .in("language", langsWanted)
        .order("number"),
      supabase.from("vot_requests").select("language, payload").eq("item_id", item.id).in("language", langsWanted),
    ]);

    // Requested language first, IT/EN as fallback.
    const votByLang = new Map((votRows ?? []).map((r) => [r.language, r.payload as VotPayload]));
    const vot = votByLang.get(lang) ?? votByLang.get("it") ?? votByLang.get("en") ?? null;

    const amendments = (amRows ?? []) as DbAmendment[];
    const hasVot = !!vot && ((vot.splitVotes?.length ?? 0) > 0 || (vot.separateVotes?.length ?? 0) > 0);
    if (amendments.length > 0 || hasVot) {
      return {
        vl: buildVlFromAmendments(item, amendments, vot, lang),
        item: { id: item.id, code: item.code, vote_date: item.vote_date ?? null },
        amendments,
        vot,
      };
    }
  }

  const registered = getAnnotatedVl(code);
  if (registered) return { vl: registered, item: null, amendments: [], vot: null };
  return null;
}
