import { prisma } from "@/lib/prisma";
import { getCurrentClubYear, getCategoryTotals } from "@/lib/dataAccess";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { BudgetEditor } from "./BudgetEditor";
import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const cy = params.year
    ? (await prisma.clubYear.findUnique({ where: { id: params.year } })) ?? (await getCurrentClubYear())
    : await getCurrentClubYear();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const lines = await prisma.budgetLine.findMany({ where: { clubYearId: cy.id } });
  const totals = await getCategoryTotals(cy.id);

  const data = categories.map((c) => {
    const line = lines.find((l) => l.categoryId === c.id);
    const actual = totals.find((t) => t.id === c.id)?.amount ?? 0;
    return {
      categoryId: c.id,
      categoryName: c.name,
      kind: c.kind,
      color: c.color,
      sortOrder: c.sortOrder,
      budget: line?.amount ?? 0,
      actual,
    };
  });

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="size-6 text-blue-800" /> Budget · Soll/Ist</h1>
          <p className="text-slate-500 text-sm">Clubjahr {cy.label} – während und am Ende des Jahres jederzeit vergleichen.</p>
        </div>
        <a
          href={`/api/clubyears/${cy.id}/export`}
          className="btn-ghost text-sm"
          title="EAR-Excel-Datei für dieses Clubjahr herunterladen"
        >
          Excel-Export
        </a>
      </header>
      <form method="get" className="card-soft p-3 flex gap-3 items-center">
        <label className="text-sm text-slate-600">Clubjahr:</label>
        <select name="year" defaultValue={cy.id} className="input max-w-xs">
          {allYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
        <button className="btn-ghost text-sm">Anzeigen</button>
      </form>
      <BudgetEditor clubYearId={cy.id} canEdit={canEdit} initial={data} allYears={allYears.map((y) => ({ id: y.id, label: y.label }))} />
    </div>
  );
}