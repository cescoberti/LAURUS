import { TopNav } from "@/components/TopNav";
import { createAdminClient } from "@/lib/supabase/admin";
import { REQUEST_COLUMNS, onboardingUrl, type AccessRequest } from "@/lib/accessRequests";
import { decideRequestAction } from "./actions";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

/** Admin-only (proxy.ts gates /admin/*). Built to be used on a phone: one request per card, big buttons. */
export default async function RichiestePage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const { data } = await createAdminClient().from("access_requests").select(REQUEST_COLUMNS).order("created_at", { ascending: false }).limit(60);
  const all = (data ?? []) as AccessRequest[];
  const pending = all.filter((x) => x.status === "pending");
  const decided = all.filter((x) => x.status !== "pending").slice(0, 15);

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8 lg:py-20">
        <h1 className="display text-display-md font-bold text-eu-900">Richieste di accesso</h1>
        <p className="lede mt-4">
          Chi chiede di entrare in LAURUS compare qui, e ti arriva anche una mail. Approvando, la persona riceve il suo link e entra in LAURUS: nessun accesso a Vercel o al codice.
        </p>

        {r && <p className="mt-6 rounded-xl bg-eu-50/80 px-4 py-3 text-[0.9375rem] font-medium text-eu-900 ring-1 ring-inset ring-eu-200/70">{r}</p>}

        <div className="mt-8 space-y-4">
          {pending.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-ink-300">Nessuna richiesta in attesa.</p>
          ) : (
            pending.map((q) => (
              <form key={q.id} action={decideRequestAction} className="card p-6">
                <input type="hidden" name="id" value={q.id} />
                <p className="text-lg font-bold text-ink-900">{q.full_name || q.email}</p>
                {q.full_name && <p className="text-sm text-ink-500">{q.email}</p>}
                {q.note && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-ink-700">{q.note}</p>}
                <p className="mt-3 text-xs text-ink-300">{when(q.created_at)}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button type="submit" name="decision" value="approve" className="btn-primary py-3.5">
                    Approva
                  </button>
                  <button type="submit" name="decision" value="reject" className="btn-secondary py-3.5">
                    Rifiuta
                  </button>
                </div>
              </form>
            ))
          )}
        </div>

        {decided.length > 0 && (
          <>
            <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-ink-500">Decise di recente</h2>
            <div className="card mt-3 divide-y divide-slate-50">
              {decided.map((q) => (
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{q.full_name || q.email}</p>
                    <p className="text-xs text-ink-300">{q.decided_at ? when(q.decided_at) : when(q.created_at)}</p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${q.status === "approved" ? "bg-eu-100 text-eu-900" : "bg-slate-100 text-ink-500"}`}
                    title={q.status === "approved" && q.invite_token ? onboardingUrl(q.invite_token) : undefined}
                  >
                    {q.status === "approved" ? "Approvata" : "Rifiutata"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
