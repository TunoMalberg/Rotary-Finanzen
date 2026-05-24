import { prisma } from "@/lib/prisma";
import { TxForm } from "../TxForm";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditTxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/transactions");
  const tx = await prisma.transaction.findUnique({ where: { id }, include: { attachment: true } });
  if (!tx) notFound();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const accounts = await prisma.account.findMany();
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const members = await prisma.member.findMany({ orderBy: { lastName: "asc" } });

  return (
    <div className="max-w-3xl fade-up">
      <h1 className="text-2xl font-bold mb-6">Buchung bearbeiten</h1>
      <TxForm
        clubYears={allYears.map((y) => ({ id: y.id, label: y.label }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        members={members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
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
          attachmentId: tx.attachmentId,
        }}
      />
    </div>
  );
}