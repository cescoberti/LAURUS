/**
 * Two-pass verification of a generated annotated voting list. SERVER ONLY.
 *
 * A voting list is an operational document: an advisor votes off it. So it is
 * never handed over as "checked" unless BOTH passes below actually ran and
 * found nothing:
 *
 *   Pass 1 — completeness, against the data LAURUS holds. Every ingested
 *            amendment appears exactly once, no Remarks silently empty, every
 *            split (with all its parts) and separate request has a row, every
 *            roll-call is deliberately excluded, exactly one final-vote row.
 *
 *   Pass 2 — correctness, against the official sources RE-DOWNLOADED now. The
 *            VOT XML and the amendment DOCX blocks are fetched again and parsed
 *            independently, then compared text by text with what the list says.
 *            This is what catches a stale or mis-ingested database.
 *
 * `verified` is true only when every check passed. A pass that could not run
 * (source offline, rate-limited) yields `skipped` checks and `verified: false`
 * — an unverifiable list is reported as unverified, never as clean.
 */
import type { AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import { parseVotXml, type VotPayload } from "@laurus/parser/vot-xml";
import { parseAmendmentsDocx } from "@laurus/parser/amendments-docx";
import { remarksFor } from "@laurus/parser";
import { createHash } from "node:crypto";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import type { DbAmendment } from "@/lib/annotatedVl/fromDb";

const BASE = "https://data.europarl.europa.eu";
const TERM = 10;

export interface VlCheck {
  id: string;
  pass: 1 | 2;
  label: string;
  status: "ok" | "issue" | "skipped";
  detail: string;
}

export interface VlVerificationReport {
  itemCode: string;
  language: string;
  generatedAt: string;
  counts: {
    rows: number;
    amendments: number;
    splits: number;
    separates: number;
    rollCallsExcluded: number;
  };
  checks: VlCheck[];
  /** True only if both passes ran and every check is 'ok'. */
  verified: boolean;
  /** Roll-call requests deliberately left off the list, for the record. */
  rollCalls: Array<{ group: string; targets: string }>;
}

// ---------------------------------------------------------------------------
// Text comparison
// ---------------------------------------------------------------------------

/**
 * Compare the words, not the markup: strip the light HTML the Remarks carry
 * (<b>/<i>/<s>), unify quotes and whitespace. A wording difference is a real
 * problem; a bold-tag difference between parser versions is not.
 */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const same = (a: string | null | undefined, b: string | null | undefined) => norm(a) === norm(b);

function short(s: string, max = 90): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Pass 1 — completeness against what LAURUS holds
// ---------------------------------------------------------------------------

export function verifyCompleteness(
  vl: AnnotatedVotingList,
  amendments: DbAmendment[],
  vot: VotPayload | null,
  lang: string,
): VlCheck[] {
  const checks: VlCheck[] = [];
  const add = (id: string, label: string, issues: string[], okDetail: string) =>
    checks.push({
      id,
      pass: 1,
      label,
      status: issues.length ? "issue" : "ok",
      detail: issues.length ? issues.join(" · ") : okDetail,
    });

  const amRows = vl.rows.filter((r) => r.amNo);
  const splitRows = vl.rows.filter((r) => r.voteType === "split");
  const separateRows = vl.rows.filter((r) => r.voteType === "separate");

  // Expected amendment numbers: one per number in the best available language.
  const expected = new Set<number>();
  for (const a of amendments) expected.add(a.number);

  // 1. every ingested amendment is on the list
  const present = new Set(amRows.map((r) => Number(r.amNo)));
  const missing = [...expected].filter((n) => !present.has(n)).sort((a, b) => a - b);
  add(
    "am-coverage",
    "Every ingested amendment is on the list",
    missing.length ? [`missing amendment ${missing.join(", ")}`] : [],
    `${expected.size} amendments, all present`,
  );

  // 2. no duplicates
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of amRows) {
    if (seen.has(r.amNo!)) dupes.add(r.amNo!);
    seen.add(r.amNo!);
  }
  add("am-duplicates", "No amendment appears twice", dupes.size ? [`duplicated: ${[...dupes].join(", ")}`] : [], "no duplicates");

  // 3. Remarks filled wherever the source has text
  const textByNumber = new Map<number, DbAmendment>();
  for (const l of ["en", "it", lang]) for (const a of amendments) if (a.language === l) textByNumber.set(a.number, a);
  const emptyRemarks: string[] = [];
  for (const r of amRows) {
    const src = textByNumber.get(Number(r.amNo));
    const hasSource = !!(src?.original_text?.trim() || src?.amended_text?.trim());
    if (hasSource && !r.remarks.trim()) emptyRemarks.push(`am ${r.amNo}`);
  }
  add(
    "remarks-filled",
    "No Remarks left empty where the amendment has text",
    emptyRemarks.length ? [`empty: ${emptyRemarks.join(", ")}`] : [],
    `${amRows.length} rows checked`,
  );

  // 4. every split request is on the list, with all its parts
  const splitIssues: string[] = [];
  for (const sv of vot?.splitVotes ?? []) {
    const row = splitRows.find((r) => same(r.subject, sv.subject) && same(r.author, sv.group));
    if (!row) {
      splitIssues.push(`split "${short(sv.subject, 40)}" (${sv.group}) has no row`);
      continue;
    }
    if (row.splitParts.length !== sv.parts.length) {
      splitIssues.push(`split "${short(sv.subject, 40)}": ${row.splitParts.length} parts on the list vs ${sv.parts.length} requested`);
      continue;
    }
    for (const [i, p] of sv.parts.entries()) {
      if (!same(row.splitParts[i]!.remarks, p.text)) {
        splitIssues.push(`split "${short(sv.subject, 40)}" part ${i + 1}: text differs from the request`);
      }
    }
  }
  add("split-coverage", "Every split request is on the list with all its parts", splitIssues, `${vot?.splitVotes?.length ?? 0} split requests`);

  // 5. every separate request is on the list
  const sepIssues: string[] = [];
  for (const s of vot?.separateVotes ?? []) {
    if (!separateRows.some((r) => same(r.subject, s.targets) && same(r.author, s.group))) {
      sepIssues.push(`separate "${short(s.targets, 40)}" (${s.group}) has no row`);
    }
  }
  add("separate-coverage", "Every separate request is on the list", sepIssues, `${vot?.separateVotes?.length ?? 0} separate requests`);

  // 6. roll-calls deliberately excluded — they are already flagged on the VL
  const rcvIssues: string[] = [];
  for (const rc of vot?.rollCalls ?? []) {
    if (vl.rows.some((r) => !r.isFinalVote && same(r.subject, rc.targets) && r.voteType !== "split" && r.voteType !== "separate")) {
      rcvIssues.push(`roll-call "${short(rc.targets, 40)}" should not be a row of its own`);
    }
  }
  add(
    "rcv-excluded",
    "Roll-call requests are excluded by design",
    rcvIssues,
    `${vot?.rollCalls?.length ?? 0} roll-call requests, none added as rows`,
  );

  // 7. exactly one final-vote row, and it is last
  const finalIdx = vl.rows.map((r, i) => (r.isFinalVote ? i : -1)).filter((i) => i >= 0);
  const finalIssues: string[] = [];
  if (finalIdx.length !== 1) finalIssues.push(`${finalIdx.length} final-vote rows`);
  else if (finalIdx[0] !== vl.rows.length - 1) finalIssues.push("the final vote is not the last row");
  add("final-vote", "Exactly one final-vote row, at the end", finalIssues, "final vote in place");

  return checks;
}

// ---------------------------------------------------------------------------
// Pass 2 — correctness against the official sources, re-downloaded now
// ---------------------------------------------------------------------------

/** 'A10-0163/2026' → 'A-10-2026-0163' (the EP document identifier). */
function epDocId(code: string): string | null {
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
async function amendmentBlockIds(
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

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export async function verifyAgainstSource(
  vl: AnnotatedVotingList,
  opts: {
    itemCode: string;
    voteDate: string | null;
    language: string;
    /** Cached AMENDMENT_LIST index for the year, to skip paging the API. */
    amendmentIndex?: string[] | null;
    /** Called with a freshly fetched index so the caller can cache it. */
    onIndexFetched?: (identifiers: string[]) => void;
  },
): Promise<VlCheck[]> {
  const checks: VlCheck[] = [];
  const { itemCode, voteDate, language } = opts;

  // --- 2a. vote requests, re-derived from the official VOT XML --------------
  if (!voteDate) {
    checks.push({
      id: "vot-source",
      pass: 2,
      label: "Split/separate re-checked against the official VOT",
      status: "skipped",
      detail: "the report has no vote date yet, so no VOT file exists to check against",
    });
  } else {
    const votUrl = `${BASE}/distribution/doc/PV-${TERM}-${voteDate}-VOT_${language}.xml`;
    let fresh: VotPayload | null = null;
    let fetchError: string | null = null;
    try {
      const body = await fetchBytesWithBackoff(votUrl);
      if (body) {
        const votes = parseVotXml(body.toString("utf8"));
        fresh = votes.find((v) => v.codes.includes(itemCode))?.payload ?? null;
      } else {
        fetchError = "the VOT file for that sitting day is not published";
      }
    } catch (err) {
      fetchError = (err as Error).message;
    }

    if (fetchError) {
      checks.push({
        id: "vot-source",
        pass: 2,
        label: "Split/separate re-checked against the official VOT",
        status: "skipped",
        detail: fetchError,
      });
    } else {
      const issues: string[] = [];
      const splitRows = vl.rows.filter((r) => r.voteType === "split");
      const separateRows = vl.rows.filter((r) => r.voteType === "separate");

      for (const sv of fresh?.splitVotes ?? []) {
        const row = splitRows.find((r) => same(r.subject, sv.subject) && same(r.author, sv.group));
        if (!row) {
          issues.push(`the official VOT has a split on "${short(sv.subject, 40)}" (${sv.group}) that the list does not`);
          continue;
        }
        if (row.splitParts.length !== sv.parts.length) {
          issues.push(`split "${short(sv.subject, 40)}": the VOT requests ${sv.parts.length} parts, the list has ${row.splitParts.length}`);
          continue;
        }
        for (const [i, p] of sv.parts.entries()) {
          if (!same(row.splitParts[i]!.remarks, p.text)) {
            issues.push(`split "${short(sv.subject, 40)}" part ${i + 1}: wording differs from the official VOT`);
          }
        }
      }
      for (const s of fresh?.separateVotes ?? []) {
        if (!separateRows.some((r) => same(r.subject, s.targets) && same(r.author, s.group))) {
          issues.push(`the official VOT has a separate vote on "${short(s.targets, 40)}" (${s.group}) that the list does not`);
        }
      }
      // and nothing invented in the other direction
      for (const r of splitRows) {
        if (!(fresh?.splitVotes ?? []).some((sv) => same(sv.subject, r.subject) && same(sv.group, r.author))) {
          issues.push(`the list has a split on "${short(r.subject, 40)}" that the official VOT does not request`);
        }
      }
      for (const r of separateRows) {
        if (!(fresh?.separateVotes ?? []).some((s) => same(s.targets, r.subject) && same(s.group, r.author))) {
          issues.push(`the list has a separate vote on "${short(r.subject, 40)}" that the official VOT does not request`);
        }
      }

      checks.push({
        id: "vot-source",
        pass: 2,
        label: "Split/separate re-checked against the official VOT",
        status: issues.length ? "issue" : "ok",
        detail: issues.length
          ? issues.join(" · ")
          : `${fresh?.splitVotes?.length ?? 0} splits and ${fresh?.separateVotes?.length ?? 0} separates match the VOT re-downloaded now`,
      });
    }
  }

  // --- 2b. Remarks, re-derived from the published amendment DOCX -----------
  const amRows = vl.rows.filter((r) => r.amNo);
  if (amRows.length === 0) {
    checks.push({
      id: "am-source",
      pass: 2,
      label: "Remarks re-checked against the published amendments",
      status: "ok",
      detail: "the list carries no amendment rows",
    });
    return checks;
  }

  const year = Number(itemCode.slice(-4));
  let blocks: string[] | null = null;
  let amError: string | null = null;
  try {
    const found = await amendmentBlockIds(itemCode, year, opts.amendmentIndex ?? null);
    blocks = found.blocks;
    if (found.freshIndex) opts.onIndexFetched?.(found.freshIndex);
  } catch (err) {
    amError = (err as Error).message;
  }

  if (amError || !blocks || blocks.length === 0) {
    checks.push({
      id: "am-source",
      pass: 2,
      label: "Remarks re-checked against the published amendments",
      status: "skipped",
      detail: amError ?? "the published amendment files for this report could not be located",
    });
    return checks;
  }

  // A report has a handful of blocks, so a little concurrency is safe here —
  // the EP rate limiter only bites on bulk ingestion of the whole year.
  const freshByNumber = new Map<number, { original?: string; amended?: string }>();
  let blocksRead = 0;
  const parsedBlocks = await mapLimit(blocks, 3, async (id) => {
    const url = `${BASE}/distribution/reds_iPlRp_Amd/${id}/${id}_${language}.docx`;
    try {
      const buf = await fetchBytesWithBackoff(url);
      if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return null;
      return await parseAmendmentsDocx(buf, language);
    } catch (err) {
      amError ??= (err as Error).message;
      return null;
    }
  });
  for (const parsed of parsedBlocks) {
    if (!parsed) continue;
    for (const a of parsed) freshByNumber.set(a.number, { original: a.originalText, amended: a.amendedText });
    blocksRead++;
  }

  if (amError && freshByNumber.size === 0) {
    checks.push({
      id: "am-source",
      pass: 2,
      label: "Remarks re-checked against the published amendments",
      status: "skipped",
      detail: amError,
    });
    return checks;
  }

  const issues: string[] = [];
  let compared = 0;
  for (const r of amRows) {
    const fresh = freshByNumber.get(Number(r.amNo));
    if (!fresh) {
      issues.push(`am ${r.amNo}: not found in the published amendment files, so its Remarks could not be confirmed`);
      continue;
    }
    compared++;
    const expected = remarksFor(fresh.original ?? null, fresh.amended ?? null);
    if (!same(expected, r.remarks)) {
      issues.push(`am ${r.amNo}: Remarks differ from the published text`);
    }
  }

  checks.push({
    id: "am-source",
    pass: 2,
    label: "Remarks re-checked against the published amendments",
    status: issues.length ? "issue" : "ok",
    detail: issues.length
      ? issues.join(" · ")
      : `${compared} Remarks match the amendment files re-downloaded now (${blocksRead} blocks read)`,
  });

  return checks;
}

// ---------------------------------------------------------------------------
// Both passes
// ---------------------------------------------------------------------------

/**
 * Identity of the list itself — hash of the rows that carry meaning. Two builds
 * with the same fingerprint are the same document, so a verification of one
 * applies to the other (see the reuse rule in /api/vl-request).
 */
export function votingListFingerprint(vl: AnnotatedVotingList): string {
  const material = vl.rows.map((r) => ({
    s: r.subject,
    a: r.amNo,
    au: r.author,
    t: r.voteType,
    r: r.remarks,
    p: r.splitParts.map((p) => [p.label, p.remarks]),
    f: !!r.isFinalVote,
  }));
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export async function verifyVotingList(
  vl: AnnotatedVotingList,
  ctx: {
    itemCode: string;
    voteDate: string | null;
    language: string;
    amendments: DbAmendment[];
    vot: VotPayload | null;
    amendmentIndex?: string[] | null;
    onIndexFetched?: (identifiers: string[]) => void;
  },
): Promise<VlVerificationReport> {
  const pass1 = verifyCompleteness(vl, ctx.amendments, ctx.vot, ctx.language);

  let pass2: VlCheck[];
  try {
    pass2 = await verifyAgainstSource(vl, {
      itemCode: ctx.itemCode,
      voteDate: ctx.voteDate,
      language: ctx.language,
      amendmentIndex: ctx.amendmentIndex,
      onIndexFetched: ctx.onIndexFetched,
    });
  } catch (err) {
    pass2 = [
      {
        id: "source-pass",
        pass: 2,
        label: "Re-check against the official sources",
        status: "skipped",
        detail: `the official sources could not be re-read: ${(err as Error).message}`,
      },
    ];
  }

  const checks = [...pass1, ...pass2];
  return {
    itemCode: ctx.itemCode,
    language: ctx.language,
    generatedAt: new Date().toISOString(),
    counts: {
      rows: vl.rows.length,
      amendments: vl.rows.filter((r) => r.amNo).length,
      splits: vl.rows.filter((r) => r.voteType === "split").length,
      separates: vl.rows.filter((r) => r.voteType === "separate").length,
      rollCallsExcluded: ctx.vot?.rollCalls?.length ?? 0,
    },
    checks,
    verified: checks.every((c) => c.status === "ok"),
    rollCalls: ctx.vot?.rollCalls ?? [],
  };
}
