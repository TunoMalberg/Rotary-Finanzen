import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { checkClubYearMutable } from "@/lib/clubYearLifecycle";

/**
 * PATCH /api/invoices/:id
 *
 * Bearbeitet eine Forderung (z. B. Mitgliedsbeitrag): Betrag, Fälligkeit,
 * Zahlungsmethode und Beschreibung. Das Clubjahr der Forderung darf nicht
 * fixiert sein. Bereits als bezahlt markierte Forderungen können nicht
 * verändert werden (zuerst „Wieder öffnen").
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { clubYear: true } });
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });

  const guard = checkClubYearMutable(invoice.clubYear, {
    role: session?.user?.role,
    allowCorrection: true,
  });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  if (invoice.status === "PAID") {
    return NextResponse.json(
      { error: "Bezahlte Forderung kann nicht bearbeitet werden. Bitte zuerst „Wieder öffnen“." },
      { status: 409 },
    );
  }

  const data: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return NextResponse.json({ error: "Ungültiger Betrag." }, { status: 400 });
    }
    data.amount = amt;
  }
  if (body.dueDate !== undefined) {
    const d = new Date(body.dueDate);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Ungültiges Fälligkeitsdatum." }, { status: 400 });
    data.dueDate = d;
  }
  if (body.paymentMethod !== undefined) {
    const pm = String(body.paymentMethod);
    if (!["SEPA", "EMAIL_INVOICE"].includes(pm)) {
      return NextResponse.json({ error: "Ungültige Zahlungsmethode." }, { status: 400 });
    }
    data.paymentMethod = pm;
  }
  if (body.description !== undefined) data.description = body.description || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben." }, { status: 400 });
  }

  const out = await prisma.invoice.update({ where: { id }, data });
  return NextResponse.json(out);
}

/**
 * DELETE /api/invoices/:id
 *
 *  - Standard (stornieren): setzt die Forderung auf CANCELLED (bleibt sichtbar,
 *    zählt aber nicht mehr als offen).
 *  - `?hard=1` (endgültig löschen): entfernt die Forderung wirklich – nur wenn
 *    sie nicht bezahlt ist und keine Zahlungs-Verknüpfungen/Aufteilungen hat
 *    (z. B. versehentlich generierter Beitrag). Sonst 409.
 *
 * In fixierten Clubjahren nicht möglich.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { clubYear: true } });
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });

  const guard = checkClubYearMutable(invoice.clubYear, {
    role: session?.user?.role,
    allowCorrection: true,
  });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });

  if (!hard) {
    await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true, mode: "cancelled" });
  }

  // Endgültig löschen – nur ohne Zahlungs-/Anwesenheitsverknüpfung.
  const [allocations, attendance] = await Promise.all([
    prisma.txAllocation.count({ where: { invoiceId: id } }),
    prisma.attendanceEntry.count({ where: { invoiceId: id } }),
  ]);
  if (invoice.status === "PAID" || invoice.paidTransactionId || allocations > 0 || attendance > 0) {
    return NextResponse.json(
      {
        error:
          "Forderung ist mit einer Zahlung oder Anwesenheitsliste verknüpft und kann nicht endgültig gelöscht werden. Bitte stattdessen stornieren.",
      },
      { status: 409 },
    );
  }
  // Reminder-Logs zuerst entfernen (FK), dann Invoice.
  await prisma.$transaction([
    prisma.reminderLog.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true, mode: "deleted" });
}