import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. Only import from Server Actions /
 * route handlers that already checked the caller is an admin. Never expose
 * to a Client Component or the Edge middleware.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "laurus" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
