import { prisma } from "@/lib/prisma";
import { getCurrentClubYear } from "@/lib/dataAccess";
import { formatDate, formatEUR } from "@/lib/format";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { Mail, AlertCircle } from "lucide-react";
import Link from "next/link";
import { DuesActions } from "./DuesActions";

export const dynamic = "force-dynamic";

export default async function DuesPage({ searchParams }: { searchParams: Promise<{ year?: string; status?: string; method?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const cy = params.year
    ? (await prisma.clubYear.findUnique({ where: { id: params.year } })) ?? (await getCurrentClubYear())
    : await getCurrentClubYear();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });

  const where: { clubYearId: string; type: string; status?: string | { in: string[] }; paymentMethod?: string } = {
    clubYearId: cy.id,
    type: "DUES",
  };
  if (params.status === "open") where.status = { in: ["OPEN", "REMINDED"] };
  else if (params.status === "paid") where.status = "PAID";
  else if (params.status) where.status = params.status.toUpperCase();
  if (params.method === "sepa") where.paymentMethod = "SEPA";
  else if (params.method === "invoice") where.paymentMethod = "EMAIL_INVOICE";

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { member: true, paidTransaction: true },
  });

  const total = await prisma.invoice.aggregate({ where: { clubYearId: cy.id, type: "DUES" }, _sum: { amount: true } });
  const open = await prisma.invoice.aggregate({ where: { clubYearId: cy.id, type: "DUES", status: { in: ["OPEN", "REMINDED"] } }, _sum: { amount: true }, _count: true });
  const paid = await prisma.invoice.aggregate({ where: { clubYearId: cy.id, type: "DUES", status: "PAID" }, _sum: { amount: true }, _count: true });
  const overdue = await prisma.invoice.count({ where: { clubYearId: cy.id, type: "DUES", status: { in: ["OPEN", "REMINDED"] }, dueDate: { lt: new Date() } } });

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="size-6 text-blue-800" /> Mitgliedsbeiträge & Mahnwesen
          </h1>
          <p className="text-slate-500 text-sm">Clubjahr {cy.label}</p>
        </div>
        {canEdit && <DuesActions clubYearId={cy.id} />}
      </header>

      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Forderungen gesamt" value={formatEUR(total._sum.amount ?? 0)} accent="blue" />
        <Stat label="Offen" value={`${open._count} · ${formatEUR(open._sum.amount ?? 0)}`} accent="gold" />
        <Stat label="Bezahlt" value={`${paid._count} · ${formatEUR(paid._sum.amount ?? 0)}`} accent="green" />
        <Stat label="Überfällig" value={overdue.toString()} accent="red" />
      </div>

      <form method="get" className="card-soft p-4 grid sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs font-semibold mb-1 block">Clubjahr</label>
          <select name="year" defaultValue={cy.id} className="input">
            {allYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">Status</label>
          <select name="status" defaultValue={params.status ?? ""} className="input">
            <option value="">Alle</option>
            <option value="open">Offen + Gemahnt</option>
            <option value="paid">Bezahlt</option>
            <option value="cancelled">Storniert</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">Methode</label>
          <select name="method" defaultValue={params.method ?? ""} className="input">
            <option value="">Alle</option>
            <option value="sepa">EZ (SEPA)</option>
            <option value="invoice">E-Mail-Rechnung</option>
          </select>
        </div>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mitglied</th>
                <th>Methode</th>
                <th>Referenz</th>
                <th>Fällig</th>
                <th>Status</th>
                <th>Mahnstufe</th>
                <th className="text-right">Betrag</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const overdue = (i.status === "OPEN" || i.status === "REMINDED") && i.dueDate < new Date();
                return (
                  <tr key={i.id} className={overdue ? "danger" : ""}>
                    <td className="font-medium">
                      <Link href={`/members/${i.memberId}`} className="hover:text-blue-700">{i.member.lastName}, {i.member.firstName}</Link>
                      {i.member.email && <div className="text-xs text-slate-500">{i.member.email}</div>}
                    </td>
                    <td><span className={`chip ${i.paymentMethod === "SEPA" ? "chip-sepa" : "chip-invoice"}`}>{i.paymentMethod === "SEPA" ? "EZ" : "Rechnung"}</span></td>
                    <td className="font-mono text-xs">{i.reference}</td>
                    <td>{formatDate(i.dueDate)}{overdue && <AlertCircle className="size-3.5 inline text-rose-600 ml-1" />}</td>
                    <td><span className={`chip chip-${i.status.toLowerCase()}`}>{statusDe(i.status)}</span></td>
                    <td className="text-center">{i.reminderLevel > 0 ? <span className="font-mono">M{i.reminderLevel}</span> : "—"}</td>
                    <td className="text-right tabular font-mono">{formatEUR(i.amount)}</td>
                    {canEdit && (
                      <td className="text-right">
                        <DuesRowActions invoice={{ id: i.id, status: i.status, memberEmail: i.member.email, memberName: `${i.member.firstName} ${i.member.lastName}`, amount: i.amount, reference: i.reference, dueDate: i.dueDate.toISOString(), reminderLevel: i.reminderLevel, paymentMethod: i.paymentMethod }} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="text-center text-slate-500 py-12">Keine Forderungen für diese Auswahl.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { DuesRowActions } from "./DuesRowActions";

function Stat({ label, value, accent }: { label: string; value: string; accent: "blue" | "gold" | "green" | "red" }) {
  const grad = {
    blue: "linear-gradient(90deg,#17458F,#0099CC)",
    gold: "linear-gradient(90deg,#F7A81B,#D45F00)",
    green: "linear-gradient(90deg,#047857,#10b981)",
    red: "linear-gradient(90deg,#b91c1c,#ef4444)",
  }[accent];
  return (
    <div className="card-soft overflow-hidden">
      <div style={{ height: 4, background: grad }} />
      <div className="p-4">
        <div className="text-xs uppercase text-slate-500 tracking-wider">{label}</div>
        <div className="text-xl font-bold mt-1 tabular">{value}</div>
      </div>
    </div>
  );
}

function statusDe(s: string) {
  switch (s) {
    case "OPEN": return "Offen";
    case "PAID": return "Bezahlt";
    case "REMINDED": return "Gemahnt";
    case "CANCELLED": return "Storniert";
    default: return s;
  }
}