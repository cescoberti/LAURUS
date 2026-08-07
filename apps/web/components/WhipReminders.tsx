"use client";

import { useState } from "react";
import { sendRemindersAction } from "@/app/whip/actions";

export interface ReminderRow {
  sessionLabel: string;
  startDate: string;
  stage: "T21" | "T14";
  dueOn: string;
  advisor: string;
  fileCount: number;
  email: string | null;
  sent: boolean;
}

/**
 * What the advisors are about to be told, and what is already out. The point of
 * showing it rather than trusting the cron is the unreachable column: an
 * advisor with no LAURUS account gets no reminder, and the whip has to know.
 */
export function WhipReminders({ rows, anyDue }: { rows: ReminderRow[]; anyDue: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const unreachable = [...new Set(rows.filter((r) => !r.email).map((r) => r.advisor))];

  return (
    <section className="mt-10">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h2 className="text-sm font-bold text-ink-900">Reminders</h2>
        <span className="text-xs text-ink-300">
          three weeks and two weeks before a sitting · only files with a pending note
        </span>
        {anyDue && (
          <button
            onClick={async () => {
              setBusy(true);
              await sendRemindersAction();
              setBusy(false);
              setDone(true);
            }}
            disabled={busy}
            className="ml-auto rounded-lg bg-laurel-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-laurel-900 disabled:opacity-70"
          >
            {busy ? "Sending…" : done ? "Sent ✓" : "Send due reminders now"}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-ink-300">
          Nothing due. Reminders appear here three weeks before a sitting.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Sitting", "When", "Advisor", "Files", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 text-sm text-ink-900">{r.sessionLabel}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">
                    {r.stage === "T21" ? "3 weeks" : "2 weeks (note due)"} · {fmt(r.dueOn)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-ink-700">{r.advisor}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">{r.fileCount}</td>
                  <td className="px-4 py-2.5">
                    {r.sent ? (
                      <span className="rounded-md bg-laurel-100 px-2 py-0.5 text-[11px] font-semibold text-laurel-800">Sent</span>
                    ) : r.email ? (
                      <span className="rounded-md bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold text-gold-600">Due</span>
                    ) : (
                      <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700" title="No LAURUS account linked to this advisor">
                        No account
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unreachable.length > 0 && (
        <p className="mt-2 px-1 text-xs text-red-600">
          No reminder can reach {unreachable.join(", ")} — no LAURUS account carries that name. Invite them, or
          set their full name on the account to match.
        </p>
      )}
    </section>
  );
}

function fmt(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
