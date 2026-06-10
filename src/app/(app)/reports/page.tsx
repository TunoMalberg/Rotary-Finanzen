import { prisma } from "@/lib/prisma";
import { ReportsView } from "./ReportsView";
import { PieChart } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // Eine groupBy-Query statt N Queries (vorher: 1 + N×Jahr Round-Trips)
  const [allYears, categories, groups] = await Promise.all([
    prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.transaction.groupBy({
      by: ["clubYearId", "categoryId"],
      where: { deletedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const catName = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const yearLabel = new Map<string, string>(allYears.map((y) => [y.id, y.label]));

  // yearLabel -> categoryName -> amount
  const data: Record<string, Record<string, number>> = {};
  for (const y of allYears) data[y.label] = {};
  for (const g of groups) {
    const yl = yearLabel.get(g.clubYearId);
    if (!yl) continue;
    const cn = g.categoryId ? catName.get(g.categoryId) ?? "Ohne Kategorie" : "Ohne Kategorie";
    data[yl][cn] = (data[yl][cn] ?? 0) + (g._sum.amount ?? 0);
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