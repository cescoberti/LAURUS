import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIndicativeVotingList } from "@laurus/parser/voting-list-docx";
import { fillRemarks, type AmendmentText } from "@/lib/fillRemarks";
import { renderAnnotatedVlDocx } from "@/lib/annotatedVlDocx";

export const runtime = "nodejs"; // mammoth + docx need Node, not edge

/**
 * The annotated-VL service: POST the Tabling Service "indicative voting list"
 * DOCX, get it back with the Remarks column filled from the published
 * amendments (Italian first, English fallback) already ingested in Supabase.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("vl");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file field 'vl'" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "file too large" }, { status: 413 });

  let vl;
  try {
    vl = await parseIndicativeVotingList(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "could not parse the DOCX as an indicative voting list" }, { status: 422 });
  }
  if (!vl.reportCode || vl.rows.length === 0) {
    return NextResponse.json(
      { error: "no report code / vote rows found — is this a Tabling Service voting list?" },
      { status: 422 },
    );
  }

  // Amendments for this report, Italian text first, English as fallback.
  const { data: item } = await supabase
    .from("items")
    .select("id, code")
    .eq("code", vl.reportCode)
    .limit(1)
    .maybeSingle();
  const amendments = new Map<number, AmendmentText>();
  if (item) {
    const { data: amRows } = await supabase
      .from("amendments")
      .select("number, language, amended_text, original_text, kind")
      .eq("item_id", item.id)
      .in("language", ["it", "en"])
      .order("number");
    for (const lang of ["en", "it"]) {
      // insert EN first, then IT overwrites → IT wins when both exist
      for (const r of amRows ?? []) {
        if (r.language !== lang) continue;
        amendments.set(r.number, {
          number: r.number,
          amendedText: r.amended_text ?? undefined,
          originalText: r.original_text ?? undefined,
          kind: r.kind,
        });
      }
    }
  }

  const { vl: filledVl, report } = fillRemarks(vl, amendments);
  const buffer = await renderAnnotatedVlDocx(filledVl);
  const filename = `annotated-vl-${(vl.rapporteur ?? vl.reportCode).replace(/[^A-Za-z0-9]+/g, "-")}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      // Summary for the UI (also readable in the browser devtools).
      "X-Laurus-Filled": String(report.filled),
      "X-Laurus-Candidates": String(report.candidates),
      "X-Laurus-Anomalies": String(report.anomalies.length),
      "X-Laurus-Item-Found": item ? "1" : "0",
    },
  });
}
