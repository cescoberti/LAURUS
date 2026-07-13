import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/login/actions";
import { Wordmark } from "./Logo";

const NAV_ITEMS = ["All Votes", "My Votes", "Allocate", "VL Generator"] as const;

export async function TopNav({ active }: { active?: "All Votes" | "admin" }) {
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
            t === "All Votes" ? (
              <Link
                key={t}
                href="/"
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
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user && <span className="text-ink-300">{user.email}</span>}
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
