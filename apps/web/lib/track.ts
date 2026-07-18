import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Log a usage event for the admin tracker. Uses the service-role client so
 * logging works from API routes regardless of RLS; never throws — tracking
 * must not break the feature being tracked.
 */
export async function logEvent(
  type: string,
  opts: { userId?: string | null; itemCode?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("events").insert({
      type,
      user_id: opts.userId ?? null,
      item_code: opts.itemCode ?? null,
      meta: opts.meta ?? {},
    });
  } catch {
    // tracking is best-effort
  }
}
