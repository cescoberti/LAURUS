import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopNav } from "@/components/TopNav";
import { NewUserForm } from "@/components/NewUserForm";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  // "own profile read" RLS only exposes the caller's row; listing every
  // advisor is an admin-only operation, so it goes through the service role.
  const { data: users } = await createAdminClient()
    .from("users")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-ink-900">Utenti</h1>
        <p className="mb-6 text-sm text-ink-500">
          Onboarda un nuovo advisor. Riceve una email di invito per impostare la propria password.
        </p>

        <NewUserForm />

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Email", "Nome", "Ruolo", "Creato"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-sm text-ink-900">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-ink-500">{u.full_name ?? "–"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        u.role === "admin"
                          ? "bg-laurel-800 text-white ring-laurel-800"
                          : "bg-slate-100 text-ink-700 ring-slate-200"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500">
                    {new Date(u.created_at).toLocaleDateString("it-IT")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
