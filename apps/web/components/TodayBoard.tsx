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
export function TodayBoard({
  items,
  today,
  sessionEnd,
  vlLanguage,
}: {
  items: DisplayItem[];
  today: string;
  sessionEnd: string;
  vlLanguage: string;
}) {
  const followed = items.filter((i) => i.following);
  const onToday = followed.filter((i) => i.voteDate === today);
  const upcoming = followed.filter((i) => i.voteDate && i.voteDate > today).sort((a, b) => a.voteDate!.localeCompare(b.voteDate!));
  const nextDay = upcoming[0]?.voteDate;
  const shown = onToday.length ? onToday : upcoming.filter((i) => i.voteDate === nextDay);
  const past = today > sessionEnd;
  const day = onToday.length ? today : nextDay;
  const withList = shown.filter((i) => i.officialVl || i.amCount > 0).length;

  const eyebrow = onToday.length
    ? `Today · ${dayWord(today)} · votes at 12:00`
    : nextDay
      ? `Next · ${dayWord(nextDay)} · votes at 12:00`
      : past
        ? "This part-session is over"
        : "Nothing followed yet";

  return (
    <aside className="relative flex flex-col overflow-hidden rounded-3xl bg-navy-deep p-9 text-white shadow-[0_2px_4px_rgba(20,26,43,0.06),0_28px_64px_-28px_rgba(10,22,54,0.55)]">
      <Wreath />
      {/* A single soft light from the top-left: the card is lit, not printed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "radial-gradient(90% 60% at 10% 0%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 60%)" }}
      />

      <div className="relative">
        <div className="text-eyebrow font-bold uppercase text-gold-300/90">{eyebrow}</div>
        <div className="mt-4 text-[1.25rem] font-bold leading-snug tracking-[-0.02em]">
          {shown.length ? "Your files on the table" : followed.length ? "No followed file on the next day" : "Follow a file to see it here"}
        </div>

        <ul className="mt-6 grid gap-1">
          {shown.slice(0, 5).map((i) => (
            <li key={i.code} className="min-w-0">
              <Link
                href={`/items/${i.code}`}
                className="press -mx-2 flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-[0.875rem] hover:bg-white/10"
              >
                <span
                  className={`h-[6px] w-[6px] shrink-0 rounded-full ring-[3px] ${
                    i.officialVl ? "bg-laurel-300 ring-laurel-300/20" : "bg-gold-300 ring-gold-300/20"
                  }`}
                />
                <span className="font-bold uppercase tracking-[0.06em]">{rapporteurLabel(i.rapporteur) ?? i.code}</span>
                <span className="min-w-0 truncate text-white/70">{i.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-white/50">{i.code.replace(/\/\d{4}$/, "")}</span>
              </Link>
            </li>
          ))}
          {shown.length > 5 && <li className="px-0.5 pt-1 text-[0.8125rem] text-white/55">+ {shown.length - 5} more</li>}
          {!shown.length && !followed.length && (
            <li className="max-w-[26rem] text-[0.875rem] leading-relaxed text-white/65">
              Press the star on a row: you get an email within minutes when its list or amendments change.
            </li>
          )}
        </ul>
      </div>

      {/* One file to print and carry in: every list of that day, in order. */}
      {day && withList > 0 && <div aria-hidden className="min-h-8 flex-1" />}
      {day && withList > 0 && (
        <a
          href={`/api/annotated-vl/bundle?day=${day}&lang=${vlLanguage}`}
          className="press glass-dark relative flex items-center justify-between gap-4 rounded-2xl px-5 py-4 text-[0.875rem] font-semibold hover:bg-white/20"
        >
          <span>
            <span aria-hidden className="mr-1.5 text-gold-300">↓</span>
            All {withList} list{withList === 1 ? "" : "s"} in one file · {vlLanguage.toUpperCase()}
          </span>
          <small className="shrink-0 font-medium text-white/55">.docx · unverified</small>
        </a>
      )}
    </aside>
  );
}

/** Laurel wreath watermark, gold, with the LAURUS checkmark at its centre. */
function Wreath() {
  const leaves = [30, 60, 90, 120, 150, 210, 240, 270, 300, 330];
  return (
    <svg
      className="pointer-events-none absolute -right-10 -top-10 h-[210px] w-[210px] text-gold-300 opacity-[0.10]"
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden
    >
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
