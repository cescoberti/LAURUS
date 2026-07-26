import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadVotingList } from "@/lib/annotatedVl/load";
import { renderAnnotatedVlDocx } from "@/lib/annotatedVlDocx";
import { verifyVotingList } from "@/lib/vlVerify";
import { sendVlEmail } from "@/lib/notify/vlEmail";
import { emailConfigured } from "@/lib/notify/email";
import { logEvent } from "@/lib/track";
import { EU_LANGUAGE_CODES } from "@/lib/languages";
import { checkVlRateLimit } from "@/lib/rateLimit";

/**
 * Request a VERIFIED annotated voting list.
 *   POST /api/vl-request  { code, lang }
 *
 * The list is built, put through both verification passes (completeness against
 * what LAURUS holds, correctness against the official sources re-downloaded on
 * the spot) and emailed with its report. Nothing is returned to the browser:
 * the point of this route is that a list only reaches a human after it has been
 * checked, and always alongside the report saying what was checked.
 *
 * Re-downloading and re-parsing the official files is slow by design — hence
 * the extended duration (60s is the Vercel plan ceiling; a report with many
 * amendment blocks can bump into it, in which case the request is reported as
 * failed rather than delivered unverified).
 */
export const maxDuration = 60;

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

  const admin = createAdminClient();
  const { data: profile } = await supabase.from("users").select("email").eq("id", user.id).maybeSingle();
  const to = profile?.email ?? user.email;
  if (!to) return NextResponse.json({ error: "no email address on file" }, { status: 400 });
  if (!emailConfigured()) {
    return NextResponse.json({ error: "email delivery is not configured on this deployment" }, { status: 503 });
  }

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

  const fail = async (message: string, status = 500) => {
    if (requestId) {
      await admin
        .from("vl_requests")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", requestId);
    }
    return NextResponse.json({ error: message }, { status });
  };

  try {
    const loaded = await loadVotingList(supabase, code, lang);
    if (!loaded) return await fail("No amendments or vote requests ingested for this report yet.", 404);

    const report = await verifyVotingList(loaded.vl, {
      itemCode: code,
      voteDate: loaded.item?.vote_date ?? null,
      language: lang,
      amendments: loaded.amendments,
      vot: loaded.vot,
    });

    const docx = await renderAnnotatedVlDocx(loaded.vl);
    const stamp = report.verified ? "VERIFIED" : "UNVERIFIED";
    const filename = `annotated-vl-${stamp}-${(loaded.vl.rapporteur ?? code).replace(/[^A-Za-z0-9]+/g, "-")}-${lang.toUpperCase()}.docx`;

    const sent = await sendVlEmail({ to, report, filename, docx });
    if (!sent.ok) return await fail(`Verification finished but the email could not be sent: ${sent.error}`);

    if (requestId) {
      await admin
        .from("vl_requests")
        .update({
          status: report.verified ? "verified" : "issues",
          report,
          emailed_to: to,
          finished_at: new Date().toISOString(),
        })
        .eq("id", requestId);
    }
    void logEvent("vl_download", { userId: user.id, itemCode: code, meta: { lang, verified: report.verified } });

    return NextResponse.json({
      ok: true,
      verified: report.verified,
      emailedTo: to,
      issues: report.checks.filter((c) => c.status !== "ok").length,
    });
  } catch (err) {
    return await fail((err as Error).message);
  }
}
