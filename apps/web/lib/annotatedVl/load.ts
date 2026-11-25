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
import { documentTextUrl, type RemarksStyle } from "@laurus/parser";
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
  return votPayloadFromNotes(loaded.vl.notes);
}

/**
 * The requests as the list's own footer prints them, shaped like the VOT
 * payload. Also what the file page shows under Split & Separate before the
 * VOT exists: the list is out the day before the vote, the VOT after it.
 */
export function votPayloadFromNotes(notes: string[]): VotPayload {
  const requests = splitRequestsFromNotes(notes);
  const scheme = votingSchemeFromNotes(notes);
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

const AM_COLUMNS = "number, language, target, tabled_by, original_text, amended_text, kind";
/** The EP's own runs and column headings, added by migration 0019. */
const AM_COLUMNS_RICH = `${AM_COLUMNS}, original_rich, amended_rich, original_header, amended_header`;

/**
 * The ingested amendments of one item, in the languages that matter.
 *
 * Asked for with the formatting columns first, and again without them if the
 * database has not been migrated yet — a missing column must cost the voting
 * list its bold, not the whole list.
 */
async function amendmentRowsFor(supabase: LaurusClient, itemId: string, languages: string[]): Promise<DbAmendment[]> {
  const query = (columns: string) =>
    supabase.from("amendments").select(columns).eq("item_id", itemId).in("language", languages).order("number");
  const { data, error } = await query(AM_COLUMNS_RICH);
  if (!error) return (data ?? []) as unknown as DbAmendment[];
  const { data: plain } = await query(AM_COLUMNS);
  return (plain ?? []) as unknown as DbAmendment[];
}

/** A row LAURUS can quote as the EP prints it: the runs and the headings are there. */
function quotable(a: DbAmendment | undefined): boolean {
  return !!a && (!!a.amended_header || !!a.original_header || !!a.amended_rich || !!a.original_rich);
}

/**
 * The ingested amendments, with the EP's own file filling what the database
 * cannot give: the text in the list's language, and the runs and column
 * headings the Remarks quote.
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
 * The same goes for a row ingested before migration 0019, which has the text
 * but not the EP's bold or the name of either column.
 *
 * So the file is read directly, and only when a row needs it — once the
 * ingestion has been through those blocks again (`--refresh`), it never is.
 * The text is the EP's, verbatim; what LAURUS already holds is left alone;
 * and nothing is written back, so the ingestion stays the only writer of
 * `laurus.amendments`.
 */
async function withEpTranslations(
  code: string,
  amendments: DbAmendment[],
  lang: string,
): Promise<{ amendments: DbAmendment[]; fetchedTranslations: number[] }> {
  const numbers = [...new Set(amendments.map((a) => a.number))].sort((a, b) => a - b);
  const inLang = new Map(amendments.filter((a) => a.language === lang).map((a) => [a.number, a]));
  const missing = numbers.filter((n) => !quotable(inLang.get(n)));
  if (!missing.length) return { amendments, fetchedTranslations: [] };

  const fresh = await amendmentTextsFromEp(code, lang);
  const rows = [...amendments];
  const fetched: number[] = [];
  for (const number of missing) {
    const text = fresh.get(number);
    if (!text || (!text.original && !text.amended)) continue;
    // The amendment file carries the text, not the list metadata: the subject
    // it amends, who tabled it and whether it was withdrawn stay as ingested.
    const known = inLang.get(number) ?? amendments.find((a) => a.number === number && a.language === "en") ?? amendments.find((a) => a.number === number);
    const row: DbAmendment = {
      number,
      language: lang,
      target: known?.target ?? null,
      tabled_by: known?.tabled_by ?? null,
      original_text: text.original ?? null,
      amended_text: text.amended ?? null,
      original_rich: text.originalRich ?? null,
      amended_rich: text.amendedRich ?? null,
      original_header: text.originalHeader ?? null,
      amended_header: text.amendedHeader ?? null,
      kind: known?.kind ?? text.kind,
    };
    const at = rows.findIndex((a) => a.number === number && a.language === lang);
    if (at >= 0) rows[at] = row;
    else rows.push(row);
    fetched.push(number);
  }
  if (!fetched.length) return { amendments, fetchedTranslations: [] };
  return { amendments: rows, fetchedTranslations: fetched };
}

export async function loadVotingList(
  supabase: LaurusClient,
  code: string,
  lang: string,
  /** How the Remarks quote the amendment — the member's choice, default the EP's two columns. */
  style: RemarksStyle = "columns",
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
    const [amRows, { data: votRows }, { data: official }] = await Promise.all([
      amendmentRowsFor(supabase, item.id as string, langsWanted),
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
    const { amendments, fetchedTranslations } = await withEpTranslations(code, amRows, lang);
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
            amendedRich: a.amended_rich ?? undefined,
            originalRich: a.original_rich ?? undefined,
            originalHeader: a.original_header ?? undefined,
            amendedHeader: a.amended_header ?? undefined,
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
      const { vl, report } = fillRemarks(parsed, byNumber, motion, articleTextIn(councilPosition, lang), style);
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
        vl: buildVlFromAmendments(item, amendments, vot, lang, style),
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
