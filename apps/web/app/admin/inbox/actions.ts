"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { COMMITTEE_CODES } from "@/lib/committees";
import type { ProposedAction } from "@/lib/inbox/triage";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Not authorised.");
  return user;
}

function inviteEmail(lang: string, url: string, committees: string[]): { subject: string; html: string } {
  const list = committees.length ? committees.join(", ") : null;
  if (lang === "it") {
    return {
      subject: "Il tuo accesso a LAURUS",
      html: `<p>Ciao,</p><p>ecco il tuo link per entrare in LAURUS${list ? ` — ti abbiamo già impostato ${list}` : ""}:</p><p><a href="${url}">${url}</a></p><p>Vale 30 giorni e si usa una volta sola. Se qualcosa non torna, rispondi a questa email.</p><p>LAURUS · Less paperwork. More wins.</p>`,
    };
  }
  return {
    subject: "Your access to LAURUS",
    html: `<p>Hello,</p><p>here is your link to join LAURUS${list ? ` — ${list} already set for you` : ""}:</p><p><a href="${url}">${url}</a></p><p>It is valid for 30 days and works once. If anything is off, reply to this email.</p><p>LAURUS · Less paperwork. More wins.</p>`,
  };
}

/** Approve the proposed action of a message and carry it out. */
export async function approveInboxAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: msg } = await admin.from("inbox_messages").select("id, from_email, proposed_action, status").eq("id", id).single();
  if (!msg || msg.status !== "new") return;

  // The admin may have corrected the form before approving.
  const action = msg.proposed_action as ProposedAction;
  const committees = formData.getAll("committees").map(String).filter((c) => COMMITTEE_CODES.has(c));
  let note = "";

  if (action.type === "create_invite") {
    const email = String(formData.get("email") ?? action.email).trim().toLowerCase();
    const lang = String(formData.get("vl_language") ?? action.vl_language);
    const prefill = { full_name: String(formData.get("full_name") ?? action.full_name ?? ""), ep_group: action.ep_group, committees, vl_language: lang };
    const { data: invite, error } = await admin.from("invites").insert({ email, created_by: user.id, prefill }).select("token").single();
    if (error) throw new Error(error.message);
    const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/onboarding?token=${invite.token}`;
    if (emailConfigured()) {
      const mail = inviteEmail(action.language, url, committees);
      const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html });
      note = sent.ok ? `Invite sent to ${email}` : `Invite created, email failed: ${sent.error}`;
    } else {
      note = `Invite created (email not configured): ${url}`;
    }
  } else if (action.type === "update_committees") {
    const { error } = await admin.from("users").update({ committees }).eq("email", action.email);
    if (error) throw new Error(error.message);
    note = `Committees set to ${committees.join(", ") || "none"} for ${action.email}`;
  } else if (action.type === "file_document") {
    note = "Filed";
  }

  await admin.from("inbox_messages").update({ status: "handled", handled_at: new Date().toISOString(), handled_by: user.id, note }).eq("id", id);
  revalidatePath("/admin/inbox");
}

export async function ignoreInboxAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  await admin.from("inbox_messages").update({ status: "ignored", handled_at: new Date().toISOString(), handled_by: user.id }).eq("id", id);
  revalidatePath("/admin/inbox");
}

export async function reopenInboxAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  await admin.from("inbox_messages").update({ status: "new", handled_at: null, handled_by: null, note: null }).eq("id", id);
  revalidatePath("/admin/inbox");
}
