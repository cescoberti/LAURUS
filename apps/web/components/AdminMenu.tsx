"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The admin sections behind one button, so they stop crowding the bar
 * for the one person who can see them. Closes on outside click, on Escape,
 * and on navigating away.
 */
export function AdminMenu({ items, active }: { items: Array<{ label: string; href: string; hint?: string }>; active?: boolean }) {
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`press flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[0.875rem] ring-1 ring-inset ${
          active || open
            ? "bg-white font-semibold text-eu-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_16px_-8px_rgba(20,26,43,0.18)] ring-ink-900/[0.08]"
            : "font-medium text-ink-600 ring-ink-900/[0.09] hover:bg-ink-900/[0.04] hover:text-ink-900"
        }`}
      >
        Admin
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`text-ink-400 transition-transform duration-300 ease-lux ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade absolute right-0 top-full z-40 mt-3 w-[min(19rem,calc(100vw-2.5rem))] rounded-2xl bg-white p-2 shadow-sheet ring-1 ring-ink-900/[0.08]"
        >
          {items.map((i) => (
            <Link
              key={i.label}
              href={i.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="press block rounded-xl px-3.5 py-2.5 hover:bg-eu-50"
            >
              <span className="block text-[0.9375rem] font-semibold text-ink-900">{i.label}</span>
              {i.hint && <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-400">{i.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
