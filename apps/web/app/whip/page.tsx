import { TopNav } from "@/components/TopNav";
import { WhipBoard, type WhipSession, type WhipItem } from "@/components/WhipBoard";
import { createClient } from "@/lib/supabase/server";
import { COMMITTEES, COMMITTEE_CANDIDATES } from "@/lib/committees";

export const dynamic = "force-dynamic";

const NOTE_LEAD_DAYS = 14; // note due two weeks before the sitting

interface SessionRow {
  id: string;
  month_label: string;
  start_date: string;
  end_date: string;
  location: string;
}
interface ItemRow {
  id: string;
  code: string;
  title: { en?: string; it?: string };
  rapporteur: string | null;
  committee: string | null;
  committees: string[] | null;
  assigned_advisors: Record<string, string> | null;
  note_status: "pending" | "submitted" | "na";
  note_submitted_at: string | null;
}

export default async function WhipPage() {
  const supabase = await createClient();

  const [{ data: sessions }, { data: advisors }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, month_label, start_date, end_date, location")
      .gt("vote_count", 0) // skip future/empty part-sessions
      .order("start_date", { ascending: false })
      .limit(6),
    supabase.from("committee_advisors").select("code, advisor"),
  ]);

  const advisorByCommittee = new Map<string, string>();
  for (const a of advisors ?? []) if (a.advisor) advisorByCommittee.set(a.code, a.advisor);
  const advisorOptions = [...new Set([...advisorByCommittee.values()])].sort();

  const sessionRows = (sessions as SessionRow[] | null) ?? [];
  const { data: items } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee, committees, assigned_advisors, note_status, note_submitted_at, session_id")
    .in("session_id", sessionRows.map((s) => s.id))
    .order("code");

  const now = Date.now();
  const board: WhipSession[] = sessionRows.map((s) => {
    const deadline = new Date(Date.parse(s.start_date) - NOTE_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
    const sessionItems: WhipItem[] = ((items as (ItemRow & { session_id: string })[] | null) ?? [])
      .filter((it) => it.session_id === s.id)
      .map((it) => {
        const codes = it.committees?.length ? it.committees : it.committee ? [it.committee] : [];
        const overrides = it.assigned_advisors ?? {};
        const committees = codes.map((c) => {
          const override = overrides[c] ?? null;
          return {
            committee: c,
            advisor: override ?? advisorByCommittee.get(c) ?? null,
            isOverride: override != null,
          };
        });
        return {
          id: it.id,
          code: it.code,
          rapporteur: it.rapporteur,
          title: it.title.en || it.title.it || it.code,
          committees,
          noteStatus: it.note_status,
          submittedAt: it.note_submitted_at,
          deadline,
          late: it.note_status === "pending" && Date.parse(deadline) < now,
        };
      });
    return {
      id: s.id,
      label: s.month_label,
      startDate: s.start_date,
      endDate: s.end_date,
      location: s.location,
      deadline,
      items: sessionItems,
    };
  });

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Whip</h1>
        <p className="mt-1 text-sm text-ink-500">
          Advisor assigned to each file, and the status of the plenary note. Advisors default from the
          committee (ECR map); reassign any file as needed. Note due {NOTE_LEAD_DAYS} days before the sitting.
        </p>
        <WhipBoard sessions={board} advisorOptions={advisorOptions} committees={COMMITTEES} committeeCandidates={COMMITTEE_CANDIDATES} />
      </main>
    </div>
  );
}
