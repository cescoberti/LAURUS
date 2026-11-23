import { SessionBoard, type BoardFilter } from "@/components/SessionBoard";
import { SessionSwitcher } from "@/components/SessionSwitcher";
import { TodayBoard } from "@/components/TodayBoard";
import { TopNav } from "@/components/TopNav";
import { LaurusMark } from "@/components/Logo";
import { getSessions, getSessionItems, getOfficialVlByItem, getViewerContext, type SessionSummary } from "@/lib/data";
import type { DisplayItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The sitting in progress, else the next one — the list holds nothing else. */
function pickDefault(sessions: SessionSummary[], today: string): SessionSummary | undefined {
  return sessions.find((s) => s.start_date <= today && today <= s.end_date) ?? sessions[0];
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; f?: string }>;
}) {
  const { s, f } = await searchParams;
  // Brussels/Strasbourg day, not the server's.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  const [sessions, viewer] = await Promise.all([getSessions(today), getViewerContext()]);
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
      committees: r.committees?.length ? r.committees : r.committee ? [r.committee] : [],
      voteDate: r.vote_date ?? undefined,
      vl: r.vl_status,
      amCount: r.am_count,
      fileUrl: r.documents.find((d) => d.type === "report" && d.language === "en")?.source_url,
      fileUrlLang: r.documents.find((d) => d.type === "report" && d.language === viewer.vlLanguage)?.source_url,
      officialVl: vl ? { versionLabel: vl.version_label, fetchedAt: vl.fetched_at } : undefined,
      following: viewer.followedItemIds.has(r.id),
      mine: [r.committee, ...(r.committees ?? [])].some((c) => c !== null && viewer.committees.includes(c)),
    };
  });

  const withList = items.filter((i) => i.officialVl).length;
  const followed = items.filter((i) => i.following).length;
  const initialFilter: BoardFilter = f === "followed" ? "followed" : f === "mine" ? "mine" : "all";

  return (
    <div className="min-h-screen">
      <TopNav active={initialFilter === "followed" ? "My files" : "Votes"} />

      <main className="mx-auto max-w-shell px-8 pb-30 pt-16 lg:px-12 lg:pt-22">
        {/* One part-session at a time; the ones still to come are in the menu. */}
        <div className="rise">
          <SessionSwitcher sessions={sessions} active={active} filter={f} />
        </div>

        {active && (
          <section className="rise rise-1 mt-14 grid gap-7 lg:mt-18 lg:grid-cols-[1.35fr_1fr]">
            {/* The four numbers that answer "where does this part-session
                stand" before anything is read. */}
            <div className="card-raised grid grid-cols-2 gap-y-10 px-9 py-10 sm:grid-cols-4 sm:gap-y-0">
              <Stat value={items.length} label="votes" accent />
              <Stat value={withList} label="official lists" />
              <Stat value={followed} label="followed" />
              <Stat
                value={items.filter((i) => i.mine).length}
                label={viewer.committees.length ? viewer.committees.join(" · ") : "my committees"}
              />
            </div>
            <TodayBoard items={items} today={today} sessionEnd={active.end_date} vlLanguage={viewer.vlLanguage} />
          </section>
        )}

        <div className="rise rise-2">
          <SessionBoard
            items={items}
            today={today}
            initialFilter={initialFilter}
            committees={viewer.committees}
            vlLanguage={viewer.vlLanguage}
          />
        </div>

        <footer className="mt-30 flex flex-col items-center gap-4 border-t border-slate-200/70 pt-12 text-center">
          <LaurusMark size={22} className="text-laurel-700/50" />
          <p className="text-[0.8125rem] font-medium text-ink-400">Less paperwork. More wins.</p>
          <p className="text-xs text-ink-400">Sources: EP Open Data API · Tabling Service lists</p>
        </footer>
      </main>
    </div>
  );
}

/**
 * A number large enough to be read across a desk, with its label beneath in
 * small caps. The vertical hairline belongs to the one on its left.
 */
function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="px-1 sm:border-l sm:border-slate-200/70 sm:px-7 sm:first:border-l-0 sm:first:pl-0">
      <div className={`text-stat font-bold tabular-nums ${accent ? "text-eu-900" : "text-ink-900"}`}>{value}</div>
      <div className="eyebrow mt-3 leading-[1.5]" title={label}>
        {label}
      </div>
    </div>
  );
}
