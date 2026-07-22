"use client";

import { useState } from "react";
import { reassignAdvisorAction, setNoteStatusAction } from "@/app/whip/actions";

export interface WhipItem {
  id: string;
  code: string;
  rapporteur: string | null;
  title: string;
  committee: string | null;
  advisor: string | null;
  isOverride: boolean;
  noteStatus: "pending" | "submitted" | "na";
  submittedAt: string | null;
  deadline: string;
  late: boolean;
}
export interface WhipSession {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  location: string;
  deadline: string;
  items: WhipItem[];
}

export function WhipBoard({
  sessions,
  advisorOptions,
  committees,
}: {
  sessions: WhipSession[];
  advisorOptions: string[];
  committees: Array<{ code: string; name: string }>;
}) {
  const committeeName = new Map(committees.map((c) => [c.code, c.name]));

  if (sessions.length === 0) {
    return <p className="mt-6 text-sm text-ink-300">No sessions yet.</p>;
  }

  return (
    <div className="mt-6 space-y-8">
      {sessions.map((s) => {
        const pending = s.items.filter((i) => i.noteStatus === "pending").length;
        const late = s.items.filter((i) => i.late).length;
        const submitted = s.items.filter((i) => i.noteStatus === "submitted").length;
        return (
          <section key={s.id}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h2 className="text-sm font-bold text-ink-900">{s.label}</h2>
              <span className="text-xs text-ink-300">
                {fmt(s.startDate)}–{fmt(s.endDate)} · {s.location} · notes due {fmt(s.deadline)}
              </span>
              <span className="ml-auto flex gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-laurel-100 px-2 py-0.5 text-laurel-800">{submitted} done</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-ink-500">{pending} pending</span>
                {late > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{late} late</span>}
              </span>
            </div>

            <div className="scroll-x overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {["Rapporteur / subject", "Cmte", "Advisor", "Plenary note"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-50 align-top">
                      <td className="max-w-[360px] px-4 py-3">
                        <p className="text-sm font-semibold text-ink-900">
                          {it.rapporteur ?? <span className="font-normal text-ink-300">No rapporteur</span>}
                        </p>
                        <p className="text-xs text-ink-500">
                          <span className="font-mono text-laurel-700">{it.code}</span> · {it.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500" title={it.committee ? committeeName.get(it.committee) : ""}>
                        {it.committee ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <AdvisorSelect item={it} options={advisorOptions} />
                      </td>
                      <td className="px-4 py-3">
                        <NoteControl item={it} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AdvisorSelect({ item, options }: { item: WhipItem; options: string[] }) {
  const [saving, setSaving] = useState(false);
  const all = [...new Set([...(item.advisor ? [item.advisor] : []), ...options])].sort();
  return (
    <div className="flex items-center gap-1.5">
      <select
        defaultValue={item.advisor ?? ""}
        disabled={saving}
        onChange={async (e) => {
          setSaving(true);
          const fd = new FormData();
          fd.set("itemId", item.id);
          fd.set("advisor", e.target.value);
          await reassignAdvisorAction(fd);
          setSaving(false);
        }}
        className="max-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-ink-900 focus:border-laurel-400 focus:outline-none"
      >
        <option value="">— unassigned —</option>
        {all.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {item.isOverride && <span title="Reassigned (overrides committee default)" className="text-[10px] text-gold-600">✎</span>}
    </div>
  );
}

function NoteControl({ item }: { item: WhipItem }) {
  const [saving, setSaving] = useState(false);
  const set = async (status: string) => {
    setSaving(true);
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("status", status);
    await setNoteStatusAction(fd);
    setSaving(false);
  };

  if (item.noteStatus === "submitted") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-md bg-laurel-800 px-2 py-0.5 text-[11px] font-semibold text-white">
          Submitted{item.submittedAt ? ` · ${fmt(item.submittedAt)}` : ""}
        </span>
        <button onClick={() => set("pending")} disabled={saving} className="text-[11px] text-ink-300 hover:text-ink-700">
          undo
        </button>
      </div>
    );
  }
  if (item.noteStatus === "na") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">N/A</span>
        <button onClick={() => set("pending")} disabled={saving} className="text-[11px] text-ink-300 hover:text-ink-700">
          undo
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
          item.late ? "bg-red-100 text-red-700" : "bg-gold-500/15 text-gold-600"
        }`}
      >
        {item.late ? "Late" : "Pending"}
      </span>
      <button onClick={() => set("submitted")} disabled={saving} className="text-[11px] font-semibold text-laurel-700 hover:underline">
        mark submitted
      </button>
      <button onClick={() => set("na")} disabled={saving} className="text-[11px] text-ink-300 hover:text-ink-700">
        n/a
      </button>
    </div>
  );
}

function fmt(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
