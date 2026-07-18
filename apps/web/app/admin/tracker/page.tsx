import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  vl_download: "Download VL",
  vl_generate: "VL Generator",
  wa_message: "Msg WhatsApp",
  wa_vl_request: "Richiesta VL (WA)",
};

/** Admin-only usage tracker: who is connected, which files were requested. */
export default async function TrackerPage() {
  const supabase = await createClient(); // RLS: events readable only by admins

  const [{ data: users }, { data: events }] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final, created_at").order("created_at"),
    supabase.from("events").select("type, item_code, user_id, meta, created_at").order("created_at", { ascending: false }).limit(300),
  ]);

  const emailById = new Map((users ?? []).map((u) => [u.id, u.email]));
  const weekAgo = Date.now() - 7 * 86_400_000;
  const activeIds = new Set((events ?? []).filter((e) => e.user_id && Date.parse(e.created_at) > weekAgo).map((e) => e.user_id));

  // Requests per item
  const perItem = new Map<string, number>();
  for (const e of events ?? []) {
    if (!e.item_code) continue;
    perItem.set(e.item_code, (perItem.get(e.item_code) ?? 0) + 1);
  }
  const topItems = [...perItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Tracker</h1>
            <p className="mt-1 text-sm text-ink-500">Utenti collegati e file richiesti — visibile solo agli admin.</p>
          </div>
          <Link href="/admin/users" className="text-sm font-medium text-laurel-700 hover:underline">
            Gestione utenti →
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Utenti registrati", users?.length ?? 0],
            ["Attivi (7 giorni)", activeIds.size],
            ["Richieste totali", events?.length ?? 0],
            ["File richiesti", perItem.size],
          ].map(([label, n]) => (
            <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
              <p className="text-2xl font-bold text-laurel-800">{n}</p>
              <p className="text-xs text-ink-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">File più richiesti</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
              {topItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-300">Ancora nessuna richiesta registrata.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <tbody>
                    {topItems.map(([code, n]) => (
                      <tr key={code} className="border-b border-slate-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/items/${code}`} className="font-mono text-xs text-laurel-700 hover:underline">
                            {code}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-ink-900">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Utenti</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
              <table className="w-full text-left text-sm">
                <tbody>
                  {(users ?? []).map((u) => (
                    <tr key={u.id} className="border-b border-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink-900">{u.full_name ?? u.email}</p>
                        <p className="text-xs text-ink-300">{u.email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-500">
                        {u.role === "admin" && <span className="mr-1 rounded bg-laurel-100 px-1.5 py-0.5 font-semibold text-laurel-800">admin</span>}
                        {activeIds.has(u.id) && <span className="rounded bg-gold-500/15 px-1.5 py-0.5 font-semibold text-gold-600">attivo</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-ink-300">
                        {[u.wants_email && "✉️", u.wants_whatsapp && "💬", u.wants_clean_final && "📄"].filter(Boolean).join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Attività recente</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
            {(events ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-300">Nessun evento.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody>
                  {(events ?? []).slice(0, 40).map((e, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-4 py-2 text-xs text-ink-300">
                        {new Date(e.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 text-xs font-semibold text-ink-700">{TYPE_LABEL[e.type] ?? e.type}</td>
                      <td className="px-4 py-2 font-mono text-xs text-laurel-700">{e.item_code ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-ink-500">{e.user_id ? emailById.get(e.user_id) ?? "?" : "anonimo"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
