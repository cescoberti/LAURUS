import { createClient } from "@/lib/supabase/server";

/**
 * Cap on voting lists produced per user per rolling 24h (the numbers are in
 * lib/limits.ts: 5 for a member, 10 for an admin). It keeps the EP's API from
 * being hammered and it bounds the model spend of the split agents: a list with
 * splits costs real money, a few cents each. Each served VL is logged in
 * laurus.events as 'vl_download'/'vl_generate', which we count here.
 * Enforced server-side in the VL route handlers.
 */
import { DAILY_VL_LIMIT, dailyLimitFor } from "@/lib/limits";

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
  const isAdmin = profile?.role === "admin";
  const limit = dailyLimitFor(isAdmin);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", ["vl_download", "vl_generate"])
    .gte("created_at", since);

  const used = count ?? 0;
  return { allowed: used < limit, used, limit, isAdmin };
}
