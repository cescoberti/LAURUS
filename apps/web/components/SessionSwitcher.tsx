"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "@/lib/data";

function monthYear(s: SessionSummary): string {
  const d = new Date(`${s.start_date}T12:00:00Z`);
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${month} ${d.getUTCFullYear()}`;
}

/** "Plenary 5–8 October · Strasbourg" */
function sessionSubtitle(s: SessionSummary): string {
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDate();
  const month = new Date(`${s.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" });
  const place = s.location === "STR" ? "Strasbourg" : "Brussels";
  return `Plenary ${day(s.start_date)}–${day(s.end_date)} ${month} · ${place}`;
}

/** A session's own label, with "II" kept when the month has two part-sessions. */
function label(s: SessionSummary): string {
  return /\bII\b/.test(s.month_label) ? `${monthYear(s)} II` : monthYear(s);
}

/**
 * One part-session at a time. The arrows step to the one before and after;
 * everything else lives in the dropdown, so the whole year no longer has to
 * sit across the top of the page.
 *
 * `sessions` holds only what is still ahead (see `getSessions`), so the
 * dropdown is a look forward, in calendar order, and disappears when the one
 * on screen is the only one left.
 */
export function SessionSwitcher({
  sessions,
  active,
  filter,
}: {
  sessions: SessionSummary[];
  active: SessionSummary | undefined;
  filter?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const href = (id: string) => `/?s=${id}${filter ? `&f=${filter}` : ""}`;
  const i = active ? sessions.findIndex((s) => s.id === active.id) : -1;
  const prev = i > 0 ? sessions[i - 1] : undefined;
  const next = i >= 0 && i < sessions.length - 1 ? sessions[i + 1] : undefined;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-7">
      <div className="min-w-0">
        <div className="eyebrow mb-5">European Parliament · Plenary</div>
        <div className="-ml-1 flex items-center gap-2">
          <Arrow to={prev ? href(prev.id) : undefined} dir="prev" label={prev ? label(prev) : undefined} />
          <h1 className="display min-w-0 text-balance text-display-lg font-bold text-eu-900">
            {active ? monthYear(active) : "No part-session"}
          </h1>
          <Arrow to={next ? href(next.id) : undefined} dir="next" label={next ? label(next) : undefined} />
        </div>
        {active && <p className="mt-5 pl-2 text-[1.0625rem] font-medium text-ink-500 sm:pl-12">{sessionSubtitle(active)}</p>}
      </div>

      <div ref={ref} className={`relative shrink-0 ${sessions.length > 1 ? "" : "hidden"}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="btn-secondary"
        >
          Coming up
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`text-ink-400 transition-transform duration-300 ease-lux ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="scroll-y animate-fade absolute right-0 top-full z-40 mt-3 max-h-[24rem] min-w-[17rem] overflow-y-auto rounded-2xl bg-white/90 p-2 shadow-sheet backdrop-blur-xl ring-1 ring-ink-900/[0.06]"
          >
            {sessions.map((s) => {
              const on = s.id === active?.id;
              return (
                <Link
                  key={s.id}
                  href={href(s.id)}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`press flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[0.9375rem] hover:bg-eu-50 ${
                    on ? "bg-eu-50 font-semibold text-eu-900" : "font-medium text-ink-700"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                      on ? "bg-eu-900 ring-[3px] ring-eu-900/15" : "bg-laurel-600/70"
                    }`}
                  />
                  <span className="truncate">{label(s)}</span>
                  <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-ink-300">{s.vote_count || ""}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Step to the part-session before or after. A glass disc, raised only on
 * hover: at rest it must not compete with the title it sits beside.
 */
function Arrow({ to, dir, label: name }: { to?: string; dir: "prev" | "next"; label?: string }) {
  const path = dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6";
  const cls = "grid h-10 w-10 shrink-0 place-items-center rounded-full";
  const icon = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
  if (!to) {
    return (
      <span className={`${cls} text-ink-300/40`} aria-hidden>
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={to}
      title={name}
      aria-label={dir === "prev" ? `Previous part-session: ${name}` : `Next part-session: ${name}`}
      className={`press ${cls} text-ink-400 hover:bg-white hover:text-eu-900 hover:shadow-card`}
    >
      {icon}
    </Link>
  );
}
