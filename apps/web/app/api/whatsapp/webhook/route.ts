import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/track";

export const runtime = "nodejs";

/**
 * Twilio WhatsApp inbound webhook — the LAURUS chatbot.
 *
 * Configure in the Twilio console (sandbox or number):
 *   "WHEN A MESSAGE COMES IN" → POST https://<site>/api/whatsapp/webhook
 *
 * Commands (Italian-first, forgiving):
 *   lista               → items with ingested amendments (latest 10)
 *   vl A10-0002/2026    → link to the annotated-VL download for that item
 *   aiuto / help        → command list
 * Anything else         → help text
 *
 * Replies use TwiML (no outbound API call needed), so this endpoint works
 * even before Twilio credentials are configured as env vars.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://laurus-web-theta.vercel.app";

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</Message></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

const HELP = [
  "🌿 *LAURUS* — comandi:",
  "• *lista* — relazioni con emendamenti pronti",
  "• *vl <codice>* — link alla VL annotata (es. vl A10-0002/2026)",
  "• *aiuto* — questo messaggio",
].join("\n");

export async function POST(request: Request) {
  const form = await request.formData();
  const from = String(form.get("From") ?? ""); // 'whatsapp:+39333...'
  const body = String(form.get("Body") ?? "").trim();
  const supabase = createAdminClient();

  // Identify the member by their registered WhatsApp number (if any).
  const phone = from.replace(/^whatsapp:/, "");
  const { data: member } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("whatsapp_phone", phone)
    .limit(1)
    .maybeSingle();

  void logEvent("wa_message", { userId: member?.id ?? null, meta: { from: phone, body: body.slice(0, 120) } });

  const lower = body.toLowerCase();

  if (/^(lista|list)\b/.test(lower)) {
    const { data: items } = await supabase
      .from("items")
      .select("code, title, am_count, vote_date")
      .gt("am_count", 0)
      .order("vote_date", { ascending: false })
      .limit(10);
    if (!items?.length) return twiml("Nessuna relazione con emendamenti al momento.");
    const lines = items.map((i) => `• ${i.code} (${i.am_count} em.) — ${(i.title as { en?: string }).en?.slice(0, 45) ?? ""}`);
    return twiml(`🌿 Relazioni pronte:\n${lines.join("\n")}\n\nScrivi *vl <codice>* per la VL annotata.`);
  }

  const vlMatch = lower.match(/^vl\s+([a-z]+\d+-\d+\/\d{4})/i);
  if (vlMatch) {
    const code = vlMatch[1]!.toUpperCase();
    const { data: item } = await supabase
      .from("items")
      .select("code, am_count, title")
      .eq("code", code)
      .maybeSingle();
    if (!item) return twiml(`Non trovo ${code}. Scrivi *lista* per vedere le relazioni disponibili.`);
    if (!item.am_count) return twiml(`${code} è in archivio ma non ha emendamenti d'aula ingeriti.`);
    void logEvent("wa_vl_request", { userId: member?.id ?? null, itemCode: code });
    return twiml(
      `🌿 *${code}* — ${item.am_count} emendamenti.\nScarica la VL annotata (login richiesto):\n${SITE}/api/annotated-vl?code=${encodeURIComponent(code)}\n\nPagina relazione:\n${SITE}/items/${code}`,
    );
  }

  return twiml(member ? HELP : `${HELP}\n\n(Numero non riconosciuto: aggiungi il tuo numero WhatsApp nelle impostazioni del profilo su ${SITE}/settings)`);
}
