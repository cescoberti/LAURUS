import Link from "next/link";
import type { DisplayItem } from "@/lib/types";
import { rapporteurLabel } from "@/lib/rapporteur";

function dayWord(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric" });
}

/**
 * The morning-of-the-vote panel: the files the member follows that are on
 * the table today (or, outside a voting day, the next ones), with the state
 * of their official list. Votes are at noon; this is what to open at 9.
 */
export function TodayBoard({ items, today, sessionEnd }: { items: DisplayItem[]; today: string; sessionEnd: string }) {
  const followed = items.filter((i) => i.following);
  const onToday = followed.filter((i) => i.voteDate === today);
  const upcoming = followed.filter((i) => i.voteDate && i.voteDate > today).sort((a, b) => a.voteDate!.localeCompare(b.voteDate!));
  const nextDay = upcoming[0]?.voteDate;
  const shown = onToday.length ? onToday : upcoming.filter((i) => i.voteDate === nextDay);
  const past = today > sessionEnd;

  const eyebrow = onToday.length
    ? `Today · ${dayWord(today)} · votes at 12:00`
    : nextDay
      ? `Next · ${dayWord(nextDay)} · votes at 12:00`
      : past
        ? "This part-session is over"
        : "Nothing followed yet";

  return (
    <aside className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-eu-900 to-eu-700 p-5 text-white shadow-card">
      <Wreath />
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold-300">{eyebrow}</div>
      <div className="mt-0.5 text-[17px] font-bold tracking-tight">
        {shown.length ? "Your files on the table" : followed.length ? "No followed file on the next day" : "Follow a file to see it here"}
      </div>
      <ul className="mt-2.5 grid gap-1.5 text-sm">
        {shown.slice(0, 5).map((i) => (
          <li key={i.code}>
            <Link href={`/items/${i.code}`} className="press flex items-center gap-2 rounded-md py-0.5 hover:bg-white/10">
              <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${i.officialVl ? "bg-laurel-300" : "bg-gold-300"}`} />
              <span className="font-bold uppercase tracking-wide">{rapporteurLabel(i.rapporteur) ?? i.code}</span>
              <span className="min-w-0 truncate opacity-85">{i.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] opacity-70">{i.code.replace(/\/\d{4}$/, "")}</span>
            </Link>
          </li>
        ))}
        {shown.length > 5 && <li className="text-xs opacity-70">+ {shown.length - 5} more</li>}
        {!shown.length && !followed.length && (
          <li className="text-[13px] leading-snug opacity-80">Press the star on a row: you get an email within minutes when its list or amendments change.</li>
        )}
      </ul>
    </aside>
  );
}

/** Laurel wreath watermark, gold, with the LAURUS checkmark at its centre. */
function Wreath() {
  const leaves = [30, 60, 90, 120, 150, 210, 240, 270, 300, 330];
  return (
    <svg className="pointer-events-none absolute -right-4 -top-3 h-[150px] w-[150px] text-gold-300 opacity-20" viewBox="0 0 100 100" fill="currentColor" aria-hidden>
      <defs>
        <path id="laurus-leaf" d="M50 8 q-7 9 0 18 q7 -9 0 -18 Z" />
      </defs>
      {leaves.map((deg) => (
        <use key={deg} href="#laurus-leaf" transform={`rotate(${deg} 50 50)`} />
      ))}
      <path d="M32 58 L45 71 L70 40" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
