import { SetPasswordForm } from "@/components/SetPasswordForm";
import { Wordmark } from "@/components/Logo";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="mb-4 text-sm text-ink-500">Imposta la tua password per accedere a LAURUS.</p>
          <SetPasswordForm />
        </div>
      </div>
    </div>
  );
}
