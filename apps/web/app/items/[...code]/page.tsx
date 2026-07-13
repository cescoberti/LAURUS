import { TopNav } from "@/components/TopNav";
import { AnnotatedVlTab } from "@/components/AnnotatedVlTab";
import { JUNE_2026 } from "@/lib/seed";

export function generateStaticParams() {
  return JUNE_2026.days.flatMap((d) => d.items).map((i) => ({ code: i.code.split("/") }));
}

export default async function ItemDetail({ params }: { params: Promise<{ code: string[] }> }) {
  const { code: codeSegments } = await params;
  const code = codeSegments.join("/");
  const item = JUNE_2026.days.flatMap((d) => d.items).find((i) => i.code === code);

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <p className="font-mono text-sm text-laurel-700">{code}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">
            {item?.title ?? "Item not found"}
          </h1>
          {item?.rapporteur && <p className="mt-1 text-sm text-ink-500">{item.rapporteur}</p>}
        </div>

        <AnnotatedVlTab />
      </main>
    </div>
  );
}
