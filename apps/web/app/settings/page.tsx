import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { EU_LANGUAGES, DEFAULT_LANGUAGES } from "@/lib/languages";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("email, full_name, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final, languages")
    .eq("id", user!.id)
    .single();
  const selected = new Set<string>(profile?.languages ?? DEFAULT_LANGUAGES);

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Notifiche</h1>
        <p className="mt-1 text-sm text-ink-500">
          Come vuoi essere avvisato quando LAURUS ha novità sulle tue relazioni.
        </p>

        <form action={saveSettingsAction} className="mt-6 space-y-5 rounded-xl border border-slate-200/80 bg-white p-6 shadow-card">
          <div>
            <label className="text-sm font-semibold text-ink-900" htmlFor="whatsapp_phone">
              Numero WhatsApp
            </label>
            <input
              id="whatsapp_phone"
              name="whatsapp_phone"
              type="tel"
              defaultValue={profile?.whatsapp_phone ?? ""}
              placeholder="+39 333 1234567"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-laurel-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink-300">
              Con prefisso internazionale. Serve per i reminder e per usare il bot WhatsApp.
            </p>
          </div>

          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input type="checkbox" name="wants_email" defaultChecked={profile?.wants_email ?? true} className="mt-0.5 accent-laurel-700" />
            <span>
              <span className="font-semibold">Reminder via email</span>
              <span className="block text-xs text-ink-500">Nuove VL disponibili, nuovi emendamenti sulle relazioni seguite.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input type="checkbox" name="wants_whatsapp" defaultChecked={profile?.wants_whatsapp ?? false} className="mt-0.5 accent-laurel-700" />
            <span>
              <span className="font-semibold">Reminder via WhatsApp</span>
              <span className="block text-xs text-ink-500">Stessi avvisi, sul numero qui sopra.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input type="checkbox" name="wants_clean_final" defaultChecked={profile?.wants_clean_final ?? false} className="mt-0.5 accent-laurel-700" />
            <span>
              <span className="font-semibold">Testo definitivo post-voto via email</span>
              <span className="block text-xs text-ink-500">
                Appena l&apos;EP pubblica il testo adottato, ricevi il file pulito in allegato.
              </span>
            </span>
          </label>

          <div>
            <p className="text-sm font-semibold text-ink-900">Lingue di lavoro</p>
            <p className="mb-2 text-xs text-ink-500">
              Le VL annotate vengono preparate solo nelle lingue selezionate (standard: IT + EN).
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {EU_LANGUAGES.map((l) => (
                <label key={l.code} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="languages"
                    value={l.code}
                    defaultChecked={selected.has(l.code)}
                    className="accent-laurel-700"
                  />
                  <span className="font-mono text-xs uppercase text-ink-300">{l.code}</span> {l.label}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-laurel-900">
            Salva
          </button>
        </form>
      </main>
    </div>
  );
}
