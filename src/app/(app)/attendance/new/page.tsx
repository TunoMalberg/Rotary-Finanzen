import { prisma } from "@/lib/prisma";
import { getCurrentClubYear } from "@/lib/dataAccess";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NewAttendanceForm } from "./NewAttendanceForm";

export const dynamic = "force-dynamic";

export default async function NewAttendancePage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/attendance");
  const cy = await getCurrentClubYear();
  const members = await prisma.member.findMany({ where: { status: "ACTIVE" }, orderBy: { lastName: "asc" } });
  return (
    <div className="max-w-3xl fade-up">
      <h1 className="text-2xl font-bold mb-6">Neue Teilnahmeliste</h1>
      <NewAttendanceForm
        clubYearId={cy.id}
        clubYearLabel={cy.label}
        members={members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}`, sepa: m.paysBySEPA }))}
      />
    </div>
  );
}