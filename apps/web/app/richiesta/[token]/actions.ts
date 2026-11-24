"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveAccessRequest, rejectAccessRequest } from "@/lib/accessRequests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide one request from the link in the admin's email. The token is the
 * credential: it was sent only to admins and names this one request. A POST,
 * so a mail scanner that merely opens the link decides nothing.
 */
export async function decideByTokenAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(token)) redirect("/login");

  const { data: req } = await createAdminClient().from("access_requests").select("id").eq("token", token).maybeSingle();
  if (!req) redirect("/login");

  const by = { userId: null, via: "email" as const };
  const result = decision === "approve" ? await approveAccessRequest(req.id as string, by) : await rejectAccessRequest(req.id as string, by);
  redirect(`/richiesta/${token}?r=${encodeURIComponent(result.message)}`);
}
