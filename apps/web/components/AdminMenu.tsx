"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The five admin sections behind one button, so they stop crowding the bar
 * for the one person who can see them. Closes on outside click, on Escape,
 * and on navigating away.
 */
export function AdminMenu({ items, active }: { items: Array<{ label: string; href: string }>; active?: boolean }) {
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
        className={`press flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
          active || open ? "bg-eu-50 font-semibold text-eu-900" : "text-ink-500 hover:bg-slate-100 hover:text-ink-900"
        }`}
      >
        Admin
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={open ? "rotate-180" : ""}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-sheet"
        >
          {items.map((i) => (
            <Link
              key={i.label}
              href={i.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm font-medium text-ink-700 hover:bg-eu-50 hover:text-eu-900"
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
