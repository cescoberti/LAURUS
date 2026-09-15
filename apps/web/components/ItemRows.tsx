"use client";

import type { DayGroup, DisplayItem } from "@/lib/types";
import { rapporteurLabel } from "@/lib/rapporteur";
import { CommitteeChip, ListState, Star } from "./badges";

/**
 * One voting day: rows in the site-wide hierarchy — MEP SURNAME / subject /
 * code — then committee, the state of the official list, amendments, and
 * the follow star. The row opens the detail sheet; the star is its own hit.
 */
export function ItemRows({
  group,
  isToday,
  onOpen,
  onToggleFollow,
}: {
  group: DayGroup;
  isToday: boolean;
  onOpen: (item: DisplayItem) => void;
  onToggleFollow: (item: DisplayItem) => void;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-bold text-ink-900">{group.day}</h3>
        <span className="text-xs text-ink-300">{group.items.length} items</span>
        {isToday && (
          <span className="ml-1 rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-900">today</span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {group.items.map((item, i) => (
          <div
            key={item.code}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(item);
              }
            }}
            className={`flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-eu-50 active:bg-eu-100 ${
              i ? "border-t border-slate-100" : ""
            }`}
          >
            <div className="min-w-0 flex-[1_1_16rem]">
              <div className="text-[13.5px] font-bold uppercase leading-tight tracking-wide text-ink-900">
                {rapporteurLabel(item.rapporteur) ?? <span className="font-normal normal-case text-ink-300">No rapporteur</span>}
              </div>
              <div className="mt-0.5 truncate text-[13px] leading-snug text-ink-500">{item.title}</div>
              <div className="mt-0.5 font-mono text-[11px] text-eu-600">{item.code}</div>
            </div>
            <div className="w-[4.2rem] text-center">
              <CommitteeChip code={item.committee} mine={item.mine} />
            </div>
            <div className="w-[10rem]">
              <ListState item={item} />
            </div>
            <div className="hidden w-[5.5rem] text-[13px] tabular-nums text-ink-500 lg:block">
              {item.amCount > 0 ? (
                <>
                  <b className="font-semibold text-ink-900">{item.amCount}</b> AM
                </>
              ) : (
                <span className="text-ink-300">no AM</span>
              )}
            </div>
            <div className="ml-auto">
              <Star
                on={item.following}
                onToggle={(e) => {
                  e.stopPropagation();
                  onToggleFollow(item);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
