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
 */
export function SessionSwitcher({
  sessions,
  active,
  today,
  filter,
}: {
  sessions: SessionSummary[];
  active: SessionSummary | undefined;
  today: string;
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

  // Newest first in the list: what you reach for is the recent past, not January.
  const listed = [...sessions].reverse();
  const past = (s: SessionSummary) => s.end_date < today;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <Arrow to={prev ? href(prev.id) : undefined} dir="prev" label={prev ? label(prev) : undefined} />
          <h1 className="display truncate text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold leading-tight text-eu-900">
            {active ? monthYear(active) : "No part-session"}
          </h1>
          <Arrow to={next ? href(next.id) : undefined} dir="next" label={next ? label(next) : undefined} />
        </div>
        {active && <p className="mt-1 pl-10 text-[15px] text-ink-500">{sessionSubtitle(active)}</p>}
      </div>

      <div ref={ref} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="press flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-700 shadow-card hover:bg-slate-50"
        >
          Previous sessions
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={open ? "rotate-180" : ""}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="scroll-y absolute right-0 top-full z-40 mt-1.5 max-h-[22rem] min-w-[14rem] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-sheet"
          >
            {listed.map((s) => {
              const on = s.id === active?.id;
              return (
                <Link
                  key={s.id}
                  href={href(s.id)}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm hover:bg-eu-50 ${
                    on ? "bg-eu-50 font-semibold text-eu-900" : past(s) ? "text-ink-500" : "font-medium text-ink-900"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${on ? "bg-eu-700" : past(s) ? "bg-slate-200" : "bg-laurel-600"}`}
                  />
                  <span className="truncate">{label(s)}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-300">{s.vote_count || ""}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Arrow({ to, dir, label: name }: { to?: string; dir: "prev" | "next"; label?: string }) {
  const path = dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6";
  const cls = "grid h-9 w-9 shrink-0 place-items-center rounded-lg";
  if (!to) {
    return (
      <span className={`${cls} text-ink-300/50`} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={path} />
        </svg>
      </span>
    );
  }
  return (
    <Link
      href={to}
      title={name}
      aria-label={dir === "prev" ? `Previous part-session: ${name}` : `Next part-session: ${name}`}
      className={`press ${cls} text-ink-500 hover:bg-slate-100 hover:text-eu-900`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={path} />
      </svg>
    </Link>
  );
}
