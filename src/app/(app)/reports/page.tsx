import { prisma } from "@/lib/prisma";
import { ReportsView } from "./ReportsView";
import { PieChart } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  // Aggregate per year & category
  const data: Record<string, Record<string, number>> = {}; // yearLabel -> categoryName -> amount
  for (const y of allYears) {
    const txs = await prisma.transaction.findMany({
      where: { clubYearId: y.id, deletedAt: null },
      select: { amount: true, category: { select: { name: true, kind: true, color: true } } },
    });
    const map: Record<string, number> = {};
    for (const t of txs) {
      const name = t.category?.name ?? "Ohne Kategorie";
      map[name] = (map[name] ?? 0) + t.amount;
    }
    data[y.label] = map;
  }

  return (
    <div className="space-y-5 fade-up">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><PieChart className="size-6 text-blue-800" /> Vergleichscharts</h1>
        <p className="text-slate-500 text-sm">Einnahmen- und Ausgabenkategorien über mehrere Clubjahre vergleichen</p>
      </header>
      <ReportsView
        years={allYears.map((y) => ({ id: y.id, label: y.label }))}
        categories={categories.map((c) => ({ name: c.name, kind: c.kind, color: c.color, sortOrder: c.sortOrder }))}
        data={data}
      />
    </div>
  );
}