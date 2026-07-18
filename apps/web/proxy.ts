import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/login", "/favicon.ico"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
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

  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
