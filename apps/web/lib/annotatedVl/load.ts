/**
 * Load everything a voting list needs for one report and build it. Shared by
 * the instant draft download and the verified-by-email route, so both start
 * from exactly the same list — the only difference is whether it is verified.
 *
 * Two sources, in order of truth:
 *   1. the OFFICIAL Tabling Service list the EP published for the file
 *      (laurus.voting_lists, pulled by the live sync from "Order and lists of
 *      votes"): its rows, order, RCV/separate marks and footer notes are kept
 *      as they are; LAURUS fills the Remarks column only — amendment text from
 *      the ingested amendments, "original text" rows from the report's motion
 *      for a resolution in the list's language;
 *   2. before the EP publishes one, a draft built from the ingested
 *      amendments (one row per amendment, by number), clearly labelled.
 */
import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseIndicativeVotingList, type AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import { parseMotionText, type MotionText } from "@laurus/parser/report-docx";
import type { VotPayload } from "@laurus/parser/vot-xml";
import { EP_BASE } from "@laurus/parser";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { fillRemarks, type AmendmentText, type FillReport } from "@/lib/fillRemarks";
import { buildVlFromAmendments, type DbAmendment } from "./fromDb";
import { getAnnotatedVl } from "./index";

export interface OfficialVl {
  versionLabel: string;
  sourceUrl: string;
  fetchedAt: string;
  /** What the Remarks fill did on the official rows. */
  fill: FillReport;
  /** False when the report text could not be read, so "original text" rows stayed empty. */
  motionRead: boolean;
}

export interface LoadedVl {
  vl: AnnotatedVotingList;
  /** Null for statically registered lists, which have no DB item behind them. */
  item: { id: string; code: string; vote_date: string | null } | null;
  amendments: DbAmendment[];
  vot: VotPayload | null;
  /** English VOT payload — splits are tabled on English, so expansion cuts on it. */
  votEn: VotPayload | null;
  /** Set when the list is the EP's own, filled by LAURUS. */
  official: OfficialVl | null;
}

/**
 * Either `laurus`-schema client: the request-scoped one (RLS as the signed-in
 * user) or the service-role one used by work that runs after the response.
 */
type LaurusClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/** PostgREST returns bytea as a "\x…" hex string. */
function bytesOf(hex: string): Buffer {
  return Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
}

/** The report's motion for a resolution in `lang`, from the EP distribution DOCX. */
export async function motionFor(epWorkId: string | null, lang: string): Promise<MotionText | null> {
  const id = epWorkId?.split("/").pop();
  if (!id) return null;
  try {
    const buf = await fetchBytesWithBackoff(`${EP_BASE}/distribution/reds_iPlRp/${id}/${id}_${lang.toLowerCase()}.docx`);
    return buf ? await parseMotionText(buf) : null;
  } catch {
    return null;
  }
}

export async function loadVotingList(
  supabase: LaurusClient,
  code: string,
  lang: string,
): Promise<LoadedVl | null> {
  const { data: item } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, vote_date, ep_work_id")
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (item) {
    const langsWanted = [...new Set([lang, "it", "en"])];
    // "en" is always in langsWanted, so votEn below can only be missing when
    // the English VOT itself was never ingested.
    const [{ data: amRows }, { data: votRows }, { data: official }] = await Promise.all([
      supabase
        .from("amendments")
        .select("number, language, target, tabled_by, original_text, amended_text, kind")
        .eq("item_id", item.id)
        .in("language", langsWanted)
        .order("number"),
      supabase.from("vot_requests").select("language, payload").eq("item_id", item.id).in("language", langsWanted),
      supabase
        .from("voting_lists")
        .select("version_label, source_url, fetched_at, docx")
        .eq("item_id", item.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Requested language first, IT/EN as fallback.
    const votByLang = new Map((votRows ?? []).map((r) => [r.language, r.payload as VotPayload]));
    const vot = votByLang.get(lang) ?? votByLang.get("it") ?? votByLang.get("en") ?? null;
    const votEn = votByLang.get("en") ?? null;
    const amendments = (amRows ?? []) as DbAmendment[];
    const itemRef = { id: item.id, code: item.code, vote_date: item.vote_date ?? null };

    if (official) {
      // One text per number: EN, then IT, then the requested language — later
      // assignments win, so the list's language is applied last.
      const byNumber = new Map<number, AmendmentText>();
      for (const l of ["en", "it", lang]) {
        for (const a of amendments) {
          if (a.language !== l) continue;
          byNumber.set(a.number, {
            number: a.number,
            amendedText: a.amended_text ?? undefined,
            originalText: a.original_text ?? undefined,
            kind: a.kind,
          });
        }
      }
      const [parsed, motion] = await Promise.all([
        parseIndicativeVotingList(bytesOf(official.docx as string)),
        motionFor(item.ep_work_id as string | null, lang),
      ]);
      const { vl, report } = fillRemarks(parsed, byNumber, motion);
      return {
        vl,
        item: itemRef,
        amendments,
        vot,
        votEn,
        official: {
          versionLabel: official.version_label as string,
          sourceUrl: official.source_url as string,
          fetchedAt: official.fetched_at as string,
          fill: report,
          motionRead: motion !== null,
        },
      };
    }

    const hasVot = !!vot && ((vot.splitVotes?.length ?? 0) > 0 || (vot.separateVotes?.length ?? 0) > 0);
    if (amendments.length > 0 || hasVot) {
      return { vl: buildVlFromAmendments(item, amendments, vot, lang), item: itemRef, amendments, vot, votEn, official: null };
    }
  }

  const registered = getAnnotatedVl(code);
  if (registered) return { vl: registered, item: null, amendments: [], vot: null, votEn: null, official: null };
  return null;
}
