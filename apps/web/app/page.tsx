import Link from "next/link";
import { SessionBoard, type BoardFilter } from "@/components/SessionBoard";
import { TodayBoard } from "@/components/TodayBoard";
import { TopNav } from "@/components/TopNav";
import { getSessions, getSessionItems, getOfficialVlByItem, getViewerContext, type SessionSummary } from "@/lib/data";
import type { DisplayItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const YEAR = 2026;

function pickDefault(sessions: SessionSummary[], today: string): SessionSummary | undefined {
  return (
    sessions.find((s) => s.start_date <= today && today <= s.end_date) ??
    sessions.find((s) => s.start_date > today) ??
    [...sessions].reverse().find((s) => s.end_date < today) ??
    sessions[0]
  );
}

function sessionSubtitle(s: SessionSummary): string {
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDate();
  const month = new Date(`${s.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" });
  const place = s.location === "STR" ? "Strasbourg" : "Brussels";
  return `Plenary ${fmt(s.start_date)}–${fmt(s.end_date)} ${month} · ${place}`;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; f?: string }>;
}) {
  const { s, f } = await searchParams;
  // Brussels/Strasbourg day, not the server's.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  const [sessions, viewer] = await Promise.all([getSessions(YEAR), getViewerContext()]);
  const active = sessions.find((x) => x.id === s) ?? pickDefault(sessions, today);
  const rows = active ? await getSessionItems(active.id) : [];
  const officialVls = await getOfficialVlByItem(rows.map((r) => r.id));

  const items: DisplayItem[] = rows.map((r) => {
    const vl = officialVls.get(r.id);
    return {
      id: r.id,
      code: r.code,
      title: r.title.en || r.title.it || r.code,
      rapporteur: r.rapporteur ?? undefined,
      committee: r.committee ?? "TBD",
      voteDate: r.vote_date ?? undefined,
      vl: r.vl_status,
      amCount: r.am_count,
      fileUrl: r.documents.find((d) => d.type === "report" && d.language === "en")?.source_url,
      fileUrlLang: r.documents.find((d) => d.type === "report" && d.language === viewer.vlLanguage)?.source_url,
      officialVl: vl ? { versionLabel: vl.version_label, fetchedAt: vl.fetched_at } : undefined,
      following: viewer.followedItemIds.has(r.id),
      mine: r.committee !== null && viewer.committees.includes(r.committee),
    };
  });

  const monthName = active
    ? new Date(`${active.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" })
    : "";
  const withList = items.filter((i) => i.officialVl).length;
  const followed = items.filter((i) => i.following).length;
  const initialFilter: BoardFilter = f === "followed" ? "followed" : f === "mine" ? "mine" : "all";

  return (
    <div className="min-h-screen">
      <TopNav active={initialFilter === "followed" ? "My files" : "Votes"} />

      <main className="mx-auto max-w-6xl px-6 py-7">
        {/* Part-sessions: a segmented control, the active one lifted */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="scroll-x inline-flex max-w-full gap-0 rounded-xl bg-slate-100 p-[3px]">
            {sessions.map((m) => (
              <Link
                key={m.id}
                href={`/?s=${m.id}${f ? `&f=${f}` : ""}`}
                className={`press whitespace-nowrap rounded-[9px] px-3.5 py-1.5 text-[13px] ${
                  m.id === active?.id
                    ? "bg-white font-semibold text-ink-900 shadow-[0_1px_3px_rgba(20,26,43,0.12)]"
                    : "font-medium text-ink-500 hover:text-ink-900"
                }`}
              >
                {m.month_label}
              </Link>
            ))}
          </div>
          {active && (
            <span className="ml-auto text-[13px] text-ink-300">
              {items.length} votes{followed ? ` · ${followed} followed` : ""}
            </span>
          )}
        </div>

        {/* Session header + today's files */}
        {active && (
          <section className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h1 className="display text-[clamp(1.9rem,3.4vw,2.6rem)] font-extrabold text-eu-900">
                {monthName} {YEAR}
              </h1>
              <p className="mt-1 text-[15px] text-ink-500">{sessionSubtitle(active)}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <Stat value={items.length} label="votes" accent />
                <Stat value={withList} label="official lists" />
                <Stat value={followed} label="followed" />
                <Stat value={items.filter((i) => i.mine).length} label={viewer.committees.length ? viewer.committees.join(" · ") : "my committees"} />
              </div>
            </div>
            <TodayBoard items={items} today={today} sessionEnd={active.end_date} />
          </section>
        )}

        <SessionBoard
          items={items}
          today={today}
          initialFilter={initialFilter}
          committees={viewer.committees}
          vlLanguage={viewer.vlLanguage}
        />

        <footer className="mt-12 border-t border-slate-200 pt-5 text-center text-xs text-ink-300">
          LAURUS · Less paperwork. More wins. · Sources: EP Open Data API · Tabling Service lists
        </footer>
      </main>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-bold tracking-tight ${accent ? "text-eu-900" : "text-ink-900"}`}>{value}</span>
      <span className="text-[13px] text-ink-500">{label}</span>
    </div>
  );
}
