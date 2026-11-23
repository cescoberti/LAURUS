"use client";

import Link from "next/link";
import type { DayGroup, DisplayItem } from "@/lib/types";
import { rapporteurLabel } from "@/lib/rapporteur";
import { CommitteeChip, ListState, Star } from "./badges";

/**
 * One voting day: rows in the site-wide hierarchy — MEP SURNAME / subject /
 * code — then committee, the state of the official list, amendments, and
 * the follow star. The row is a link to the file's own page; the star is its
 * own hit, so following never navigates.
 */
export function ItemRows({
  group,
  isToday,
  vlLanguage,
  onToggleFollow,
  myCommittees,
}: {
  group: DayGroup;
  isToday: boolean;
  vlLanguage: string;
  onToggleFollow: (item: DisplayItem) => void;
  /** The viewer's own committees, so each chip can be lit on its own. */
  myCommittees: string[];
}) {
  const mine = new Set(myCommittees);
  // One file to carry into the chamber: every list the member follows that day.
  const followedWithList = group.items.filter((i) => i.following && (i.officialVl || i.amCount > 0));

  return (
    <section className="mt-16">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 px-1">
        <h3 className="display text-display-sm font-bold text-ink-900">{group.day}</h3>
        <span className="text-[0.8125rem] font-medium tabular-nums text-ink-400">{group.items.length} items</span>
        {isToday && (
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-200/50 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-gold-600 ring-1 ring-inset ring-gold-500/20">
            <span className="h-[5px] w-[5px] rounded-full bg-gold-500" />
            today
          </span>
        )}
        {followedWithList.length > 0 && group.iso && (
          <a
            href={`/api/annotated-vl/bundle?day=${group.iso}&lang=${vlLanguage}`}
            className="btn-secondary ml-auto px-4 py-2 text-[0.8125rem]"
            title={`The ${followedWithList.length} list${followedWithList.length === 1 ? "" : "s"} you follow for this day, in one .docx — unverified`}
          >
            <span aria-hidden>↓</span> My lists for this day ({followedWithList.length})
          </a>
        )}
      </div>

      <div className="card overflow-hidden">
        {group.items.map((item, i) => (
          <Link
            key={item.code}
            href={`/items/${encodeURIComponent(item.code)}`}
            className={`relative flex flex-wrap items-center gap-x-6 gap-y-2 px-7 py-6 transition-colors duration-300 ease-lux hover:bg-eu-50/60 ${
              i ? "border-t border-ink-900/[0.09]" : ""
            }`}
          >
            <div className="min-w-0 flex-[1_1_18rem]">
              <div className="text-[0.875rem] font-bold uppercase leading-tight tracking-[0.06em] text-ink-900">
                {rapporteurLabel(item.rapporteur) ?? <span className="font-normal normal-case tracking-normal text-ink-300">No rapporteur</span>}
              </div>
              {/* Two lines, not one: what tells budget files apart — "application
                  EGF/2026/001 BE/Cora" — sits at the END of the title. */}
              <div className="mt-1.5 line-clamp-2 text-[0.875rem] leading-relaxed text-ink-500" title={item.title}>
                {item.title}
              </div>
              <div className="mt-1.5 font-mono text-[0.6875rem] tracking-wide text-eu-600/80">{item.code}</div>
            </div>
            {/* One chip per responsible committee, in the Parliament's order; the
                chip is the member's colour only for a committee that is theirs. */}
            <div className="flex w-[4.5rem] flex-col items-center gap-1">
              {(item.committees.length ? item.committees : [item.committee]).map((c) => (
                <CommitteeChip key={c} code={c} mine={mine.has(c)} />
              ))}
            </div>
            <div className="w-[10.5rem]">
              <ListState item={item} />
            </div>
            <div className="hidden w-[5.5rem] text-[0.8125rem] tabular-nums text-ink-400 lg:block">
              {item.amCount > 0 ? (
                <>
                  <b className="text-[0.9375rem] font-bold text-ink-900">{item.amCount}</b> AM
                </>
              ) : (
                <span className="text-ink-400">no AM</span>
              )}
            </div>
            <div className="ml-auto">
              <Star
                on={item.following}
                onToggle={(e) => {
                  e.preventDefault(); // the star follows; it does not open the file
                  e.stopPropagation();
                  onToggleFollow(item);
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
