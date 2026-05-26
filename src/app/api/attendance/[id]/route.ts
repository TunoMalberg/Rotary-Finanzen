import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { ensureAttendanceCategory, syncInvoiceAmount } from "@/lib/attendanceHelpers";

/**
 * PATCH /api/attendance/[id]
 *
 * Header / Default-Felder einer Auslagenliste ändern. Bei Änderung von
 * `billPerHead` werden alle Entries und ihre OPEN-Invoices nachgezogen.
 * Bei Rename des Events wird die zugehörige Auto-Kategorie umbenannt.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: { clubYear: true, entries: true },
  });
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (list.clubYear.lockedAt) {
    return NextResponse.json({ error: "Clubjahr ist fixiert – nicht editierbar" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ungültiger JSON-Body" }, { status: 400 });
  }
  const b = body as {
    eventName?: string;
    eventDate?: string;
    description?: string | null;
    billPerHead?: number | string;
    paymentMethod?: string;
  };

  const data: {
    eventName?: string;
    eventDate?: Date;
    description?: string | null;
    billPerHead?: number;
    paymentMethod?: string;
  } = {};
  if (typeof b.eventName === "string" && b.eventName.trim()) data.eventName = b.eventName.trim();
  if (typeof b.eventDate === "string") data.eventDate = new Date(b.eventDate);
  if (b.description !== undefined) data.description = b.description?.trim() || null;
  if (b.billPerHead !== undefined) {
    const v = Number(typeof b.billPerHead === "string" ? b.billPerHead.replace(",", ".") : b.billPerHead);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: "billPerHead > 0 erforderlich" }, { status: 400 });
    }
    data.billPerHead = v;
  }
  if (typeof b.paymentMethod === "string") {
    if (!["SEPA", "EMAIL_INVOICE", "MIXED"].includes(b.paymentMethod)) {
      return NextResponse.json({ error: "ungültige paymentMethod" }, { status: 400 });
    }
    data.paymentMethod = b.paymentMethod;
  }

  const updated = await prisma.attendanceList.update({ where: { id }, data });

  // Kategorie-Name nachziehen falls Rename.
  if (data.eventName) {
    const catId = await ensureAttendanceCategory({
      clubYearId: list.clubYearId,
      eventName: updated.eventName,
      existingCategoryId: list.categoryId,
    });
    if (catId !== list.categoryId) {
      await prisma.attendanceList.update({ where: { id }, data: { categoryId: catId } });
    }
  }

  // billPerHead-Änderung → Entries + OPEN-Invoices nachziehen.
  if (data.billPerHead !== undefined && data.billPerHead !== list.billPerHead) {
    for (const e of list.entries) {
      const newAmount = round2(data.billPerHead * e.personCount);
      await prisma.attendanceEntry.update({ where: { id: e.id }, data: { amount: newAmount } });
      if (e.invoiceId) await syncInvoiceAmount(e.invoiceId, newAmount);
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/attendance/[id]
 *
 * Löscht die Liste samt Entries (Cascade). Falls Invoices PAID sind, wird
 * mit 409 abgewiesen, weil dann Buchhaltungsspuren betroffen wären.
 * Auto-Kategorie bleibt erhalten, sofern sie schon Buchungen hat – sonst
 * wird sie ebenfalls gelöscht.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const list = await prisma.attendanceList.findUnique({
    where: { id },
    include: {
      clubYear: true,
      entries: { include: { invoice: true } },
      category: { include: { transactions: { take: 1 }, budgetLines: { take: 1 } } },
    },
  });
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (list.clubYear.lockedAt) {
    return NextResponse.json({ error: "Clubjahr fixiert – nicht editierbar" }, { status: 409 });
  }
  const paid = list.entries.find((e) => e.invoice?.status === "PAID");
  if (paid) {
    return NextResponse.json(
      { error: "Liste enthält bereits bezahlte Forderungen und kann nicht mehr gelöscht werden." },
      { status: 409 },
    );
  }

  // 1. Forderungen (Invoices) für diese Liste stornieren.
  for (const e of list.entries) {
    if (e.invoiceId) {
      await prisma.invoice.update({ where: { id: e.invoiceId }, data: { status: "CANCELLED" } });
    }
  }
  // 2. Liste löschen (Cascade auf entries).
  await prisma.attendanceList.delete({ where: { id } });

  // 3. Auto-Kategorie löschen, wenn unbenutzt.
  if (list.category && list.category.transactions.length === 0 && list.category.budgetLines.length === 0) {
    await prisma.category.delete({ where: { id: list.category.id } }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}