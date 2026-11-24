import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/login/actions";
import { AdminMenu } from "./AdminMenu";
import { Wordmark } from "./Logo";

export type NavActive = "Votes" | "My files" | "Voting lists" | "Whip" | "admin";

// Direct, specific labels: each names what is behind it.
const NAV: Array<{ label: NavActive; href: string }> = [
  { label: "Votes", href: "/" },
  { label: "My files", href: "/?f=followed" },
  { label: "Voting lists", href: "/vl-generator" },
];

// Admin-only, and all behind one menu: six more links in the bar made the
// ones that every advisor uses harder to find. Each says what is behind it.
const ADMIN: Array<{ label: string; href: string; hint: string }> = [
  { label: "Requests", href: "/admin/richieste", hint: "Who asked for access — approve or refuse" },
  { label: "Users", href: "/admin/users", hint: "Members, roles and access" },
  { label: "Inbox", href: "/admin/inbox", hint: "Email waiting for your approval" },
  { label: "Agents", href: "/admin/agenti", hint: "What the models do, and how checked" },
  { label: "Invites", href: "/admin/inviti", hint: "Invitation links" },
  { label: "Usage", href: "/admin/utilizzo", hint: "Voting lists per member" },
  { label: "Tracker", href: "/admin/tracker", hint: "Who is connected, which files" },
];

function initials(name: string | null | undefined, email: string | undefined): string {
  const src = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return parts.length >= 2 ? (parts[0]![0]! + parts[1]![0]!).toUpperCase() : src.slice(0, 2).toUpperCase();
}

/**
 * The active tab is a raised white pill, not a block of colour: on this
 * ground, elevation carries the state more quietly than a fill does.
 */
const linkClass = (on: boolean) =>
  `press shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[0.875rem] sm:px-3.5 lg:px-4 ${
    on
      ? "bg-white font-semibold text-eu-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(20,26,43,0.06),0_6px_16px_-8px_rgba(20,26,43,0.18)]"
      : "font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
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
      <div className="mx-auto flex h-[4.75rem] max-w-shell items-center gap-3 px-5 sm:gap-6 sm:px-8 lg:gap-10 lg:px-12">
        <Link href="/" className="shrink-0" aria-label="LAURUS — all votes">
          <Wordmark compact />
        </Link>
        <nav className="scroll-x flex min-w-0 items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className={linkClass(active === n.label)}>
              {n.label}
            </Link>
          ))}
          {/* Whip is switched off for now: the page is still there at /whip, but
              nothing in the bar leads to it. */}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-sm">
          {/* Outside the scrolling nav on purpose: a scroll container clips
              whatever hangs below it, and that is what cut the menu short. */}
          {profile?.role === "admin" && <AdminMenu items={ADMIN} active={active === "admin"} />}
          {user && (
            <Link
              href="/settings"
              className="press flex items-center gap-2 rounded-full px-3 py-2 text-[0.875rem] font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
              title="Working languages, committees & notifications"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </Link>
          )}
          <form action={logoutAction} className="flex items-center">
            <button
              type="submit"
              className="press rounded-full px-2.5 py-2 text-[0.875rem] font-medium text-ink-400 hover:bg-ink-900/[0.04] hover:text-ink-900 sm:px-3"
            >
              Logout
            </button>
          </form>
          {user && (
            <Link
              href="/settings"
              title={user.email ?? ""}
              className="press ml-1.5 grid h-9 w-9 place-items-center rounded-full bg-navy-deep text-[0.6875rem] font-bold tracking-[0.06em] text-white shadow-glow-eu"
            >
              {initials(profile?.full_name, user.email)}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
