import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { REQUEST_COLUMNS, onboardingUrl, type AccessRequest } from "@/lib/accessRequests";
import { decideByTokenAction } from "./actions";

export const dynamic = "force-dynamic";
// The address is a capability: keep it out of any index.
export const metadata = { title: "Richiesta di accesso — LAURUS", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

/** The page behind the button in the admin's email: who asked, and two big buttons. */
export default async function RichiestaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { token } = await params;
  const { r } = await searchParams;
  if (!UUID.test(token)) notFound();

  const { data } = await createAdminClient().from("access_requests").select(REQUEST_COLUMNS).eq("token", token).maybeSingle();
  if (!data) notFound();
  const req = data as AccessRequest;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[26rem]">
        <div className="flex justify-center">
          <Wordmark size={30} />
        </div>

        <div className="card-raised mt-10 px-7 py-8">
          <p className="eyebrow">Richiesta di accesso</p>
          <h1 className="display mt-3 text-[1.75rem] font-bold leading-tight text-eu-900">{req.full_name || req.email}</h1>
          {req.full_name && <p className="mt-1 text-[0.9375rem] text-ink-500">{req.email}</p>}
          {req.note && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[0.9375rem] text-ink-700">{req.note}</p>}
          <p className="mt-4 text-xs text-ink-300">Ricevuta il {when(req.created_at)}</p>

          {r && <p className="mt-6 rounded-xl bg-eu-50/80 px-4 py-3 text-[0.9375rem] font-medium text-eu-900 ring-1 ring-inset ring-eu-200/70">{r}</p>}

          {req.status === "pending" ? (
            <form action={decideByTokenAction} className="mt-7 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <button type="submit" name="decision" value="approve" className="btn-primary w-full py-4 text-[1rem]">
                Approva
              </button>
              <button type="submit" name="decision" value="reject" className="btn-secondary w-full py-3.5">
                Rifiuta
              </button>
            </form>
          ) : (
            <div className="mt-7">
              <p className="text-[0.9375rem] font-semibold text-ink-900">
                {req.status === "approved" ? "Approvata" : "Rifiutata"}
                {req.decided_at ? <span className="font-normal text-ink-500"> · {when(req.decided_at)}</span> : null}
              </p>
              {req.status === "approved" && req.invite_token && (
                <p className="mt-3 break-all rounded-xl bg-slate-50 px-4 py-3 text-xs text-ink-500">
                  Se la mail non fosse arrivata, passale tu questo link:
                  <br />
                  <span className="text-ink-700">{onboardingUrl(req.invite_token)}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
