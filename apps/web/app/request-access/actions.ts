"use server";

import { createAccessRequest } from "@/lib/accessRequests";

export interface RequestState {
  error?: string;
  sent?: boolean;
}

/**
 * The public form, for a person who would rather ask than try to sign in. The
 * answer is the same whether or not the address already has an account or a
 * request waiting — it must not tell a stranger who is a member.
 */
export async function submitAccessRequestAction(_prev: RequestState | undefined, formData: FormData): Promise<RequestState> {
  // A field no person sees: a bot fills it.
  if (String(formData.get("company") ?? "").trim()) return { sent: true };

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (!fullName) return { error: "Please tell us your name." };

  const outcome = await createAccessRequest({ email, fullName, note });
  if (outcome === "throttled") return { error: "Too many requests right now. Please try again later." };
  if (outcome === "failed") return { error: "Something went wrong. Please try again." };
  return { sent: true };
}
