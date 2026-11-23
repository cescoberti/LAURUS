"use client";

import { useMemo, useState } from "react";
import type { DisplayItem } from "@/lib/types";
import { toggleFollowAction } from "@/app/items/actions";
import { ItemRows } from "./ItemRows";

export type BoardFilter = "all" | "followed" | "mine";

function dayLabel(iso?: string): string {
  if (!iso) return "Date TBD";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * The part-session board: one-touch filters (all / followed / my committees)
 * plus search, and rows grouped by voting day. A row opens the file's own
 * page, where its amendment files live.
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
      return [i.code, i.title, i.rapporteur ?? "", ...(i.committees.length ? i.committees : [i.committee])].some((f) => f.toLowerCase().includes(q));
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

  /** Filter pills: the active one is filled with the institutional blue,
   *  the others are glass. Nothing else in the toolbar carries colour. */
  const chip = (on: boolean) =>
    `press whitespace-nowrap rounded-full px-4.5 py-2.5 text-[0.875rem] font-semibold ${
      on
        ? "bg-eu-900 text-white shadow-glow-eu"
        : "bg-white/70 text-ink-500 backdrop-blur hover:bg-white hover:text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(20,26,43,0.07)]"
    }`;

  return (
    <>
      <div className="mt-18 flex flex-wrap items-center gap-2.5">
        <label className="group flex min-w-[18rem] flex-1 items-center gap-3 rounded-full bg-white/70 px-5 py-3 backdrop-blur shadow-[inset_0_1px_2px_rgba(20,26,43,0.04),0_0_0_1px_rgba(20,26,43,0.07)] transition-shadow duration-300 ease-lux focus-within:shadow-[inset_0_1px_2px_rgba(20,26,43,0.03),0_0_0_1px_rgba(0,51,153,0.45),0_0_0_4px_rgba(0,51,153,0.10)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-300 transition-colors group-focus-within:text-eu-900" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rapporteur, subject, code, committee…"
            className="w-full bg-transparent text-[0.9375rem] text-ink-900 outline-none placeholder:text-ink-300"
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
        <p className="mx-auto max-w-prose py-26 text-center text-[1.0625rem] leading-relaxed text-ink-400">
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
        <ItemRows
          key={g.iso}
          group={g}
          isToday={g.iso === today}
          vlLanguage={vlLanguage}
          onToggleFollow={toggleFollow}
          myCommittees={committees}
        />
      ))}
    </>
  );
}
