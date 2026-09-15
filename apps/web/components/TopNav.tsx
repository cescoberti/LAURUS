import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/login/actions";
import { Wordmark } from "./Logo";

export type NavActive = "Votes" | "My files" | "Voting lists" | "Whip" | "admin";

// Direct, specific labels: each names what is behind it.
const NAV: Array<{ label: NavActive; href: string }> = [
  { label: "Votes", href: "/" },
  { label: "My files", href: "/?f=followed" },
  { label: "Voting lists", href: "/vl-generator" },
];

const ADMIN: Array<{ label: string; href: string }> = [
  { label: "Admin", href: "/admin/users" },
  { label: "Inbox", href: "/admin/inbox" },
  { label: "Invites", href: "/admin/inviti" },
  { label: "Usage", href: "/admin/utilizzo" },
  { label: "Tracker", href: "/admin/tracker" },
];

function initials(name: string | null | undefined, email: string | undefined): string {
  const src = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return parts.length >= 2 ? (parts[0]![0]! + parts[1]![0]!).toUpperCase() : src.slice(0, 2).toUpperCase();
}

const linkClass = (on: boolean) =>
  `press whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
    on ? "bg-eu-50 font-semibold text-eu-900" : "text-ink-500 hover:bg-slate-100 hover:text-ink-900"
  }`;

export async function TopNav({ active }: { active?: NavActive }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? (await supabase.from("users").select("role, full_name").eq("id", user.id).single()).data
    : null;

  return (
    <header className="chrome sticky top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className={linkClass(active === n.label)}>
              {n.label}
            </Link>
          ))}
          {(profile?.role === "admin" || profile?.role === "whip") && (
            <Link href="/whip" className={linkClass(active === "Whip")}>
              Whip
            </Link>
          )}
          <span title="Coming with the next milestones" className="cursor-default whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-300">
            Allocate
          </span>
          {profile?.role === "admin" &&
            ADMIN.map((a) => (
              <Link key={a.label} href={a.href} className={linkClass(active === "admin" && a.label === "Admin")}>
                {a.label}
              </Link>
            ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
          {user && (
            <Link
              href="/settings"
              className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-ink-500 hover:bg-slate-100 hover:text-eu-900"
              title="Working languages, committees & notifications"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </Link>
          )}
          <form action={logoutAction} className="flex items-center">
            <button type="submit" className="press rounded-lg px-2 py-1.5 text-ink-500 hover:bg-slate-100 hover:text-ink-900">
              Logout
            </button>
          </form>
          {user && (
            <Link
              href="/settings"
              title={user.email ?? ""}
              className="press flex h-8 w-8 items-center justify-center rounded-full bg-eu-900 text-[11px] font-bold tracking-wide text-white"
            >
              {initials(profile?.full_name, user.email)}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
