"use client";

import { useMemo, useState } from "react";
import type { DisplayItem } from "@/lib/types";
import { toggleFollowAction } from "@/app/items/actions";
import { ItemRows } from "./ItemRows";
import { ItemSheet } from "./ItemSheet";

export type BoardFilter = "all" | "followed" | "mine";

function dayLabel(iso?: string): string {
  if (!iso) return "Date TBD";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * The part-session board: one-touch filters (all / followed / my committees)
 * plus search, rows grouped by voting day, and a detail sheet that opens on
 * the row without leaving the list.
 */
export function SessionBoard({
  items: initial,
  today,
  initialFilter,
  committees,
  vlLanguage,
}: {
  items: DisplayItem[];
  today: string;
  initialFilter: BoardFilter;
  committees: string[];
  vlLanguage: string;
}) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BoardFilter>(initialFilter);
  const [openCode, setOpenCode] = useState<string | null>(null);

  // Follow from the row (star) or the sheet: optimistic, then the server.
  const toggleFollow = async (item: DisplayItem) => {
    const next = !item.following;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, following: next } : i)));
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("code", item.code);
    fd.set("follow", next ? "1" : "0");
    try {
      await toggleFollowAction(fd);
    } catch {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, following: !next } : i)));
    }
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (filter === "followed" && !i.following) return false;
      if (filter === "mine" && !i.mine) return false;
      if (!q) return true;
      return [i.code, i.title, i.rapporteur ?? "", i.committee].some((f) => f.toLowerCase().includes(q));
    });
    const byDay = new Map<string, DisplayItem[]>();
    for (const item of filtered) {
      const key = item.voteDate ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    // Dated days in order; "date TBD" at the end, not the top.
    return [...byDay.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
      .map(([iso, dayItems]) => ({ iso, day: dayLabel(iso), items: dayItems }));
  }, [items, query, filter]);

  const open = openCode ? (items.find((i) => i.code === openCode) ?? null) : null;

  const chip = (on: boolean) =>
    `press whitespace-nowrap rounded-xl border px-3 py-2 text-[13px] font-medium ${
      on ? "border-eu-900 bg-eu-900 text-white" : "border-slate-200 bg-white text-ink-500 hover:bg-slate-50"
    }`;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-card transition-[box-shadow,border-color] focus-within:border-eu-600 focus-within:ring-[3px] focus-within:ring-eu-900/10">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-ink-300" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rapporteur, subject, code, committee…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-300"
          />
        </label>
        <button className={chip(filter === "all")} onClick={() => setFilter("all")}>
          All
        </button>
        <button className={chip(filter === "followed")} onClick={() => setFilter("followed")}>
          Followed
        </button>
        {committees.length > 0 && (
          <button className={chip(filter === "mine")} onClick={() => setFilter("mine")} title="Files of your committees (Settings)">
            {committees.join(" · ")}
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-300">
          {query
            ? `No votes match “${query}”.`
            : filter === "followed"
              ? "You follow no file in this part-session yet — press the star on a row."
              : filter === "mine"
                ? "No file of your committees in this part-session."
                : "No votes recorded for this part-session yet."}
        </p>
      )}

      {groups.map((g) => (
        <ItemRows key={g.iso} group={g} isToday={g.iso === today} onOpen={(i) => setOpenCode(i.code)} onToggleFollow={toggleFollow} />
      ))}

      <ItemSheet item={open} vlLanguage={vlLanguage} onClose={() => setOpenCode(null)} onToggleFollow={toggleFollow} />
    </>
  );
}
