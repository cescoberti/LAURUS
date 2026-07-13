/**
 * One-time setup: creates the first LAURUS admin in a fresh Supabase
 * project. Run once after `supabase/migrations/0001_init.sql` is applied:
 *
 *   npm run bootstrap-admin --workspace @laurus/web
 *
 * Reads ADMIN_EMAIL from apps/web/.env.local, generates a temporary
 * password, prints it once, and does nothing if that email already exists.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const email = process.env.ADMIN_EMAIL;
if (!email) {
  console.error("Set ADMIN_EMAIL in apps/web/.env.local first.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = randomBytes(9).toString("base64url");

let userId: string;
let printPassword = true;

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error?.message.includes("already been registered")) {
  // This Supabase project's auth.users is shared with another app (e.g.
  // ecr-onboarding) — reuse the existing account instead of creating one.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  const existing = listError ? undefined : list.users.find((u) => u.email === email);
  if (!existing) {
    console.error("User already registered but could not be found via listUsers:", listError?.message);
    process.exit(1);
  }
  userId = existing.id;
  printPassword = false;
} else if (error || !data.user) {
  console.error("Could not create the auth user:", error?.message);
  process.exit(1);
} else {
  userId = data.user.id;
}

const { error: profileError } = await supabase
  .from("users")
  .upsert({ id: userId, email, full_name: "Admin", role: "admin" });
if (profileError) {
  console.error("Could not upsert the laurus.users profile:", profileError.message);
  process.exit(1);
}

if (printPassword) {
  console.log(`Admin created: ${email}`);
  console.log(`Temporary password: ${password}`);
  console.log("Save it now — it will not be shown again. Change it after first login.");
} else {
  console.log(`Linked existing auth user ${email} (${userId}) as laurus admin.`);
  console.log("Use that account's existing password to log in.");
}
