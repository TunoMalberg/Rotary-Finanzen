import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { syncInvoiceAmount } from "@/lib/attendanceHelpers";

/**
 * PATCH /api/attendance/[id]/entries/[entryId]
 *
 * Personenzahl, Override-Methode oder manueller Betrag pro Zeile ändern.
 * Wenn schon eine Forderung verknüpft ist, wird der Betrag der Forderung
 * mit gezogen (sofern nicht bereits PAID/CANCELLED).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, entryId } = await params;
  const list = await prisma.attendanceList.findUnique({ where: { id }, include: { clubYear: true } });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });
  if (list.clubYear.lockedAt) return NextResponse.json({ error: "Clubjahr fixiert" }, { status: 409 });
  const entry = await prisma.attendanceEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.listId !== id) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  let body: { personCount?: number; amount?: number | string; paymentOverride?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ungültiger JSON-Body" }, { status: 400 });
  }

  const data: { personCount?: number; amount?: number; paymentOverride?: string | null } = {};
  let nextPersonCount = entry.personCount;
  if (body.personCount !== undefined) {
    const pc = Math.max(1, Math.floor(Number(body.personCount)));
    if (!Number.isFinite(pc) || pc < 1) {
      return NextResponse.json({ error: "personCount >= 1" }, { status: 400 });
    }
    data.personCount = pc;
    nextPersonCount = pc;
    data.amount = round2(list.billPerHead * pc);
  }
  if (body.amount !== undefined) {
    const v = Number(typeof body.amount === "string" ? body.amount.replace(",", ".") : body.amount);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "amount >= 0" }, { status: 400 });
    }
    data.amount = round2(v);
  }
  if (body.paymentOverride !== undefined) {
    if (body.paymentOverride !== null && !["SEPA", "EMAIL_INVOICE"].includes(body.paymentOverride)) {
      return NextResponse.json({ error: "paymentOverride muss SEPA oder EMAIL_INVOICE oder null sein" }, { status: 400 });
    }
    data.paymentOverride = body.paymentOverride;
  }

  const updated = await prisma.attendanceEntry.update({ where: { id: entryId }, data });
  if (entry.invoiceId && data.amount !== undefined) {
    await syncInvoiceAmount(entry.invoiceId, data.amount);
  }
  return NextResponse.json({ ok: true, entry: { id: updated.id, personCount: nextPersonCount, amount: updated.amount } });
}

/**
 * DELETE /api/attendance/[id]/entries/[entryId]
 *
 * Entfernt einen Teilnehmer. Wenn schon eine Forderung verknüpft ist, wird
 * sie storniert (oder mit 409 abgewiesen, falls bereits PAID).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, entryId } = await params;
  const list = await prisma.attendanceList.findUnique({ where: { id }, include: { clubYear: true } });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });
  if (list.clubYear.lockedAt) return NextResponse.json({ error: "Clubjahr fixiert" }, { status: 409 });
  const entry = await prisma.attendanceEntry.findUnique({
    where: { id: entryId },
    include: { invoice: true },
  });
  if (!entry || entry.listId !== id) return NextResponse.json({ error: "entry not found" }, { status: 404 });
  if (entry.invoice?.status === "PAID") {
    return NextResponse.json({ error: "Forderung wurde schon bezahlt – nicht löschbar." }, { status: 409 });
  }
  if (entry.invoiceId) {
    await prisma.invoice.update({ where: { id: entry.invoiceId }, data: { status: "CANCELLED" } });
  }
  await prisma.attendanceEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}