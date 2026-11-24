import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { AGENTS, SPLIT_EVENT, TRIAGE_EVENT, costUsd, type AgentInfo } from "@/lib/agents";
import type { Analysis, ProposedAction } from "@/lib/inbox/triage";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

const ACTION_LABEL: Record<ProposedAction["type"], string> = {
  create_invite: "create invite",
  update_committees: "update committees",
  file_document: "file document",
  reply_needed: "reply needed",
  none: "nothing",
};

interface Activity {
  /** The few numbers that say whether it is doing anything. */
  stats: Array<[label: string, value: number | string]>;
  /** The latest things it did: when, what, and what came of it. */
  recent: Array<{ key: string; when: string; what: string; outcome: string; href?: string }>;
  /** Why the numbers may be empty. */
  note?: string;
}

/** Admin-only (proxy.ts gates /admin/*, and the tables read here are admin-only under RLS). */
export default async function AgentsPage() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * DAY).toISOString();

  const [{ data: messages }, { data: splitEvents }, { data: triageEvents }] = await Promise.all([
    supabase
      .from("inbox_messages")
      .select("id, subject, from_email, received_at, status, analysis, proposed_action")
      .order("received_at", { ascending: false })
      .limit(200),
    supabase.from("events").select("item_code, created_at, meta").eq("type", SPLIT_EVENT).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    supabase.from("events").select("created_at, meta").eq("type", TRIAGE_EVENT).gte("created_at", since).limit(500),
  ]);

  const usd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`);
  type SpendMeta = { calls?: number; input?: number; output?: number };
  const sumSpend = (rows: Array<{ meta: Record<string, unknown> }>, pick: (m: Record<string, unknown>) => SpendMeta | undefined) => {
    let calls = 0;
    let input = 0;
    let output = 0;
    let dollars = 0;
    for (const r of rows) {
      const s = pick(r.meta ?? {});
      const i = Number(s?.input) || 0;
      const o = Number(s?.output) || 0;
      calls += Number(s?.calls) || 0;
      input += i;
      output += o;
      // Each event is costed at the price of the model it ran on; rows from before the model was recorded ran on Opus 5.
      dollars += costUsd(typeof r.meta?.model === "string" ? r.meta.model : "claude-opus-5", i, o);
    }
    return { calls, input, output, usd: dollars };
  };

  const keyConfigured = !!process.env.ANTHROPIC_API_KEY;

  // --- Inbox triage: read off the queue itself -------------------------------
  type Msg = {
    id: string;
    subject: string | null;
    from_email: string;
    received_at: string;
    status: string;
    analysis: Analysis | null;
    proposed_action: ProposedAction | null;
  };
  const inbox = (messages ?? []) as Msg[];
  const triaged = inbox.filter((m) => m.analysis);
  const byAction = new Map<string, number>();
  for (const m of triaged) {
    const t = m.proposed_action?.type ?? "none";
    byAction.set(t, (byAction.get(t) ?? 0) + 1);
  }
  const triageActivity: Activity = {
    stats: [
      ["Messages (last 200)", inbox.length],
      ["Triaged", triaged.length],
      ["Untriaged", inbox.length - triaged.length],
      ["Waiting for you", inbox.filter((m) => m.status === "new").length],
    ],
    recent: triaged.slice(0, 6).map((m) => ({
      key: m.id,
      when: when(m.received_at),
      what: m.analysis?.summary ?? m.subject ?? m.from_email,
      outcome: `${ACTION_LABEL[(m.proposed_action?.type ?? "none") as ProposedAction["type"]]} · ${m.status}`,
      href: "/admin/inbox",
    })),
    note: keyConfigured ? undefined : "No key: messages are kept but not triaged.",
  };

  // --- Split agents: from the events the VL route writes ---------------------
  const triageSpend = sumSpend((triageEvents ?? []) as Array<{ meta: Record<string, unknown> }>, (m) => m as SpendMeta);
  triageActivity.stats.push(["Calls (30 d)", triageSpend.calls], ["Cost (30 d)", usd(triageSpend.usd)]);

  type SplitMeta = { usd?: number; aligned?: number; agent?: number; repeated?: number; translated?: number; errors?: number; language?: string };
  const ev = (splitEvents ?? []) as Array<{ item_code: string | null; created_at: string; meta: SplitMeta }>;
  const sum = (k: keyof SplitMeta) => ev.reduce((n, e) => n + (Number(e.meta?.[k]) || 0), 0);
  const describe = (m: SplitMeta) =>
    [
      m.aligned ? `${m.aligned} aligned` : null,
      m.agent ? `${m.agent} by agent` : null,
      m.repeated ? `${m.repeated} repeated quote` : null,
      m.translated ? `${m.translated} translated` : null,
      m.errors ? `${m.errors} left with an error` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  const recentSplits: Activity["recent"] = ev.slice(0, 8).map((e, i) => ({
    key: `${e.item_code}-${i}`,
    when: when(e.created_at),
    what: e.item_code ?? "—",
    // What this list cost to generate: the quote aligner and the split agent together.
    outcome: `${describe(e.meta ?? {})}${e.meta?.usd != null ? ` · ${usd(Number(e.meta.usd))}` : ""}`,
    href: e.item_code ? `/items/${encodeURIComponent(e.item_code)}` : undefined,
  }));
  const splitRows = ev as unknown as Array<{ meta: Record<string, unknown> }>;
  const spendOf = (m: Record<string, unknown>, who: string) => (m.spend as Record<string, SpendMeta> | undefined)?.[who];
  const agentSpend = sumSpend(splitRows, (m) => spendOf(m, "split-agent"));
  const alignerSpend = sumSpend(splitRows, (m) => spendOf(m, "quote-aligner"));
  const splitNote = ev.length === 0 ? "Nothing recorded yet: this log starts with the first voting list generated after it went online." : undefined;

  const activity: Record<string, Activity> = {
    "inbox-triage": triageActivity,
    "split-agent": {
      stats: [
        ["Lists with splits (30 d)", ev.length],
        ["Rows by the agent", sum("agent") + sum("repeated")],
        ["Repeated quote, check it", sum("repeated")],
        ["Translated, not verbatim", sum("translated")],
        ["Left with an error", sum("errors")],
        ["Model calls (30 d)", agentSpend.calls],
        ["Cost (30 d)", usd(agentSpend.usd)],
      ],
      recent: recentSplits,
      note: splitNote,
    },
    "quote-aligner": {
      stats: [
        ["Rows aligned (30 d)", sum("aligned")],
        ["Model calls (30 d)", alignerSpend.calls],
        ["Cost (30 d)", usd(alignerSpend.usd)],
      ],
      recent: [],
      note: splitNote,
    },
  };

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-5xl px-8 py-16 lg:px-12 lg:py-20">
        <div className="mb-10">
          <h1 className="display text-display-md font-bold text-eu-900">Agents</h1>
          <p className="lede mt-5">
            Everything in LAURUS that puts a model between a source and the product: what each one may do alone, what stops a wrong answer, and what it has been doing. Visible to admins only.
          </p>
          <p className="mt-4 text-sm text-ink-500">
            Model access:{" "}
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${keyConfigured ? "bg-laurel-600/10 text-laurel-600" : "bg-red-100 text-red-700"}`}>
              {keyConfigured ? "ANTHROPIC_API_KEY set" : "ANTHROPIC_API_KEY missing — every agent is off"}
            </span>
          </p>
        </div>

        <div className="space-y-8">
          {AGENTS.map((a) => (
            <AgentCard key={a.id} agent={a} activity={activity[a.id]} keyConfigured={keyConfigured} />
          ))}
        </div>
      </main>
    </div>
  );
}

function AgentCard({ agent: a, activity, keyConfigured }: { agent: AgentInfo; activity?: Activity; keyConfigured: boolean }) {
  return (
    <section className="card p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink-900">{a.name}</h2>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-500">{a.purpose}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className={`rounded px-2 py-1 ${keyConfigured ? "bg-laurel-600/10 text-laurel-600" : "bg-red-100 text-red-700"}`}>{keyConfigured ? "on" : "off"}</span>
          <span className="rounded bg-eu-100 px-2 py-1 text-eu-900">{a.autonomy === "proposes" ? "Proposes — you approve" : "Acts alone — checked by code"}</span>
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-ink-500">{a.model}</span>
        </div>
      </div>

      <p className="mt-5 text-sm text-ink-700">
        <span className="eyebrow mr-2">Starts when</span>
        {a.trigger}
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-3">It may</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-ink-700">
            {a.does.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow mb-3">What stops a wrong answer</h3>
          <ul className="space-y-2 text-sm leading-relaxed text-ink-700">
            {a.guards.map((g) => (
              <li key={g} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-sm text-ink-500">
        <span className="eyebrow mr-2">If it gives nothing</span>
        {a.fallback}
      </p>

      {activity && (
        <div className="mt-7 border-t border-ink-900/[0.07] pt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {activity.stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xl font-bold text-eu-900">{value}</p>
                <p className="text-[11px] leading-tight text-ink-500">{label}</p>
              </div>
            ))}
          </div>
          {activity.note && <p className="mt-4 text-sm text-ink-300">{activity.note}</p>}
          {activity.recent.length > 0 && (
            <table className="mt-5 w-full text-left text-sm">
              <tbody>
                {activity.recent.map((r) => (
                  <tr key={r.key} className="border-b border-slate-50">
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-ink-300">{r.when}</td>
                    <td className="py-2 pr-4">
                      {r.href ? (
                        <Link href={r.href} className="font-medium text-eu-700 hover:underline">
                          {r.what}
                        </Link>
                      ) : (
                        r.what
                      )}
                    </td>
                    <td className="py-2 text-right text-xs text-ink-500">{r.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
        <span className="font-mono">{a.source}</span>
        {a.workAt && (
          <Link href={a.workAt.href} className="font-medium text-eu-700 hover:underline">
            {a.workAt.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
