import { prisma } from "@/lib/prisma";
import { getCurrentClubYear } from "@/lib/dataAccess";
import { TxForm } from "../TxForm";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewTxPage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/transactions");
  const cy = await getCurrentClubYear();
  const allYears = await prisma.clubYear.findMany({ orderBy: { startsAt: "desc" } });
  const accounts = await prisma.account.findMany();
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const members = await prisma.member.findMany({ orderBy: { lastName: "asc" } });
  return (
    <div className="max-w-3xl fade-up">
      <h1 className="text-2xl font-bold mb-1">Neue Buchung</h1>
      <p className="text-slate-500 text-sm mb-6">Manuelle Buchung erfassen. Belege können nach dem Speichern angehängt werden.</p>
      <TxForm
        clubYears={allYears.map((y) => ({ id: y.id, label: y.label }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        members={members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
        defaultClubYearId={cy.id}
        defaultAccountId={accounts.find((a) => a.type === "MAIN")?.id ?? accounts[0]?.id}
      />
    </div>
  );
}