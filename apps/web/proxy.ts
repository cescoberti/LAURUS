import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/login", "/favicon.ico"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    // Invite links are opened by not-yet-registered members.
    pathname === "/onboarding" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/_next") ||
    // Twilio posts inbound WhatsApp messages here — no browser session. The
    // route itself validates/limits what it exposes (public catalogue data).
    pathname === "/api/whatsapp/webhook" ||
    // Vercel Cron calls this; the route checks CRON_SECRET itself.
    pathname === "/api/cron/notify"
  ) {
    return NextResponse.next();
  }

  const { response, supabase, user } = await updateSession(req);

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Gate admin/whip pages and enforce mandatory onboarding in one profile read.
  const needsProfile = pathname.startsWith("/admin") || pathname.startsWith("/whip") || !pathname.startsWith("/api/");
  if (needsProfile) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, onboarded_at")
      .eq("id", user.id)
      .single();

    if (pathname.startsWith("/admin") && profile?.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // The whip cruscotto is open to whips and admins.
    if (pathname.startsWith("/whip") && profile?.role !== "whip" && profile?.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // First access: send the member through onboarding before anything else.
    if (profile && !profile.onboarded_at && pathname !== "/onboarding") {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
