"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMITTEES, CONTACT_EMAIL } from "@/lib/committees";
import { EU_LANGUAGES } from "@/lib/languages";
import { completeOnboardingAction } from "@/app/onboarding/actions";

const LANG_ORDER = (() => {
  const top = ["it", "en"];
  const rest = EU_LANGUAGES.filter((l) => !top.includes(l.code));
  return [...EU_LANGUAGES.filter((l) => top.includes(l.code)).sort((a, b) => top.indexOf(a.code) - top.indexOf(b.code)), ...rest];
})();

const STEPS = ["Benvenuto", "Commissioni", "Lingua", "Uso responsabile", "Contatti"];

export function OnboardingWizard({ token }: { token: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [committees, setCommittees] = useState<string[]>([]);
  const [language, setLanguage] = useState("it");
  const [understood, setUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCommittee = (code: string) =>
    setCommittees((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const canNext = step !== 3 || understood;
  const isLast = step === STEPS.length - 1;

  async function finish() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("vl_language", language);
    for (const c of committees) fd.append("committees", c);
    const res = await completeOnboardingAction(undefined, fd);
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      {/* progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-300">
          <span>
            Passo {step + 1} di {STEPS.length}
          </span>
          <span className="text-laurel-700">{STEPS[step]}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-laurel-700 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="min-h-[18rem]">
        {step === 0 && (
          <div>
            <h1 className="text-xl font-bold text-ink-900">Benvenuto in LAURUS</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              LAURUS raccoglie emendamenti e liste di voto delle plenarie del Parlamento europeo e ti
              restituisce voting list già annotate, pronte all&apos;uso. Poche domande e sei operativo.
            </p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-ink-900">Che commissioni segui?</h2>
            <p className="mt-1 text-sm text-ink-500">Puoi sceglierne più di una. Le userai per filtrare ciò che ti interessa.</p>
            <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {COMMITTEES.map((c) => {
                const on = committees.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCommittee(c.code)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      on ? "border-laurel-400 bg-laurel-50 text-laurel-900" : "border-slate-200 text-ink-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`font-mono text-xs font-semibold ${on ? "text-laurel-700" : "text-ink-300"}`}>{c.code}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-ink-900">In che lingua vuoi di solito le VL?</h2>
            <p className="mt-1 text-sm text-ink-500">Diventa la lingua predefinita per le liste di voto. Potrai cambiarla dopo.</p>
            <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {LANG_ORDER.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    language === l.code ? "border-laurel-400 bg-laurel-50 text-laurel-900" : "border-slate-200 text-ink-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-mono text-xs uppercase text-ink-300">{l.code}</span> {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-ink-900">Prima di iniziare: usa LAURUS con criterio</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-700">
              <p>
                LAURUS genera le liste di voto in automatico a partire dai documenti ufficiali del Parlamento
                europeo. La generazione è gratuita, ma ogni richiesta scarica documenti dai server del
                Parlamento e occupa risorse del servizio.
              </p>
              <p>
                Perciò: genera una VL quando ti serve davvero, non &laquo;per provare&raquo;. Se devi solo
                rileggerne una, riaprila invece di rigenerarla.
              </p>
              <p>
                Per mantenere il servizio veloce e sostenibile per tutti, ogni utente può generare al massimo{" "}
                <strong>10 liste di voto al giorno</strong>.
              </p>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-900">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="accent-laurel-700" />
              Ho capito
            </label>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-lg font-bold text-ink-900">Un errore o un&apos;idea?</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Hai trovato un errore o hai un&apos;idea per migliorare LAURUS? Scrivi a{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-laurel-700 hover:underline">
                {CONTACT_EMAIL}
              </a>
              . Il servizio migliora grazie ai tuoi feedback.
            </p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:text-ink-900 disabled:invisible"
        >
          ← Indietro
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="rounded-lg bg-laurel-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-laurel-900 disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : "Inizia a usare LAURUS"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            className="rounded-lg bg-laurel-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-laurel-900 disabled:opacity-40"
          >
            Avanti →
          </button>
        )}
      </div>
    </div>
  );
}
