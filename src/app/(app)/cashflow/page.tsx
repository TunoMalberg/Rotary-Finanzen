import { prisma } from "@/lib/prisma";
import { getCurrentClubYear, getAccountBalance } from "@/lib/dataAccess";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { CashflowView } from "./CashflowView";
import { TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const cy = params.year
    ? (await prisma.clubYear.findUnique({ where: { id: params.year } })) ?? (await getCurrentClubYear())
    : await getCurrentClubYear();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });

  const main = await prisma.account.findFirst({ where: { type: "MAIN" } });
  const gg = await prisma.account.findFirst({ where: { type: "GLOBAL_GRANT_TRUST" } });
  const balMain = main ? await getAccountBalance(main.id, cy.id) : 0;
  const balGG = gg ? await getAccountBalance(gg.id, cy.id) : 0;
  const startBalance = balMain + balGG;

  const entries = await prisma.cashflowEntry.findMany({ where: { clubYearId: cy.id }, orderBy: { date: "asc" } });

  return (
    <div className="space-y-5 fade-up">
      <header>
        <h1 className="font-bold flex items-center gap-2"><TrendingUp className="size-6 text-blue-800 shrink-0" /> Liquiditätsplanung</h1>
        <p className="text-slate-500 text-sm">Clubjahr {cy.label} · Aktueller Saldo: <span className="font-bold">{startBalance.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}</span></p>
      </header>
      <form method="get" className="card-soft p-3 flex flex-wrap gap-2 sm:gap-3 items-center">
        <label htmlFor="cy-select" className="text-sm">Clubjahr:</label>
        <select id="cy-select" name="year" defaultValue={cy.id} className="input flex-1 sm:flex-none sm:max-w-xs">
          {allYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
        <button className="btn-ghost text-sm">Anzeigen</button>
      </form>
      <CashflowView
        clubYearId={cy.id}
        entries={entries.map((e) => ({ id: e.id, date: e.date.toISOString(), label: e.label, amount: e.amount, isPlanned: e.isPlanned }))}
        startBalance={startBalance}
        canEdit={canEdit}
      />
    </div>
  );
}