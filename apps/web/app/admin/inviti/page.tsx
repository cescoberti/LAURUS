import { TopNav } from "@/components/TopNav";
import { InviteLinkRow } from "@/components/InviteLinkRow";
import { createClient } from "@/lib/supabase/server";
import { generateInviteAction } from "./actions";

export const dynamic = "force-dynamic";

interface InviteRow {
  token: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export default async function InvitiPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select("token, email, created_at, expires_at, used_at")
    .order("created_at", { ascending: false });
  const invites = (data as InviteRow[] | null) ?? [];
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const statusOf = (i: InviteRow): "active" | "used" | "expired" =>
    i.used_at ? "used" : new Date(i.expires_at) < new Date() ? "expired" : "active";

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Invites</h1>
        <p className="mt-1 text-sm text-ink-500">
          Generate an invite link to share with a new member. The link stays valid for 30 days and can be
          used once.
        </p>

        <form action={generateInviteAction} className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-ink-900">Email (optional)</label>
            <input
              type="email"
              name="email"
              placeholder="nome@europarl.europa.eu"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-ink-300 focus:border-laurel-400 focus:outline-none"
            />
          </div>
          <button type="submit" className="rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-laurel-900">
            Generate invite link
          </button>
        </form>

        <div className="mt-6 space-y-2">
          {invites.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-ink-300">
              No invites generated yet.
            </p>
          ) : (
            invites.map((i) => (
              <InviteLinkRow
                key={i.token}
                url={`${base}/onboarding?token=${i.token}`}
                email={i.email}
                status={statusOf(i)}
                createdAt={i.created_at}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
