import { createClient } from "@/lib/supabase/server";

/**
 * Cap on voting lists produced per user per rolling 24h (the number is in
 * lib/limits.ts). It keeps the EP's API from being hammered and it bounds the
 * model spend of the split agents: a list with splits costs real money, a few
 * cents each. Each served VL is logged in laurus.events as
 * 'vl_download'/'vl_generate', which we count here. Admins are exempt.
 * Enforced server-side in the VL route handlers.
 */
import { DAILY_VL_LIMIT } from "@/lib/limits";

export { DAILY_VL_LIMIT };

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  isAdmin: boolean;
}

export async function checkVlRateLimit(userId: string): Promise<RateLimitResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase.from("users").select("role").eq("id", userId).single();
  if (profile?.role === "admin") {
    return { allowed: true, used: 0, limit: DAILY_VL_LIMIT, isAdmin: true };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", ["vl_download", "vl_generate"])
    .gte("created_at", since);

  const used = count ?? 0;
  return { allowed: used < DAILY_VL_LIMIT, used, limit: DAILY_VL_LIMIT, isAdmin: false };
}
