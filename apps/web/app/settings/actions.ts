"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EU_LANGUAGE_CODES, DEFAULT_LANGUAGES } from "@/lib/languages";

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const rawPhone = String(formData.get("whatsapp_phone") ?? "").trim();
  // Normalise to E.164-ish: keep leading + and digits only.
  const phone = rawPhone ? "+" + rawPhone.replace(/[^\d]/g, "") : null;

  // Working languages: only valid EU codes; never empty (fallback IT+EN).
  const langs = formData
    .getAll("languages")
    .map(String)
    .filter((l) => EU_LANGUAGE_CODES.has(l));

  await supabase
    .from("users")
    .update({
      whatsapp_phone: phone,
      wants_email: formData.get("wants_email") === "on",
      wants_whatsapp: formData.get("wants_whatsapp") === "on",
      wants_clean_final: formData.get("wants_clean_final") === "on",
      languages: langs.length ? langs : DEFAULT_LANGUAGES,
    })
    .eq("id", user.id);

  revalidatePath("/settings");
}
