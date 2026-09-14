import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadVotingList } from "@/lib/annotatedVl/load";
import { expandSplitRows } from "@/lib/annotatedVl/expandSplits";
import { renderAnnotatedVlDocx } from "@/lib/annotatedVlDocx";
import { verifyVotingList, votingListFingerprint, type VlVerificationReport, type VlCheck } from "@/lib/vlVerify";
import { sendVlEmail } from "@/lib/notify/vlEmail";
import { emailConfigured } from "@/lib/notify/email";
import { logEvent } from "@/lib/track";
import { EU_LANGUAGE_CODES } from "@/lib/languages";
import { checkVlRateLimit } from "@/lib/rateLimit";

/**
 * Request a VERIFIED annotated voting list.
 *   POST /api/vl-request  { code, lang }
 *
 * The caller is answered straight away and the work continues after the
 * response: the list is built, put through both verification passes and emailed
 * with its report. Nothing is returned to the browser — a list only reaches a
 * human once it has been checked, and always next to the report of what was
 * checked.
 *
 * Speed comes from not repeating work, never from skipping checks:
 *   - the year's AMENDMENT_LIST index is cached in `ep_doc_index`, so locating
 *     a report's amendment blocks costs no API paging after the first run
 *   - the amendment files are downloaded a few at a time
 *   - if the rebuilt list is byte-identical to one already verified AND the
 *     official sources are final (the vote has happened), that verification is
 *     reused instead of re-downloading them
 */
export const maxDuration = 60;

const INDEX_MAX_AGE_DAYS = 3;
const VERIFICATION_MAX_AGE_DAYS = 30;
const DAY = 86_400_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await checkVlRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json({ error: `Daily limit of ${limit.limit} voting lists reached.` }, { status: 429 });
  }

  const { code, lang: langRaw } = (await request.json().catch(() => ({}))) as { code?: string; lang?: string };
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const langParam = (langRaw ?? "it").toLowerCase();
  const lang = EU_LANGUAGE_CODES.has(langParam) ? langParam : "it";

  const { data: profile } = await supabase.from("users").select("email").eq("id", user.id).maybeSingle();
  const to = profile?.email ?? user.email;
  if (!to) return NextResponse.json({ error: "no email address on file" }, { status: 400 });
  if (!emailConfigured()) {
    return NextResponse.json({ error: "email delivery is not configured on this deployment" }, { status: 503 });
  }

  const admin = createAdminClient();

  // A run killed by the function timeout leaves its row behind; retire those so
  // the history never shows a request as still working long after the fact.
  await admin
    .from("vl_requests")
    .update({ status: "failed", error: "timed out", finished_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: req } = await admin
    .from("vl_requests")
    .insert({ user_id: user.id, item_code: code, language: lang, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  const requestId = req?.id as string | undefined;

  // Everything below runs after the response is sent — the advisor doesn't wait
  // on the EP downloads. Uses the service-role client, which needs no cookies.
  after(async () => {
    const finish = (patch: Record<string, unknown>) =>
      requestId
        ? admin.from("vl_requests").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", requestId)
        : Promise.resolve();

    try {
      const loaded = await loadVotingList(admin, code, lang);
      if (!loaded) {
        await finish({ status: "failed", error: "No amendments or vote requests ingested for this report yet." });
        return;
      }

      // Expand split notations into the full text of each part (cut on the
      // English report, rendered in the list's language, [EN] original under
      // each cell). Runs BEFORE the fingerprint so the cached verification is
      // of the document actually delivered; rows that cannot be expanded keep
      // their official notation and are listed in the report.
      const expansionNotes = await expandSplitRows(loaded.vl, {
        itemCode: code,
        language: lang,
        votEn: loaded.votEn,
        votLang: loaded.vot,
        amendments: loaded.amendments,
      });
      const expansionCheck: VlCheck = {
        id: "split-expansion",
        pass: 2,
        label: "Split parts expanded to their full text",
        status: expansionNotes.some((n) => n.level === "error") ? "issue" : "ok",
        detail: expansionNotes.length
          ? expansionNotes.map((n) => `${n.subject}: ${n.code} — ${n.detail}`).join(" · ")
          : "every split part carries the literal text it votes on",
      };

      // When the EP's own list was used, say so, and how the Remarks fill went:
      // every row it could not fill is a row the advisor must look at.
      const officialCheck: VlCheck | null = loaded.official
        ? {
            id: "official-list",
            pass: 2,
            label: `Built on the EP's list (${loaded.official.versionLabel})`,
            status: loaded.official.fill.anomalies.length ? "issue" : "ok",
            detail: [
              `${loaded.official.fill.filled}/${loaded.official.fill.candidates} Remarks filled`,
              loaded.official.motionRead ? "original text taken from the report" : "the report text could not be read — original-text rows left empty",
              ...loaded.official.fill.anomalies.map((a) => `${a.subject}${a.amNo ? ` (am ${a.amNo})` : ""}: ${a.reason.replace(/_/g, " ")}`),
            ].join(" · "),
          }
        : null;

      const fingerprint = votingListFingerprint(loaded.vl);
      const voteDate = loaded.item?.vote_date ?? null;
      // The VOT and the published amendments stop changing once the vote is
      // held; before that, always re-read them.
      const sourcesFinal = !!voteDate && Date.parse(voteDate) < Date.now();

      let report: VlVerificationReport | null = null;
      let reused = false;

      if (sourcesFinal) {
        const { data: cached } = await admin
          .from("vl_verifications")
          .select("fingerprint, report, verified_at")
          .eq("item_code", code)
          .eq("language", lang)
          .maybeSingle();
        if (
          cached?.fingerprint === fingerprint &&
          Date.parse(cached.verified_at as string) > Date.now() - VERIFICATION_MAX_AGE_DAYS * DAY
        ) {
          report = cached.report as VlVerificationReport;
          reused = true;
        }
      }

      if (!report) {
        const year = Number(code.slice(-4));
        const { data: idx } = await admin
          .from("ep_doc_index")
          .select("identifiers, fetched_at")
          .eq("year", year)
          .eq("work_type", "AMENDMENT_LIST")
          .maybeSingle();
        const indexFresh =
          idx && Date.parse(idx.fetched_at as string) > Date.now() - INDEX_MAX_AGE_DAYS * DAY
            ? (idx.identifiers as string[])
            : null;

        let freshIndex: string[] | null = null;
        report = await verifyVotingList(loaded.vl, {
          itemCode: code,
          voteDate,
          language: lang,
          amendments: loaded.amendments,
          vot: loaded.vot,
          official: loaded.official !== null,
          amendmentIndex: indexFresh,
          onIndexFetched: (ids) => {
            freshIndex = ids;
          },
        });
        // The expansion outcome is part of the report: an unexpanded split row
        // (official notation kept) must be flagged, not passed off as clean.
        report.checks.push(expansionCheck);
        if (officialCheck) report.checks.push(officialCheck);
        report.verified = report.checks.every((c) => c.status === "ok");

        if (freshIndex) {
          await admin.from("ep_doc_index").upsert(
            { year, work_type: "AMENDMENT_LIST", identifiers: freshIndex, fetched_at: new Date().toISOString() },
            { onConflict: "year,work_type" },
          );
        }
        if (sourcesFinal) {
          await admin.from("vl_verifications").upsert(
            { item_code: code, language: lang, fingerprint, report, verified_at: new Date().toISOString() },
            { onConflict: "item_code,language" },
          );
        }
      }

      const docx = await renderAnnotatedVlDocx(loaded.vl);
      const stamp = report.verified ? "VERIFIED" : "UNVERIFIED";
      const filename = `annotated-vl-${stamp}-${(loaded.vl.rapporteur ?? code).replace(/[^A-Za-z0-9]+/g, "-")}-${lang.toUpperCase()}.docx`;

      const sent = await sendVlEmail({ to, report, filename, docx });
      if (!sent.ok) {
        await finish({ status: "failed", error: `Verified, but the email could not be sent: ${sent.error}`, report });
        return;
      }

      await finish({ status: report.verified ? "verified" : "issues", report, emailed_to: to });
      void logEvent("vl_download", { userId: user.id, itemCode: code, meta: { lang, verified: report.verified, reused } });
    } catch (err) {
      await finish({ status: "failed", error: (err as Error).message });
    }
  });

  return NextResponse.json({ ok: true, queued: true, emailedTo: to });
}
