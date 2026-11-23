"use client";

import { useState, useTransition } from "react";
import { deleteUserAction } from "@/app/admin/users/actions";

/**
 * Two steps, because there is no undoing it: "Elimina" only asks, and the
 * second button, naming the address, is the one that deletes.
 */
export function DeleteUserButton({ id, email }: { id: string; email: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="press rounded-full px-3 py-1.5 text-xs font-medium text-ink-400 ring-1 ring-inset ring-ink-900/[0.09] hover:bg-red-50 hover:text-red-700 hover:ring-red-200"
      >
        Elimina
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="max-w-[16rem] text-right text-xs leading-snug text-ink-500">
        Elimina <b className="text-ink-900">{email}</b> con i suoi file seguiti. Poi puoi invitarla di nuovo.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          className="press rounded-full px-3 py-1.5 text-xs font-medium text-ink-500 ring-1 ring-inset ring-ink-900/[0.09] hover:bg-ink-900/[0.04]"
        >
          Annulla
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteUserAction(id);
              if (r.error) setError(r.error);
            })
          }
          className="press rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Elimino…" : "Elimina definitivamente"}
        </button>
      </div>
      {error && <p className="max-w-[16rem] text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
