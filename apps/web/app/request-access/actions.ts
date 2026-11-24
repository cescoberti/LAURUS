"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { REQUEST_COLUMNS, notifyAdminsOfRequest, type AccessRequest } from "@/lib/accessRequests";

export interface RequestState {
  error?: string;
  sent?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** More than this many requests in an hour is a flood, not people: stop before it reaches the admins' inbox. */
const HOURLY_CAP = 20;

/**
 * The public form. The answer is the same whether or not the address already
 * has an account or a request waiting — it must not tell a stranger who is a
 * member — and it only ever notifies the admins once per waiting request.
 */
export async function submitAccessRequestAction(_prev: RequestState | undefined, formData: FormData): Promise<RequestState> {
  // A field no person sees: a bot fills it.
  if (String(formData.get("company") ?? "").trim()) return { sent: true };

  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const fullName = String(formData.get("name") ?? "").trim().slice(0, 120);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!EMAIL.test(email)) return { error: "Please enter a valid email address." };
  if (!fullName) return { error: "Please tell us your name." };

  const admin = createAdminClient();

  const { data: member } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (member) return { sent: true };

  const { data: waiting } = await admin.from("access_requests").select("id").eq("status", "pending").ilike("email", email).limit(1);
  if (waiting?.length) return { sent: true };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("access_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= HOURLY_CAP) return { error: "Too many requests right now. Please try again later." };

  const { data: row, error } = await admin
    .from("access_requests")
    .insert({ email, full_name: fullName, note: note || null })
    .select(REQUEST_COLUMNS)
    .single();
  if (error || !row) return { error: "Something went wrong. Please try again." };

  await notifyAdminsOfRequest(row as AccessRequest);
  return { sent: true };
}
