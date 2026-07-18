import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnnotatedVl } from "@/lib/annotatedVl";
import { buildVlFromAmendments, type DbAmendment } from "@/lib/annotatedVl/fromDb";
import { renderAnnotatedVlDocx } from "@/lib/annotatedVlDocx";
import { logEvent } from "@/lib/track";

/**
 * Download the annotated voting list for an item as a .docx.
 *   GET /api/annotated-vl?code=A10-0170/2026
 *
 * The list is built from the plenary amendments ingested from the EP site
 * (Remarks pre-filled with the published IT text, EN fallback). For items
 * without ingested amendments, a statically registered list (e.g. the STREIT
 * ground-truth capture) is served instead. Requires an authenticated advisor.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  let vl = null;
  const { data: item } = await supabase
    .from("items")
    .select("id, code, title, rapporteur, committee")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (item) {
    const { data: amRows } = await supabase
      .from("amendments")
      .select("number, language, target, tabled_by, original_text, amended_text, kind")
      .eq("item_id", item.id)
      .in("language", ["it", "en"])
      .order("number");
    if (amRows && amRows.length > 0) {
      vl = buildVlFromAmendments(item, amRows as DbAmendment[]);
    }
  }
  vl ??= getAnnotatedVl(code);
  if (!vl) return NextResponse.json({ error: "no amendments ingested for this item yet" }, { status: 404 });

  const buffer = await renderAnnotatedVlDocx(vl);
  const filename = `annotated-vl-${(vl.rapporteur ?? code).replace(/[^A-Za-z0-9]+/g, "-")}.docx`;
  void logEvent("vl_download", { userId: user.id, itemCode: code });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
