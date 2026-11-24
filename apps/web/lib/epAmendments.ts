/**
 * The amendment DOCX the EP publishes for a report: locating the blocks,
 * reading them, and taking the text of an amendment LAURUS has not ingested
 * in a language yet. SERVER ONLY.
 *
 * The voting-list builder and the verification of the list it builds both go
 * to these same files — one to quote them, the other to re-read the quote
 * against them — so finding and parsing them lives in one place.
 */
import { parseAmendmentsDocx } from "@laurus/parser/amendments-docx";
import { amendmentBlockUrl } from "@laurus/parser";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE = "https://data.europarl.europa.eu";
/** How long the year's block index is reused before it is paged again. */
const INDEX_MAX_AGE_MS = 3 * 3_600_000;

/** One amendment as the published DOCX has it. */
export interface FreshAmendment {
  original?: string;
  amended?: string;
  kind: string;
}

/** 'A10-0163/2026' → 'A-10-2026-0163' (the EP document identifier). */
export function epDocId(code: string): string | null {
  const m = code.match(/^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  const [, prefix, term, num, year] = m;
  return `${prefix}-${term}-${year}-${num.padStart(4, "0")}`;
}

/**
 * Amendment blocks published for a report, e.g. 'A-10-2026-0170-AM-006-010'.
 *
 * The EP API has no per-report filter, so this means paging the year's whole
 * AMENDMENT_LIST index. That index is the same for every report, so the caller
 * can hand in a cached copy (`index`) and get zero network calls; when it has
 * to be fetched, the fresh index comes back so the caller can store it.
 */
export async function amendmentBlockIds(
  code: string,
  year: number,
  index: string[] | null,
): Promise<{ blocks: string[] | null; freshIndex: string[] | null }> {
  const docId = epDocId(code);
  if (!docId) return { blocks: null, freshIndex: null };
  const wanted = `${docId}-AM-`;

  if (index?.length) {
    return { blocks: index.filter((id) => id.startsWith(wanted)), freshIndex: null };
  }

  const all: string[] = [];
  for (let offset = 0; offset < 4000; offset += 500) {
    const url =
      `${BASE}/api/v2/documents?year=${year}&work-type=AMENDMENT_LIST` +
      `&limit=500&offset=${offset}&format=application%2Fld%2Bjson`;
    const body = await fetchBytesWithBackoff(url);
    if (!body) break;
    const rows = (JSON.parse(body.toString("utf8")) as { data?: Array<{ identifier: string }> }).data ?? [];
    for (const r of rows) if (r.identifier) all.push(r.identifier);
    if (rows.length < 500) break;
  }
  if (!all.length) return { blocks: null, freshIndex: null };
  return { blocks: all.filter((id) => id.startsWith(wanted)), freshIndex: all };
}

/**
 * The blocks of one report, through the cached index when it is recent and
 * knows the report — paging the year on the EP is what takes the time, and
 * the copy kept in `ep_doc_index` saves every caller from it.
 */
export async function amendmentBlocksFor(code: string, year: number): Promise<string[]> {
  const admin = createAdminClient();
  const { data: idx } = await admin
    .from("ep_doc_index")
    .select("identifiers, fetched_at")
    .eq("year", year)
    .eq("work_type", "AMENDMENT_LIST")
    .maybeSingle();
  const cached =
    idx && Date.parse(idx.fetched_at as string) > Date.now() - INDEX_MAX_AGE_MS ? (idx.identifiers as string[]) : null;

  let found = await amendmentBlockIds(code, year, cached);
  // A cached index with nothing for this report may simply predate it.
  if (cached && !found.blocks?.length) found = await amendmentBlockIds(code, year, null);
  if (found.freshIndex) {
    await admin.from("ep_doc_index").upsert(
      { year, work_type: "AMENDMENT_LIST", identifiers: found.freshIndex, fetched_at: new Date().toISOString() },
      { onConflict: "year,work_type" },
    );
  }
  return found.blocks ?? [];
}

/**
 * The amendment blocks of a report, re-downloaded and parsed now, in one
 * language. A block the EP has not published in that language answers with
 * something that is not a DOCX ("PK" is how a real one starts): it is left
 * out rather than parsed as an error page, so a partly translated report
 * still yields the amendments that are there.
 *
 * A report has a handful of blocks, so a little concurrency is safe here —
 * the EP rate limiter only bites on bulk ingestion of the whole year.
 */
export async function readAmendmentBlocks(
  blocks: string[],
  language: string,
): Promise<{ byNumber: Map<number, FreshAmendment>; blocksRead: number; error: string | null }> {
  let error: string | null = null;
  const byNumber = new Map<number, FreshAmendment>();
  let blocksRead = 0;
  const parsedBlocks = await mapLimit(blocks, 3, async (id) => {
    const url = amendmentBlockUrl(id, language);
    try {
      const buf = await fetchBytesWithBackoff(url);
      if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return null;
      return await parseAmendmentsDocx(buf, language);
    } catch (err) {
      error ??= (err as Error).message;
      return null;
    }
  });
  for (const parsed of parsedBlocks) {
    if (!parsed) continue;
    for (const a of parsed) byNumber.set(a.number, { original: a.originalText, amended: a.amendedText, kind: a.kind });
    blocksRead++;
  }
  return { byNumber, blocksRead, error };
}

/**
 * The amendments of a report in `language`, read off the EP's own files.
 *
 * For the rows the database cannot dress in the list's language: the EP
 * publishes a report's amendments in English first and translates them block
 * by block over the following hours, and the ingestion that stores them runs
 * on its own clock. Between the two, an Italian list would quote the English
 * original — correct text, wrong language, and a verification that reads it
 * against the Italian file and calls every row a mismatch. Going to the file
 * now costs a few downloads and only happens when something is missing.
 */
export async function amendmentTextsFromEp(
  code: string,
  language: string,
): Promise<Map<number, FreshAmendment>> {
  const year = Number(code.slice(-4));
  if (!Number.isFinite(year)) return new Map();
  try {
    const blocks = await amendmentBlocksFor(code, year);
    if (!blocks.length) return new Map();
    const { byNumber } = await readAmendmentBlocks(blocks, language);
    return byNumber;
  } catch {
    // The list is built either way: a row left in English is a row the
    // verification reports, which is better than no list at all.
    return new Map();
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}
