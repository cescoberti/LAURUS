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
import { isSecondReading, type AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import { parseVotXml, type VotPayload } from "@laurus/parser/vot-xml";
import { remarksFor } from "@laurus/parser";
import { createHash } from "node:crypto";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { amendmentBlockIds, readAmendmentBlocks, type FreshAmendment } from "@/lib/epAmendments";
import type { DbAmendment } from "@/lib/annotatedVl/fromDb";
import { splitFallNote } from "@/lib/fillRemarks";

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

/**
 * Where a Remark and the published amendment part company, in words. A bare
 * "differs" leaves the advisor to re-read a whole paragraph against a DOCX;
 * the first words that disagree say at a glance whether it is a stale
 * ingestion, the wrong amendment or a translation.
 */
function firstDifference(written: string, published: string): string {
  const words = (t: string) =>
    t
      .replace(/<[^>]+>/g, " ")
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  const a = words(written);
  const b = words(published);
  let i = 0;
  while (i < a.length && i < b.length && a[i]!.toLowerCase() === b[i]!.toLowerCase()) i++;
  const from = (w: string[]) => short(w.slice(Math.max(0, i - 3), i + 7).join(" "), 70) || "(nothing)";
  return `the list reads “${from(a)}”, the file “${from(b)}”`;
}

function short(s: string, max = 90): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Pass 1 — completeness against what LAURUS holds
// ---------------------------------------------------------------------------

/** Rows that vote on an amendment — "§" (original text) rows carry no number. */
function amendmentRows(vl: AnnotatedVotingList) {
  return vl.rows.filter((r) => /^\d+$/.test((r.amNo ?? "").trim()));
}

export function verifyCompleteness(
  vl: AnnotatedVotingList,
  amendments: DbAmendment[],
  vot: VotPayload | null,
  lang: string,
  /** The list is the EP's own: what is not on it was taken off by the Tabling Service. */
  official = false,
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

  const amRows = amendmentRows(vl);
  const splitRows = vl.rows.filter((r) => r.voteType === "split");
  const separateRows = vl.rows.filter((r) => r.voteType === "separate");

  // Expected amendment numbers: one per number in the best available language.
  const expected = new Set<number>();
  for (const a of amendments) expected.add(a.number);

  // 1. every ingested amendment is on the list — on an official list an
  //    amendment that is not there was cancelled or withdrawn, which is
  //    information, not a defect (the list's own notes usually say so).
  const present = new Set(amRows.map((r) => Number(r.amNo)));
  const missing = [...expected].filter((n) => !present.has(n)).sort((a, b) => a - b);
  add(
    "am-coverage",
    official ? "Ingested amendments not on the official list" : "Every ingested amendment is on the list",
    missing.length && !official ? [`missing amendment ${missing.join(", ")}`] : [],
    missing.length
      ? `am ${missing.join(", ")} published but not on the EP's list (cancelled or withdrawn)`
      : `${expected.size} amendments, all present`,
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
      // Expanded rows keep the official notation in `notation`; that is what
      // must match the request, not the reconstructed full text.
      const part = row.splitParts[i]!;
      if (!same(part.notation ?? part.remarks, p.text)) {
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

  // 7. exactly one final-vote row, and it is last — except in second reading,
  //    where Parliament votes the Council position article by article and
  //    there is no final vote at all. The list says so itself ("N.B. There is
  //    no final vote in second reading."); a check that insisted on one
  //    reported every such list as defective.
  const noFinalVote = isSecondReading(vl);
  const finalIdx = vl.rows.map((r, i) => (r.isFinalVote ? i : -1)).filter((i) => i >= 0);
  const finalIssues: string[] = [];
  if (noFinalVote) {
    if (finalIdx.length > 0) finalIssues.push(`${finalIdx.length} final-vote rows, and a second reading has none`);
  } else if (finalIdx.length !== 1) finalIssues.push(`${finalIdx.length} final-vote rows`);
  else if (finalIdx[0] !== vl.rows.length - 1) finalIssues.push("the final vote is not the last row");
  add(
    "final-vote",
    noFinalVote ? "No final vote, as in every second reading" : "Exactly one final-vote row, at the end",
    finalIssues,
    noFinalVote ? "second reading: the vote is on the Council position, article by article" : "final vote in place",
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Pass 2 — correctness against the official sources, re-downloaded now
// ---------------------------------------------------------------------------

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
          const part = row.splitParts[i]!;
          if (!same(part.notation ?? part.remarks, p.text)) {
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
  const amRows = amendmentRows(vl);
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

  const { byNumber: freshByNumber, blocksRead, error: readError } = await readAmendmentBlocks(blocks, language);
  amError ??= readError;

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

  // A Remark quotes the amendment in the language the EP had published when
  // the list was built: until the translation is out, the fill falls back to
  // the English original rather than re-write anything. So a cell that does
  // not match the file in the list's language is read against the English one
  // before it is called a mismatch — a list built one ingestion too early
  // otherwise comes back as every row corrupted, which is not what happened.
  // The English files are only fetched if a row actually needs them.
  let englishByNumber: Map<number, FreshAmendment> | null = null;
  const inEnglish = async (n: number): Promise<FreshAmendment | undefined> => {
    if (language === "en") return undefined;
    englishByNumber ??= (await readAmendmentBlocks(blocks, "en")).byNumber;
    return englishByNumber.get(n);
  };

  const issues: string[] = [];
  /** Quoted in English although the EP has published the translation. */
  const stale: string[] = [];
  /** Quoted in English because there is nothing else published yet. */
  const untranslated: string[] = [];
  let compared = 0;
  for (const r of amRows) {
    const number = Number(r.amNo);
    const fresh = freshByNumber.get(number);
    // The cell may open with the EP's own "adoption 112 = 69 falls"; the
    // amendment file has no such line, so compare what sits under it.
    const { text: written } = splitFallNote(r.remarks);
    const expected = fresh ? remarksFor(fresh.original ?? null, fresh.amended ?? null) : null;
    if (fresh) {
      compared++;
      if (same(expected, written)) continue;
    }

    const en = await inEnglish(number);
    if (en && same(remarksFor(en.original ?? null, en.amended ?? null), written)) {
      (fresh ? stale : untranslated).push(`am ${r.amNo}`);
      continue;
    }
    if (!fresh) {
      issues.push(`am ${r.amNo}: not found in the published amendment files, so its Remarks could not be confirmed`);
      continue;
    }
    issues.push(`am ${r.amNo}: Remarks differ from the published text — ${firstDifference(written, expected ?? "")}`);
  }

  const lang = language.toUpperCase();
  const detail = [
    issues.length ? issues.join(" · ") : null,
    stale.length
      ? `${stale.join(", ")}: the Remarks quote the published English text, but the ${lang} amendment is published too — build the list again to quote it`
      : null,
    untranslated.length
      ? `${untranslated.join(", ")}: quoted from the English original, the only language the EP has published them in`
      : null,
    issues.length || stale.length || compared === 0
      ? null
      : `${compared} Remarks match the amendment files re-downloaded now (${blocksRead} blocks read)`,
  ].filter(Boolean);

  checks.push({
    id: "am-source",
    pass: 2,
    label: "Remarks re-checked against the published amendments",
    status: issues.length || stale.length ? "issue" : "ok",
    detail: detail.join(" · "),
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
    official?: boolean;
  },
): Promise<VlVerificationReport> {
  const pass1 = verifyCompleteness(vl, ctx.amendments, ctx.vot, ctx.language, ctx.official ?? false);

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
      amendments: amendmentRows(vl).length,
      splits: vl.rows.filter((r) => r.voteType === "split").length,
      separates: vl.rows.filter((r) => r.voteType === "separate").length,
      rollCallsExcluded: ctx.vot?.rollCalls?.length ?? 0,
    },
    checks,
    verified: checks.every((c) => c.status === "ok"),
    rollCalls: ctx.vot?.rollCalls ?? [],
  };
}
