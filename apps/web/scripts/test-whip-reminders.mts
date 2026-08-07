/** Dry-run: what would go out on a given date? No emails are sent. */
import { createAdminClient } from "../lib/supabase/admin";
import { findDueReminders } from "../lib/notify/whipReminder";

const admin = createAdminClient();
for (const today of process.argv.slice(2).length ? process.argv.slice(2) : ["2026-08-24", "2026-08-31"]) {
  const due = await findDueReminders(admin, today);
  console.log(`\n===== ${today} — ${due.length} reminder set(s) dovuti =====`);
  for (const r of due) {
    console.log(`${r.sessionLabel} ${r.startDate} · stage ${r.stage} (dovuto ${r.dueOn}) · nota entro ${r.noteDue}`);
    for (const rec of r.recipients) {
      console.log(`   ${rec.advisor.padEnd(26)} ${String(rec.files.length).padStart(2)} file  ${rec.email ?? "— NESSUN ACCOUNT —"}`);
      console.log(`      ${rec.files.map((f) => f.code).join(", ").slice(0, 120)}`);
    }
  }
}
