import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { sendWhatsApp, whatsappConfigured } from "@/lib/notify/whatsapp";
import { sendDueReminders } from "@/lib/notify/whipReminder";
import { rapporteurLabel } from "@/lib/rapporteur";
import { logEvent } from "@/lib/track";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Notification dispatcher — run by Vercel Cron (see vercel.json) or manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/notify
 *
 * 1. Daily digest: what actually changed on a file in the last 25h, which is
 *    not the same as "a row was written". Three different things used to be
 *    reported identically as "new annotated VL", including a translation
 *    landing overnight — so on the morning of a vote the digest announced
 *    four new voting lists when nothing had been tabled. Now: new amendments
 *    are news, a translation is said to be a translation, a list confirmed
 *    from indicative to final is said to be that, and a morning on which
 *    nothing happened produces no mail at all.
 * 2. Clean-final: items voted in the last 25h → members with wants_clean_final
 *    get the link to the adopted-text page and the report files.
 * 3. Whip reminders: advisors with pending plenary notes, three weeks and two
 *    weeks before a sitting. Idempotent through laurus.whip_reminders.
 *
 * Every send is recorded in laurus.notifications-like events, and the whole
 * run no-ops gracefully while the provider keys are not configured.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "21 Oct" — the day is what tells you whether a file is urgent. */
function voteDay(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 25 * 3_600_000).toISOString();

  // --- 1. What actually changed on a file in the window ------------------
  const { data: freshAms } = await supabase
    .from("amendments")
    .select("item_id, number")
    .gte("created_at", since);
  const freshItemIds = [...new Set((freshAms ?? []).map((a) => a.item_id))];

  /** An amendment number is NEW only if nothing carried it before the window. */
  const priorNumbers = new Map<string, Set<number>>();
  if (freshItemIds.length) {
    const { data: older } = await supabase
      .from("amendments")
      .select("item_id, number")
      .in("item_id", freshItemIds)
      .lt("created_at", since);
    for (const a of older ?? []) {
      const set = priorNumbers.get(a.item_id as string) ?? new Set<number>();
      set.add(a.number as number);
      priorNumbers.set(a.item_id as string, set);
    }
  }

  const tabledNow = new Map<string, Set<number>>();
  const touchedNow = new Map<string, Set<number>>();
  for (const a of freshAms ?? []) {
    const id = a.item_id as string, n = a.number as number;
    touchedNow.set(id, (touchedNow.get(id) ?? new Set<number>()).add(n));
    if (!priorNumbers.get(id)?.has(n)) tabledNow.set(id, (tabledNow.get(id) ?? new Set<number>()).add(n));
  }

  // A list the Tabling Service has confirmed: it was indicative when we last
  // saw it and carries a FINAL label now. That is worth one line, not an
  // alarm — nothing was added, the file is simply settled.
  const confirmedFinal = new Set<string>();
  if (freshItemIds.length) {
    const { data: lists } = await supabase
      .from("voting_lists")
      .select("item_id, version_label, fetched_at")
      .in("item_id", freshItemIds)
      .order("fetched_at", { ascending: false });
    const seen = new Map<string, string>();
    for (const l of lists ?? []) {
      const id = l.item_id as string;
      const label = String(l.version_label ?? "");
      if (!seen.has(id)) {
        seen.set(id, label);
        if (/final/i.test(label) && (l.fetched_at as string) >= since) confirmedFinal.add(id);
      } else if (confirmedFinal.has(id) && /final/i.test(label)) {
        confirmedFinal.delete(id); // it was already final before: no news
      }
    }
  }

  // A code on its own ("B10-0468/2026 — 29 amendments translated") does not say
  // which file it is: nobody reads a digest holding the register of codes. So
  // each line carries what the site shows — rapporteur, subject, committee and
  // the day of the vote — in the same hierarchy as the per-file alert.
  interface DigestLine { code: string; who: string | null; title: string; committee: string | null; voteDate: string | null; what: string }
  const digest: DigestLine[] = [];
  if (freshItemIds.length) {
    const { data } = await supabase
      .from("items")
      .select("id, code, am_count, rapporteur, title, committee, vote_date")
      .in("id", freshItemIds)
      .gt("am_count", 0);
    for (const it of data ?? []) {
      const id = it.id as string;
      const tabled = tabledNow.get(id)?.size ?? 0;
      const touched = touchedNow.get(id)?.size ?? 0;
      const t = (it.title ?? {}) as { en?: string; it?: string };
      const about = {
        code: it.code as string,
        who: rapporteurLabel(it.rapporteur as string | null),
        title: t.en || t.it || "",
        committee: (it.committee as string | null) ?? null,
        voteDate: voteDay(it.vote_date as string | null),
      };
      if (tabled > 0) {
        digest.push({ ...about, what: `${tabled} new amendment${tabled === 1 ? "" : "s"} tabled (${it.am_count} in all)` });
      } else if (confirmedFinal.has(id)) {
        digest.push({ ...about, what: `voting list confirmed FINAL — no amendment added, ${touched} translated` });
      } else if (touched > 0) {
        digest.push({ ...about, what: `${touched} amendment${touched === 1 ? "" : "s"} translated — nothing new tabled` });
      }
    }
  }
  const newVlItems = digest;

  // --- 2. Items voted in the window (clean final) ------------------------
  const { data: votedItems } = await supabase
    .from("items")
    .select("code, title, vote_date, rapporteur")
    .gte("vote_date", since.slice(0, 10));

  const { data: members } = await supabase
    .from("users")
    .select("id, email, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final");

  const sent = { email: 0, whatsapp: 0, cleanFinal: 0 };
  const skipped: string[] = [];
  if (!emailConfigured()) skipped.push("email: RESEND_API_KEY mancante");
  if (!whatsappConfigured()) skipped.push("whatsapp: Twilio credentials missing");

  // --- New-VL reminders ---------------------------------------------------
  // The subject says which of the three it is, because it is read on a phone
  // on the way into the Chamber: "4 new annotated VLs" on the morning of a
  // vote reads as four files one has not prepared.
  const tabledCount = newVlItems.filter((d) => /tabled/.test(d.what)).length;
  const subject = tabledCount
    ? `LAURUS — new amendments on ${tabledCount} file${tabledCount === 1 ? "" : "s"}`
    : newVlItems.some((d) => /confirmed FINAL/.test(d.what))
      ? "LAURUS — voting lists confirmed final"
      : "LAURUS — translations in, nothing new tabled";

  if (newVlItems.length) {
    const list = newVlItems
      .map((i) => `• ${i.who ?? i.code} — ${i.what}\n  ${i.code}${i.voteDate ? ` · vote ${i.voteDate}` : ""}`)
      .join("\n");
    const html =
      `<p>Overnight on <a href="${SITE}">LAURUS</a>:</p><ul>` +
      newVlItems
        .map((i) => {
          const head = i.who ? `<strong>${esc(i.who)}</strong>` : `<strong>${esc(i.code)}</strong>`;
          const meta = [esc(i.code), i.committee ? esc(i.committee) : null, i.voteDate ? `vote ${i.voteDate}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            `<li style="margin-bottom:10px">` +
            `<a href="${SITE}/items/${encodeURIComponent(i.code)}" style="text-decoration:none;color:#1f5138">${head}</a> — ${esc(i.what)}` +
            (i.title ? `<br><span style="color:#4a5a52">${esc(i.title)}</span>` : "") +
            `<br><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#7a8a82">${meta}</span>` +
            `</li>`
          );
        })
        .join("") +
      `</ul><p>Download the VLs with the Remarks already filled from each report's page.</p>`;

    for (const m of members ?? []) {
      if (m.wants_email && emailConfigured()) {
        const r = await sendEmail({ to: m.email, subject, html });
        if (r.ok) sent.email++;
      }
      if (m.wants_whatsapp && m.whatsapp_phone && whatsappConfigured()) {
        const r = await sendWhatsApp(m.whatsapp_phone, `🌿 ${subject}\n${list}\n\nSend *vl <code>* for the direct link.`);
        if (r.ok) sent.whatsapp++;
      }
    }
  }

  // --- Clean-final --------------------------------------------------------
  if (votedItems?.length && emailConfigured()) {
    for (const m of members ?? []) {
      if (!m.wants_clean_final) continue;
      const html =
        `<p>Texts voted in plenary — final version:</p><ul>` +
        votedItems
          .map((i) => {
            const t = (i.title ?? {}) as { en?: string; it?: string };
            const who = rapporteurLabel(i.rapporteur as string | null);
            const head = who ? esc(who) : esc(i.code as string);
            return (
              `<li style="margin-bottom:8px">` +
              `<a href="${SITE}/items/${encodeURIComponent(i.code as string)}" style="text-decoration:none;color:#1f5138"><strong>${head}</strong></a>` +
              (t.en || t.it ? ` — ${esc(t.en || t.it || "")}` : "") +
              `<br><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#7a8a82">${esc(i.code as string)} · voted ${voteDay(i.vote_date as string | null) ?? i.vote_date}</span>` +
              `</li>`
            );
          })
          .join("") +
        `</ul><p>The official adopted texts are published by the EP under "Texts adopted".</p>`;
      const r = await sendEmail({ to: m.email, subject: `LAURUS — final post-vote texts (${votedItems.length})`, html });
      if (r.ok) sent.cleanFinal++;
    }
  }

  // --- Whip reminders (3 weeks / 2 weeks before a sitting) ----------------
  const reminders = await sendDueReminders(supabase);

  void logEvent("cron_notify", {
    meta: { digest: newVlItems, voted: votedItems?.length ?? 0, sent, skipped, reminders },
  });
  return NextResponse.json({
    digest: newVlItems,
    voted: votedItems?.length ?? 0,
    sent,
    skipped,
    reminders,
  });
}
