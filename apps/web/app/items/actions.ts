"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Follow / unfollow a file. A follow is one `subscriptions` row per channel
 * (email always; whatsapp too when the member has a number on file), scoped
 * to the item. The live loop announces changes to followers through
 * /api/alerts/vl. RLS ("own subs") keeps this to the signed-in member's rows.
 */
export async function toggleFollowAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const itemId = String(formData.get("itemId") ?? "");
  const code = String(formData.get("code") ?? "");
  const follow = String(formData.get("follow") ?? "") === "1";
  if (!itemId) return;

  if (!follow) {
    await supabase.from("subscriptions").delete().eq("user_id", user.id).eq("scope", "item").eq("target_id", itemId);
  } else {
    const { data: me } = await supabase.from("users").select("whatsapp_phone, wants_whatsapp").eq("id", user.id).maybeSingle();
    const channels = ["email", ...(me?.whatsapp_phone && me.wants_whatsapp ? ["whatsapp"] : [])];
    await supabase.from("subscriptions").upsert(
      channels.map((channel) => ({ user_id: user.id, scope: "item", target_id: itemId, channel })),
      { onConflict: "user_id,scope,target_id,channel" },
    );
  }
  if (code) revalidatePath(`/items/${code}`);
}
