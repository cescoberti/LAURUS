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
import {
  parseIndicativeVotingList,
  splitRequestsFromNotes,
  votingSchemeFromNotes,
  subjectKey,
  isSecondReading,
  type AnnotatedVotingList,
} from "@laurus/parser/voting-list-docx";
import { articleTextFor } from "@laurus/parser/council-position";
import { loadCouncilPosition, type LoadedCouncilPosition } from "./councilPosition";
import { parseMotionText, type MotionText } from "@laurus/parser/report-docx";
import type { VotPayload } from "@laurus/parser/vot-xml";
import { documentTextUrl } from "@laurus/parser";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { fillRemarks, type AmendmentText, type FillReport } from "@/lib/fillRemarks";
import { amendmentTextsFromEp } from "@/lib/epAmendments";
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
  /** Set for a second reading: the Council position the list votes on, EN and the list's language. */
  councilPosition: LoadedCouncilPosition | null;
  /** Amendments whose text was read off the EP's own file because the ingestion did not hold it in the list's language. */
  fetchedTranslations: number[];
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

/** The motion for a resolution in `lang` — of a report (A-) or a motion (B-). */
/**
 * The English VOT the split expansion cuts on. After the vote that is the real
 * payload; before it, the only record of the requests is the official list's
 * own footer notes, so those stand in. A list LAURUS built itself has neither.
 *
 * The three routes that expand splits each wrote this ternary out, which is
 * three chances for the pre-vote fallback to drift from the post-vote one.
 *
 * Where the list prints a "Voting scheme" the scheme wins over the requests
 * it merges: two groups cutting one subject in different places are put as a
 * single vote in more parts, and only the scheme says how many. On
 * A10-0297/2026 the ECR and ESN requests had two parts each and the row three.
 */
export function votEnFor(loaded: LoadedVl): VotPayload | null {
  if (loaded.votEn) return loaded.votEn;
  if (!loaded.official) return null;
  const requests = splitRequestsFromNotes(loaded.vl.notes);
  const scheme = votingSchemeFromNotes(loaded.vl.notes);
  const scheduled = new Set(scheme.map((s) => subjectKey(s.subject)));
  return {
    splitVotes: [...scheme, ...requests.filter((r) => !scheduled.has(subjectKey(r.subject)))],
    separateVotes: [],
    rollCalls: [],
  };
}

/** Resolve an "Article 5, § 1, point 31" subject on the position, in `lang`. */
export function articleTextIn(
  position: LoadedCouncilPosition | null,
  lang: string,
): ((subject: string) => string | null) | null {
  const indexed = position?.byLang.get(lang.toLowerCase());
  return indexed ? (subject: string) => articleTextFor(subject, indexed) : null;
}

export async function motionFor(epWorkId: string | null, lang: string): Promise<MotionText | null> {
  const id = epWorkId?.split("/").pop();
  if (!id) return null;
  try {
    const buf = await fetchBytesWithBackoff(documentTextUrl(id, lang));
    return buf ? await parseMotionText(buf) : null;
  } catch {
    return null;
  }
}

/**
 * The ingested amendments, plus — for the numbers the database holds in some
 * other language only — the EP's own text in `lang`, read off the published
 * file now.
 *
 * The EP tables a report's amendments in English and publishes the
 * translations block by block over the hours that follow, while the
 * ingestion that stores them runs on its own clock. A list built in between
 * quoted the English original, because quoting is the rule and re-writing is
 * not: the right text in the wrong language, and a pass-2 verification that
 * reads it against the Italian file and calls every row a mismatch. The
 * Italian list for A10-0310/2026 was built at 16:28 UTC and the Italian
 * amendments were ingested at 18:21 UTC, the evening before the vote; all
 * eight rows came back "differ".
 *
 * So the file is read directly, and only for the rows that need it. The text
 * is the EP's, verbatim; what LAURUS already holds is left alone; and nothing
 * is written back, so the ingestion stays the only writer of
 * `laurus.amendments`.
 */
async function withEpTranslations(
  code: string,
  amendments: DbAmendment[],
  lang: string,
): Promise<{ amendments: DbAmendment[]; fetchedTranslations: number[] }> {
  const numbers = new Set(amendments.map((a) => a.number));
  const have = new Set(amendments.filter((a) => a.language === lang).map((a) => a.number));
  const missing = [...numbers].filter((n) => !have.has(n)).sort((a, b) => a - b);
  if (!missing.length) return { amendments, fetchedTranslations: [] };

  const fresh = await amendmentTextsFromEp(code, lang);
  const added: DbAmendment[] = [];
  for (const number of missing) {
    const text = fresh.get(number);
    if (!text || (!text.original && !text.amended)) continue;
    // The amendment file carries the text, not the list metadata: the subject
    // it amends, who tabled it and whether it was withdrawn stay as ingested.
    const known =
      amendments.find((a) => a.number === number && a.language === "en") ??
      amendments.find((a) => a.number === number);
    added.push({
      number,
      language: lang,
      target: known?.target ?? null,
      tabled_by: known?.tabled_by ?? null,
      original_text: text.original ?? null,
      amended_text: text.amended ?? null,
      kind: known?.kind ?? text.kind,
    });
  }
  if (!added.length) return { amendments, fetchedTranslations: [] };
  return { amendments: [...amendments, ...added], fetchedTranslations: added.map((a) => a.number) };
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
    const { amendments, fetchedTranslations } = await withEpTranslations(code, (amRows ?? []) as DbAmendment[], lang);
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
      // A second reading votes on the Council position, not on a motion of
      // Parliament's: its rows name articles of the act. Fetching that is two
      // PDFs off the Council register, so it is only attempted for a list
      // shaped like one — every other file reads exactly as before.
      const councilPosition = isSecondReading(parsed) || parsed.rows.some((r) => /^article\b/i.test(r.subject.trim()))
        ? await loadCouncilPosition(item.ep_work_id as string | null, code, [lang, "en"])
        : null;
      const { vl, report } = fillRemarks(parsed, byNumber, motion, articleTextIn(councilPosition, lang));
      return {
        vl,
        item: itemRef,
        amendments,
        vot,
        votEn,
        councilPosition,
        fetchedTranslations,
        official: {
          versionLabel: official.version_label as string,
          sourceUrl: official.source_url as string,
          fetchedAt: official.fetched_at as string,
          fill: report,
          motionRead: motion !== null || councilPosition !== null,
        },
      };
    }

    const hasVot = !!vot && ((vot.splitVotes?.length ?? 0) > 0 || (vot.separateVotes?.length ?? 0) > 0);
    if (amendments.length > 0 || hasVot) {
      return {
        vl: buildVlFromAmendments(item, amendments, vot, lang),
        item: itemRef,
        amendments,
        vot,
        votEn,
        official: null,
        councilPosition: null,
        fetchedTranslations,
      };
    }
  }

  const registered = getAnnotatedVl(code);
  if (registered) {
    return { vl: registered, item: null, amendments: [], vot: null, votEn: null, official: null, councilPosition: null, fetchedTranslations: [] };
  }
  return null;
}
