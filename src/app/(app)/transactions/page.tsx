import { prisma } from "@/lib/prisma";
import { getAccountBalancesBatch, getCurrentClubYear } from "@/lib/dataAccess";
import { computeRunningBalances } from "@/lib/runningBalance";
import { formatDate, formatEUR } from "@/lib/format";
import { TransactionsTable } from "./TransactionsTable";
import Link from "next/link";
import { Receipt, Plus, Wallet } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ account?: string; q?: string; year?: string; cat?: string }> }) {
  const [params, session] = await Promise.all([searchParams, getServerSession(authOptions)]);
  const isTreasurer = session?.user?.role === "treasurer" || session?.user?.role === "admin";
  const cy = params.year
    ? (await prisma.clubYear.findUnique({ where: { id: params.year } })) ?? (await getCurrentClubYear())
    : await getCurrentClubYear();

  // Alle Lookups parallel
  const [allYears, accounts, categories, members] = await Promise.all([
    prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } }),
    prisma.account.findMany(),
    prisma.category.findMany({
      where: { OR: [{ clubYearId: null }, { clubYearId: cy.id }] },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.member.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, lastName: true, firstName: true },
    }),
  ]);
  const accountFilter =
    params.account === "main" ? accounts.find((a) => a.type === "MAIN")
    : params.account === "gg" ? accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST")
    : null;

  // Suche: Gegenpartei, Verwendungszweck, Notiz, Code,
  //        verknüpftes Mitglied (Vor-/Nachname/E-Mail) sowie
  //        partnerName/IBAN aus Sammelbuchungs-Aufteilungen
  //        und Member-Namen in Allocations.
  // Alle Treffer case-insensitive (Postgres ILIKE).
  type Q = { contains: string; mode: "insensitive" };
  const q = params.q?.trim();
  const ic = (s: string): Q => ({ contains: s, mode: "insensitive" });

  type WhereT = {
    clubYearId: string;
    deletedAt: null;
    accountId?: string;
    categoryId?: string;
    OR?: Array<Record<string, unknown>>;
  };
  const where: WhereT = {
    clubYearId: cy.id,
    deletedAt: null,
  };
  if (accountFilter) where.accountId = accountFilter.id;
  if (params.cat && params.cat !== "all") where.categoryId = params.cat;
  if (q) {
    where.OR = [
      { counterparty: ic(q) },
      { purpose: ic(q) },
      { note: ic(q) },
      { code: ic(q) },
      // direkt verknüpftes Mitglied
      { member: { firstName: ic(q) } },
      { member: { lastName: ic(q) } },
      { member: { email: ic(q) } },
      // SEPA-/Sammelbuchungs-Aufteilungen
      { allocations: { some: { partnerName: ic(q) } } },
      { allocations: { some: { partnerIban: ic(q) } } },
      { allocations: { some: { member: { firstName: ic(q) } } } },
      { allocations: { some: { member: { lastName: ic(q) } } } },
    ];
  }

  // Hauptabfrage + aktuelle Salden parallel (Salden via groupBy in 1 Query)
  const [txs, balanceForHeader] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        category: true,
        account: true,
        member: true,
        attachment: true,
        allocations: {
          include: {
            member: { select: { firstName: true, lastName: true } },
            invoice: { select: { reference: true, status: true } },
          },
          orderBy: { partnerName: "asc" },
        },
      },
      take: 500,
    }),
    getAccountBalancesBatch({
      clubYear: cy,
      accounts: accounts.map((a) => ({ id: a.id, type: a.type as "MAIN" | "GLOBAL_GRANT_TRUST" })),
    }),
  ]);

  const totalIn = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  // Laufender Saldo je Buchung (über das gesamte Clubjahr, unabhängig vom Filter)
  const accountIdsInView = [...new Set(txs.map((t) => t.accountId))];
  const balanceMap = await computeRunningBalances({
    accountIds: accountIdsInView,
    clubYearIds: [cy.id],
  });

  const mainAcc = accounts.find((a) => a.type === "MAIN");
  const ggAcc = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST");
  const currentBalMain = mainAcc ? balanceForHeader.get(mainAcc.id) ?? 0 : 0;
  const currentBalGG = ggAcc ? balanceForHeader.get(ggAcc.id) ?? 0 : 0;

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-bold flex items-center gap-2">
            <Receipt className="size-6 text-blue-800 shrink-0" /> Buchungen
          </h1>
          <p className="text-slate-500 text-sm">Clubjahr {cy.label} · {txs.length} Buchungen geladen</p>
        </div>
        <div className="flex items-center gap-2 btn-row w-full sm:w-auto">
          {isTreasurer && (
            <Link href="/transactions/new" className="btn-primary">
              <Plus className="size-4" /> Neue Buchung
            </Link>
          )}
        </div>
      </header>

      {/* Aktuelle Kontostände im aktiven Clubjahr */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/transactions?account=main" className="card-soft p-4 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Hauptkonto · Saldo</div>
            <div className="text-2xl font-bold tabular mt-0.5">{formatEUR(currentBalMain)}</div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">{mainAcc?.iban ?? ""}</div>
          </div>
          <Wallet className="text-blue-700 size-7 shrink-0" />
        </Link>
        <Link href="/transactions?account=gg" className="card-soft p-4 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Global-Grant Treuhand · Saldo</div>
            <div className="text-2xl font-bold tabular mt-0.5">{formatEUR(currentBalGG)}</div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">{ggAcc?.iban ?? ""}</div>
          </div>
          <Wallet className="text-amber-600 size-7 shrink-0" />
        </Link>
      </div>

      {/* Filters */}
      <form method="get" className="card-soft p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Clubjahr</label>
          <select name="year" defaultValue={cy.id} className="input">
            {allYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Konto</label>
          <select name="account" defaultValue={params.account ?? ""} className="input">
            <option value="">Alle</option>
            <option value="main">Hauptkonto</option>
            <option value="gg">Global Grant Treuhand</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Kategorie</label>
          <select name="cat" defaultValue={params.cat ?? "all"} className="input">
            <option value="all">Alle</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Suche</label>
          <input type="text" name="q" defaultValue={params.q ?? ""} className="input" placeholder="Gegenpartei, Verwendungszweck, Mitglied …" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:col-span-2 lg:col-span-5">
          <div className="flex gap-2 flex-wrap btn-row">
            <button type="submit" className="btn-primary">Filter anwenden</button>
            <Link href="/transactions" className="btn-ghost">Zurücksetzen</Link>
          </div>
          <div className="sm:flex-1" />
          <div className="text-left sm:text-right text-sm grid grid-cols-2 sm:flex sm:flex-col gap-x-3 gap-y-0.5">
            <div>Einnahmen: <span className="amount-pos font-semibold">{formatEUR(totalIn)}</span></div>
            <div>Ausgaben: <span className="amount-neg font-semibold">{formatEUR(totalOut)}</span></div>
            <div className="col-span-2">Saldo: <span className="font-bold">{formatEUR(totalIn + totalOut)}</span></div>
          </div>
        </div>
      </form>

      {/* Table */}
      <TransactionsTable
        transactions={txs.map((t) => ({
          id: t.id,
          date: t.date.toISOString(),
          accountType: t.account.type,
          accountName: t.account.name,
          counterparty: t.counterparty,
          purpose: t.purpose,
          code: t.code,
          amount: t.amount,
          source: t.source,
          categoryId: t.categoryId,
          category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color } : null,
          memberId: t.memberId,
          memberName: t.member ? `${t.member.lastName}, ${t.member.firstName}` : null,
          attachmentName: t.attachment?.fileName ?? null,
          attachmentId: t.attachment?.id ?? null,
          balanceAfter: balanceMap.get(t.id) ?? null,
          allocations: t.allocations.map((a) => ({
            id: a.id,
            partnerName: a.partnerName,
            partnerIban: a.partnerIban,
            memberName: a.member ? `${a.member.lastName}, ${a.member.firstName}` : null,
            invoiceRef: a.invoice?.reference ?? null,
            invoiceStatus: a.invoice?.status ?? null,
            amount: a.amount,
          })),
        }))}
        canEdit={isTreasurer}
        // Inline-Edit nur im laufenden, nicht fixierten Clubjahr
        inlineEditable={isTreasurer && !cy.lockedAt}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind }))}
        members={members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
      />
    </div>
  );
}