"use client";

import { useMemo, useState } from "react";
import type { DisplayItem } from "@/lib/types";
import { ItemTable } from "./ItemTable";

function dayLabel(iso?: string): string {
  if (!iso) return "Date TBD";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SessionBoard({ items }: { items: DisplayItem[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) =>
          [i.code, i.title, i.rapporteur ?? "", i.committee].some((f) => f.toLowerCase().includes(q)),
        )
      : items;

    const byDay = new Map<string, DisplayItem[]>();
    for (const item of filtered) {
      const key = item.voteDate ?? "";
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, dayItems]) => ({ day: dayLabel(iso), items: dayItems }));
  }, [items, query]);

  return (
    <>
      <div className="mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, title, rapporteur, committee…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-card outline-none placeholder:text-ink-300 focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
        />
      </div>

      {groups.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-300">
          {query ? `No votes match “${query}”.` : "No votes recorded for this part-session yet."}
        </p>
      )}

      {groups.map((g) => (
        <ItemTable key={g.day} group={g} />
      ))}
    </>
  );
}
