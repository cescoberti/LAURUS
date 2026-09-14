import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { sendWhatsApp, whatsappConfigured } from "@/lib/notify/whatsapp";
import { rapporteurLabel } from "@/lib/rapporteur";
import { logEvent } from "@/lib/track";

export const runtime = "nodejs";

/**
 * Tell followers that a file's voting-list material changed.
 *   POST /api/alerts/vl   Authorization: Bearer $CRON_SECRET
 *
 * Called by the live-sync workflow after every tick during a plenary week.
 * For each item follow (subscriptions, scope='item') the file's current
 * state is fingerprinted — amendment count, which VOT languages exist, the
 * version of the EP's official voting list — and
 * a message goes out only when that fingerprint has not been announced to
 * that subscription before (vl_alerts). So: one message per real change,
 * none for the ticks where nothing happened.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://laurus-web-theta.vercel.app";

interface ItemState {
  id: string;
  code: string;
  rapporteur: string | null;
  title: { en?: string; it?: string };
  am_count: number;
  votLangs: string[];
  /** Version label of the latest official voting list, "" when none yet. */
  vlVersion: string;
}

function describe(it: ItemState, previous: { am: number; vot: string[]; vl: string } | null): string {
  const bits: string[] = [];
  if (!previous) {
    if (it.vlVersion) bits.push(`official voting list published (${it.vlVersion})`);
    if (it.am_count > 0) bits.push(`${it.am_count} amendment${it.am_count === 1 ? "" : "s"} loaded`);
    if (it.votLangs.length) bits.push("split/separate requests loaded");
  } else {
    if (it.vlVersion && it.vlVersion !== previous.vl) {
      bits.push(previous.vl ? `new voting list version: ${it.vlVersion}` : `official voting list published (${it.vlVersion})`);
    }
    if (it.am_count > previous.am) {
      const d = it.am_count - previous.am;
      bits.push(`${d} new amendment${d === 1 ? "" : "s"} (now ${it.am_count})`);
    } else if (it.am_count !== previous.am) {
      bits.push(`amendments now ${it.am_count}`);
    }
    if (it.votLangs.length && !previous.vot.length) bits.push("split/separate requests loaded");
  }
  return bits.join(" · ") || "voting-list material updated";
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: itemSubs } = await admin
    .from("subscriptions")
    .select("id, user_id, target_id, channel")
    .eq("scope", "item");

  // A committee follow ("every ECON file") is every file of that committee in
  // the part-session in progress — or the next one, so the week before a
  // plenary is covered too. Expanded here into (subscription, item) pairs;
  // the send receipt is per pair, exactly as for a file follow.
  const { data: committeeSubs } = await admin
    .from("subscriptions")
    .select("id, user_id, target_id, channel")
    .eq("scope", "committee");
  const subs: Array<{ id: string; user_id: string; target_id: string; channel: string }> = [
    ...((itemSubs ?? []) as Array<{ id: string; user_id: string; target_id: string; channel: string }>),
  ];
  if (committeeSubs?.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: session } = await admin
      .from("sessions")
      .select("id")
      .gte("end_date", today)
      .order("start_date")
      .limit(1)
      .maybeSingle();
    if (session) {
      const { data: sessionItems } = await admin
        .from("items")
        .select("id, committee, committees")
        .eq("session_id", session.id);
      for (const cs of committeeSubs) {
        const code = (cs.target_id as string).toUpperCase();
        for (const it of sessionItems ?? []) {
          const cmtes = [it.committee, ...((it.committees as string[] | null) ?? [])].filter(Boolean) as string[];
          if (cmtes.includes(code)) subs.push({ id: cs.id as string, user_id: cs.user_id as string, target_id: it.id as string, channel: cs.channel as string });
        }
      }
    }
  }
  if (!subs.length) return NextResponse.json({ followed: 0, sent: 0 });

  const itemIds = [...new Set(subs.map((s) => s.target_id as string))];
  const [{ data: items }, { data: vots }, { data: vls }, { data: users }] = await Promise.all([
    admin.from("items").select("id, code, rapporteur, title, am_count").in("id", itemIds),
    admin.from("vot_requests").select("item_id, language").in("item_id", itemIds),
    admin.from("voting_lists").select("item_id, version_label, fetched_at").in("item_id", itemIds).order("fetched_at", { ascending: false }),
    admin
      .from("users")
      .select("id, email, whatsapp_phone, wants_email, wants_whatsapp")
      .in("id", [...new Set(subs.map((s) => s.user_id as string))]),
  ]);

  const votByItem = new Map<string, string[]>();
  for (const v of vots ?? []) votByItem.set(v.item_id as string, [...(votByItem.get(v.item_id as string) ?? []), v.language as string].sort());
  const vlByItem = new Map<string, string>();
  for (const v of vls ?? []) if (!vlByItem.has(v.item_id as string)) vlByItem.set(v.item_id as string, v.version_label as string);
  const stateById = new Map<string, ItemState>();
  for (const it of items ?? []) {
    stateById.set(it.id as string, {
      id: it.id as string,
      code: it.code as string,
      rapporteur: it.rapporteur as string | null,
      title: (it.title as ItemState["title"]) ?? {},
      am_count: (it.am_count as number) ?? 0,
      votLangs: votByItem.get(it.id as string) ?? [],
      vlVersion: vlByItem.get(it.id as string) ?? "",
    });
  }
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  // What each subscription was last told, to phrase the message as a delta.
  const { data: past } = await admin
    .from("vl_alerts")
    .select("subscription_id, item_id, fingerprint, sent_at")
    .in("item_id", itemIds)
    .order("sent_at", { ascending: false });
  const lastBySub = new Map<string, string>();
  const seen = new Set<string>();
  for (const a of past ?? []) {
    const k = `${a.subscription_id}|${a.item_id}`;
    if (!lastBySub.has(k)) lastBySub.set(k, a.fingerprint as string);
    seen.add(`${k}|${a.fingerprint}`);
  }
  const parseFp = (fp: string) => {
    const [am, vot, vl] = fp.split(":");
    return { am: Number(am ?? 0), vot: vot ? vot.split(",") : [], vl: vl ?? "" };
  };

  let sent = 0;
  const skipped: string[] = [];
  if (!emailConfigured()) skipped.push("email: RESEND_API_KEY missing");
  if (!whatsappConfigured()) skipped.push("whatsapp: Twilio credentials missing");

  for (const sub of subs) {
    const it = stateById.get(sub.target_id as string);
    const u = userById.get(sub.user_id as string);
    if (!it || !u) continue;
    // Nothing to announce until there is something on the file.
    if (it.am_count === 0 && it.votLangs.length === 0 && !it.vlVersion) continue;

    const fingerprint = `${it.am_count}:${it.votLangs.join(",")}:${it.vlVersion}`;
    const key = `${sub.id}|${it.id}`;
    if (seen.has(`${key}|${fingerprint}`)) continue;

    const previous = lastBySub.has(key) ? parseFp(lastBySub.get(key)!) : null;
    const what = describe(it, previous);
    const who = rapporteurLabel(it.rapporteur) ?? it.code;
    const title = it.title.en || it.title.it || "";
    const link = `${SITE}/items/${encodeURIComponent(it.code)}`;

    let ok = false;
    if (sub.channel === "email" && u.wants_email !== false && emailConfigured()) {
      const r = await sendEmail({
        to: u.email as string,
        subject: `LAURUS — ${who}: ${what}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:40rem;color:#1a2b22">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#1f5138;font-weight:600">LAURUS</div>
  <h1 style="font-size:18px;margin:6px 0 2px;letter-spacing:.03em">${who}</h1>
  <p style="margin:0 0 12px;color:#4a5a52">${title}<br><span style="font-family:ui-monospace,Menlo,monospace;color:#1f5138">${it.code}</span></p>
  <p style="font-size:15px"><strong>${what}</strong></p>
  <p><a href="${link}" style="color:#1f5138;font-weight:600">Open the file</a> — request the verified VL from there.</p>
</div>`,
      });
      ok = r.ok;
    } else if (sub.channel === "whatsapp" && u.wants_whatsapp && u.whatsapp_phone && whatsappConfigured()) {
      const r = await sendWhatsApp(u.whatsapp_phone as string, `🌿 LAURUS — ${who}\n${what}\n${link}`);
      ok = r.ok;
    }
    if (!ok) continue;

    await admin.from("vl_alerts").insert({ subscription_id: sub.id, item_id: it.id, fingerprint, channel: sub.channel });
    seen.add(`${key}|${fingerprint}`);
    sent++;
  }

  void logEvent("vl_alerts", { meta: { followed: subs.length, sent, skipped } });
  return NextResponse.json({ followed: subs.length, sent, skipped });
}
