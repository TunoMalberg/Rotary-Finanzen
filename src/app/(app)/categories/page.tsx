import { prisma } from "@/lib/prisma";
import { Tags } from "lucide-react";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [years, categories] = await Promise.all([
    prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } }),
    prisma.category.findMany({
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        clubYear: { select: { id: true, label: true } },
        _count: { select: { transactions: true, budgetLines: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5 sm:space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-blue-700">
            Stammdaten
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tags className="size-6 text-blue-800" /> Kategorien
          </h1>
          <p className="text-slate-500 text-sm">
            Globale Kategorien gelten in allen Clubjahren. Jahres-Kategorien (z.
            B. für ein Projekt oder eine einmalige Aktion) werden nur im
            jeweiligen Clubjahr für Buchungen vorgeschlagen.
          </p>
        </div>
      </header>

      <CategoriesClient
        years={years.map((y) => ({ id: y.id, label: y.label }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          color: c.color,
          sortOrder: c.sortOrder,
          isDuesCategory: c.isDuesCategory,
          clubYearId: c.clubYearId,
          clubYearLabel: c.clubYear?.label ?? null,
          txCount: c._count.transactions,
          budgetCount: c._count.budgetLines,
        }))}
      />
    </div>
  );
}
