import type { RemarksStyle } from "@laurus/parser";
import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type LaurusClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/**
 * How this member wants an amendment quoted in the Remarks column.
 *
 * The default is the EP's own two columns, copied one under the other. The
 * merged diff LAURUS used to build is still there for whoever prefers it.
 *
 * Asked on its own, never folded into another select: on a database that has
 * not run migration 0019 the column does not exist, and that must cost the
 * member their preference, not the voting list.
 */
export async function remarksStyleFor(supabase: LaurusClient, userId: string): Promise<RemarksStyle> {
  const { data } = await supabase.from("users").select("vl_remarks_style").eq("id", userId).maybeSingle();
  return (data as { vl_remarks_style?: string | null } | null)?.vl_remarks_style === "diff" ? "diff" : "columns";
}
