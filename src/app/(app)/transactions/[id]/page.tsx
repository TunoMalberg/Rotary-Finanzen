import { prisma } from "@/lib/prisma";
import { TxForm } from "../TxForm";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { formatEUR } from "@/lib/format";
import { SettleAllocationsButton } from "./SettleAllocationsButton";

export const dynamic = "force-dynamic";

export default async function EditTxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/transactions");
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      attachment: true,
      allocations: {
        include: {
          member: { select: { id: true, lastName: true, firstName: true } },
          invoice: { select: { id: true, reference: true, status: true } },
        },
        orderBy: { partnerName: "asc" },
      },
    },
  });
  if (!tx) notFound();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const accounts = await prisma.account.findMany();
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const members = await prisma.member.findMany({ orderBy: { lastName: "asc" } });
  const projects = await prisma.project.findMany({
    orderBy: [{ isClosed: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  return (
    <div className="max-w-3xl fade-up">
      <h1 className="text-2xl font-bold mb-6">Buchung bearbeiten</h1>
      <TxForm
        clubYears={allYears.map((y) => ({ id: y.id, label: y.label }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        members={members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        initial={{
          id: tx.id,
          clubYearId: tx.clubYearId,
          accountId: tx.accountId,
          date: tx.date.toISOString(),
          counterparty: tx.counterparty,
          purpose: tx.purpose,
          note: tx.note,
          amount: tx.amount,
          categoryId: tx.categoryId,
          memberId: tx.memberId,
          projectId: tx.projectId,
          attachmentId: tx.attachmentId,
        }}
      />

      {tx.allocations.length > 0 && (() => {
        const openInvoiceCount = tx.allocations.filter(
          (a) => a.invoice && a.invoice.status !== "PAID",
        ).length;
        const paidCount = tx.allocations.filter(
          (a) => a.invoice && a.invoice.status === "PAID",
        ).length;
        return (
        <section className="mt-8 card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Aufteilung (SEPA-Sammeleinzug)
              </h2>
              <p className="text-xs text-slate-500">
                {tx.allocations.length} Anteile · Summe{" "}
                {formatEUR(tx.allocations.reduce((a, x) => a + x.amount, 0))}
                {openInvoiceCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700 font-semibold">
                      {openInvoiceCount} Forderung(en) noch offen
                    </span>
                  </>
                )}
                {paidCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-emerald-700 font-semibold">
                      {paidCount} beglichen
                    </span>
                  </>
                )}
              </p>
            </div>
            {isTreasurer(session?.user?.role) && (
              <SettleAllocationsButton
                transactionId={tx.id}
                openCount={openInvoiceCount}
              />
            )}
          </div>
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll max-h-[480px]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Mitglied</th>
                    <th>Forderung</th>
                    <th>IBAN</th>
                    <th className="text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.allocations.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Partner" className="font-medium">
                        {a.partnerName ?? "—"}
                      </td>
                      <td data-label="Mitglied">
                        {a.member ? `${a.member.firstName} ${a.member.lastName}` : "—"}
                      </td>
                      <td data-label="Forderung" className="text-xs">
                        {a.invoice ? (
                          <>
                            <code>{a.invoice.reference}</code>{" "}
                            <span className="text-slate-500">
                              ({a.invoice.status})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="IBAN" className="font-mono text-xs text-slate-500">
                        {a.partnerIban ?? "—"}
                      </td>
                      <td
                        data-label="Betrag"
                        className="text-right font-mono tabular amount-pos"
                      >
                        {formatEUR(a.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        );
      })()}
    </div>
  );
}