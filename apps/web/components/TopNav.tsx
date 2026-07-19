import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/login/actions";
import { Wordmark } from "./Logo";

const NAV_ITEMS = ["All Votes", "My Votes", "Allocate", "VL Generator"] as const;
const NAV_LINKS: Partial<Record<(typeof NAV_ITEMS)[number], string>> = {
  "All Votes": "/",
  "VL Generator": "/vl-generator",
};

export async function TopNav({ active }: { active?: "All Votes" | "VL Generator" | "admin" }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? (await supabase.from("users").select("role").eq("id", user.id).single()).data
    : null;

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((t) =>
            NAV_LINKS[t] ? (
              <Link
                key={t}
                href={NAV_LINKS[t]!}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  active === t
                    ? "bg-laurel-50 text-laurel-800"
                    : "text-ink-500 hover:bg-slate-50 hover:text-ink-900"
                }`}
              >
                {t}
              </Link>
            ) : (
              <span
                key={t}
                title="In arrivo con le prossime milestone"
                className="cursor-default rounded-md px-3 py-1.5 font-medium text-ink-300"
              >
                {t}
              </span>
            ),
          )}
          {profile?.role === "admin" && (
            <>
              <Link
                href="/admin/users"
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  active === "admin"
                    ? "bg-laurel-50 text-laurel-800"
                    : "text-ink-500 hover:bg-slate-50 hover:text-ink-900"
                }`}
              >
                Admin
              </Link>
              <Link
                href="/admin/tracker"
                className="rounded-md px-3 py-1.5 font-medium text-ink-500 transition-colors hover:bg-slate-50 hover:text-ink-900"
              >
                Tracker
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user && (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-ink-500 transition-colors hover:bg-slate-50 hover:text-laurel-800"
              title="Lingue di lavoro e notifiche"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              Impostazioni
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className="text-ink-500 hover:text-ink-900">
              Logout
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
