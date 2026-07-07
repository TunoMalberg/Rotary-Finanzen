import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const data = {
    lastName: body.lastName,
    firstName: body.firstName,
    email: body.email || null,
    phone: body.phone || null,
    address: body.address || null,
    city: body.city || null,
    postalCode: body.postalCode || null,
    country: body.country || "Austria",
    paysBySEPA: !!body.paysBySEPA,
    isExempt: !!body.isExempt,
    duesAmount: Number(body.duesAmount) || 0,
    status: body.status || "ACTIVE",
    notes: body.notes || null,
  };
  const m = await prisma.member.update({ where: { id }, data });
  return NextResponse.json(m);
}

/**
 * DELETE /api/members/:id
 *
 *  - Standard (archivieren): setzt das Mitglied auf INACTIVE (+ leftAt). Die
 *    Historie (Forderungen, Buchungen) bleibt für die Buchhaltung erhalten.
 *  - `?hard=1` (endgültig löschen): entfernt den Datensatz wirklich – aber NUR,
 *    wenn keine verknüpften Forderungen, Buchungen, Anwesenheiten oder
 *    Sammelbuchungs-Aufteilungen existieren (z. B. versehentlich angelegtes
 *    Mitglied). Sonst 409 mit Erklärung, damit keine Buchhaltungsdaten
 *    verloren gehen.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!hard) {
    await prisma.member.update({ where: { id }, data: { status: "INACTIVE", leftAt: new Date() } });
    return NextResponse.json({ ok: true, mode: "archived" });
  }

  // Endgültig löschen – nur ohne verknüpfte Daten erlaubt.
  const [invoices, transactions, attendance, allocations] = await Promise.all([
    prisma.invoice.count({ where: { memberId: id } }),
    prisma.transaction.count({ where: { memberId: id } }),
    prisma.attendanceEntry.count({ where: { memberId: id } }),
    prisma.txAllocation.count({ where: { memberId: id } }),
  ]);
  const refs = invoices + transactions + attendance + allocations;
  if (refs > 0) {
    const parts: string[] = [];
    if (invoices) parts.push(`${invoices} Forderung(en)`);
    if (transactions) parts.push(`${transactions} Buchung(en)`);
    if (attendance) parts.push(`${attendance} Anwesenheits-Eintrag/-einträge`);
    if (allocations) parts.push(`${allocations} Sammelbuchungs-Aufteilung(en)`);
    return NextResponse.json(
      {
        error: `Mitglied kann nicht endgültig gelöscht werden, weil verknüpfte Daten existieren: ${parts.join(", ")}. Bitte stattdessen archivieren (auf „Inaktiv" setzen).`,
        refs: { invoices, transactions, attendance, allocations },
      },
      { status: 409 },
    );
  }

  await prisma.member.delete({ where: { id } });
  return NextResponse.json({ ok: true, mode: "deleted" });
}