import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Where Google and the magic-link email come back to.
 *
 * LAURUS is invite-only, and a Google account is not an invitation: a person
 * arriving here gets in only if they already have a LAURUS profile, or if
 * they are carrying a valid invite (the token cookie set before the redirect,
 * or an open invite addressed to the email Google vouched for). Anyone else
 * is signed straight back out — the identity is real, the membership is not.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Open redirects: only our own paths.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=oauth-failed`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth-failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth-failed`);
  }

  const user = data.user;
  const admin = createAdminClient();

  // Already a member? Straight in.
  const { data: profile } = await admin.from("users").select("id").eq("id", user.id).maybeSingle();
  if (profile) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Not a member yet: the invite decides.
  const email = (user.email ?? "").toLowerCase();
  const token = request.cookies.get("laurus_invite")?.value ?? searchParams.get("token") ?? "";

  const byToken = token
    ? (await admin.from("invites").select("id, email, expires_at, used_at").eq("token", token).maybeSingle()).data
    : null;
  const byEmail =
    !byToken && email
      ? (await admin.from("invites").select("id, email, expires_at, used_at").eq("email", email).is("used_at", null).maybeSingle()).data
      : null;

  const invite = byToken ?? byEmail;
  const usable =
    invite &&
    !invite.used_at &&
    new Date(invite.expires_at) > new Date() &&
    // A token tied to one address cannot be spent by another.
    (!invite.email || invite.email.toLowerCase() === email);

  if (!usable) {
    await supabase.auth.signOut();
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", "not-invited");
    const res = NextResponse.redirect(url);
    res.cookies.delete("laurus_invite");
    return res;
  }

  const { error: insertErr } = await admin.from("users").insert({
    id: user.id,
    email,
    role: "member",
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
  });
  if (insertErr && !/duplicate/i.test(insertErr.message)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=oauth-failed`);
  }

  // The wizard marks the invite used once the member finishes onboarding.
  const res = NextResponse.redirect(`${origin}/onboarding${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  res.cookies.delete("laurus_invite");
  return res;
}
