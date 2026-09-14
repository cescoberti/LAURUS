import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadVotingList } from "@/lib/annotatedVl/load";
import { expandSplitRows } from "@/lib/annotatedVl/expandSplits";
import { splitRequestsFromNotes } from "@laurus/parser/voting-list-docx";
import { renderAnnotatedVlDocx } from "@/lib/annotatedVlDocx";
import { logEvent } from "@/lib/track";
import { EU_LANGUAGE_CODES } from "@/lib/languages";
import { checkVlRateLimit } from "@/lib/rateLimit";
import { CONTACT_EMAIL } from "@/lib/committees";

/**
 * Download the annotated voting list for an item as a .docx.
 *   GET /api/annotated-vl?code=A10-0170/2026
 *
 * The list is built from the plenary amendments ingested from the EP site
 * (Remarks pre-filled with the published IT text, EN fallback). For items
 * without ingested amendments, a statically registered list (e.g. the STREIT
 * ground-truth capture) is served instead. Requires an authenticated advisor.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await checkVlRateLimit(user.id);
  if (!limit.allowed) {
    // This route is opened via a plain link, so render a readable page.
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1a2b22">
<h1 style="color:#1f5138;font-size:1.25rem">Daily limit reached</h1>
<p>You've reached the limit of ${limit.limit} voting lists for today. Come back tomorrow, or email
<a href="mailto:${CONTACT_EMAIL}" style="color:#1f5138">${CONTACT_EMAIL}</a> if you have a specific need.</p>
<p><a href="javascript:history.back()" style="color:#6b7a72">← Go back</a></p></div>`;
    return new NextResponse(html, { status: 429, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const langParam = (url.searchParams.get("lang") ?? "it").toLowerCase();
  const lang = EU_LANGUAGE_CODES.has(langParam) ? langParam : "it";

  const loaded = await loadVotingList(supabase, code, lang);
  if (!loaded) return NextResponse.json({ error: "no amendments ingested for this item yet" }, { status: 404 });
  const { vl } = loaded;

  // Split rows: parent emptied, part 1 = paragraph with the split-off words
  // struck, later parts = those words. Before the vote the requests are the
  // official list's own footer notes.
  const votEn =
    loaded.votEn ?? (loaded.official ? { splitVotes: splitRequestsFromNotes(vl.notes), separateVotes: [], rollCalls: [] } : null);
  await expandSplitRows(vl, { itemCode: code, language: lang, votEn, votLang: loaded.vot, amendments: loaded.amendments });

  // This is the UNVERIFIED route — the verified list goes out by email from
  // /api/vl-request after both verification passes. On the EP's own list the
  // header keeps the EP's version label, so the file name carries the caveat;
  // a list LAURUS built itself is a draft and is named as one.
  const buffer = await renderAnnotatedVlDocx(vl);
  const who = (vl.rapporteur ?? code).replace(/[^A-Za-z0-9]+/g, "-");
  const filename = loaded.official
    ? `VL-${who}-${lang.toUpperCase()}-unverified.docx`
    : `annotated-vl-DRAFT-${who}-${lang.toUpperCase()}.docx`;
  void logEvent("vl_download", { userId: user.id, itemCode: code, meta: { lang } });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
