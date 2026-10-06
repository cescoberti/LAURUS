import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadVotingList } from "@/lib/annotatedVl/load";
import { expandSplitRows } from "@/lib/annotatedVl/expandSplits";
import { splitRequestsFromNotes, type AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import { renderAnnotatedVlBundle } from "@/lib/annotatedVlDocx";
import { logEvent } from "@/lib/track";
import { EU_LANGUAGE_CODES } from "@/lib/languages";
import { checkVlRateLimit, DAILY_VL_LIMIT } from "@/lib/rateLimit";
import { CONTACT_EMAIL } from "@/lib/committees";

// Several lists, each a report fetch plus a parse; well inside the budget but
// not instant.
export const maxDuration = 60;

/** A readable page, since this is opened by a plain link. */
function page(status: number, title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#141a2b">
<h1 style="color:#003399;font-size:1.25rem">${title}</h1><p>${body}</p>
<p><a href="javascript:history.back()" style="color:#5d667a">← Go back</a></p></div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * Every voting list the member follows for one sitting day, in one .docx —
 * what they carry into the chamber.
 *   GET /api/annotated-vl/bundle?day=2026-10-07&lang=it
 *
 * The lists are the same ones the single download serves (the EP's own list
 * with the Remarks filled), so the file carries the same "unverified" caveat:
 * the checked version goes out by email from /api/vl-request.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return page(400, "Which day?", "This link needs a sitting day.");
  const langParam = (url.searchParams.get("lang") ?? "it").toLowerCase();
  const lang = EU_LANGUAGE_CODES.has(langParam) ? langParam : "it";

  // The member's followed files voted that day.
  const { data: subs } = await supabase.from("subscriptions").select("target_id").eq("user_id", user.id).eq("scope", "item");
  const followed = [...new Set((subs ?? []).map((s) => s.target_id as string))];
  if (followed.length === 0) {
    return page(404, "No files followed", "Press the star on the files you follow, then come back for their lists.");
  }
  const { data: items } = await supabase
    .from("items")
    .select("id, code, vote_date")
    .in("id", followed)
    .eq("vote_date", day)
    .order("code");
  const codes = (items ?? []).map((i) => i.code as string);
  if (codes.length === 0) {
    return page(404, "Nothing on that day", "None of the files you follow is voted on this day.");
  }

  const limit = await checkVlRateLimit(user.id);
  if (!limit.allowed) {
    return page(
      429,
      "Daily limit reached",
      `You've reached the limit of ${DAILY_VL_LIMIT} voting lists for today. Come back tomorrow, or email <a href="mailto:${CONTACT_EMAIL}" style="color:#003399">${CONTACT_EMAIL}</a> if you have a specific need.`,
    );
  }

  const lists: AnnotatedVotingList[] = [];
  const missing: string[] = [];
  for (const code of codes) {
    const loaded = await loadVotingList(supabase, code, lang);
    if (!loaded) {
      missing.push(code);
      continue;
    }
    const { vl } = loaded;
    const votEn =
      loaded.votEn ?? (loaded.official ? { splitVotes: splitRequestsFromNotes(vl.notes), separateVotes: [], rollCalls: [] } : null);
    await expandSplitRows(vl, { itemCode: code, language: lang, votEn, votLang: loaded.vot, amendments: loaded.amendments });
    lists.push(vl);
    void logEvent("vl_download", { userId: user.id, itemCode: code, meta: { lang, bundle: day } });
  }
  if (lists.length === 0) {
    return page(404, "No list material yet", `Nothing has been published yet for ${missing.join(", ")}.`);
  }

  const buffer = await renderAnnotatedVlBundle(lists, `Voting lists ${day}`);
  const filename = `VL-${day}-${lang.toUpperCase()}-unverified.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
