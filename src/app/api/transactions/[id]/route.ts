import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { checkClubYearMutable, ensureClubYearForDate } from "@/lib/clubYearLifecycle";

async function loadTxAndYear(id: string) {
  const tx = await prisma.transaction.findUnique({ where: { id }, include: { clubYear: true } });
  return tx;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const url = new URL(req.url);
  const allowCorrection = url.searchParams.get("correction") === "1";
  const tx = await loadTxAndYear(id);
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guard = checkClubYearMutable(tx.clubYear, { role: session?.user?.role, allowCorrection });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const tx = await loadTxAndYear(id);
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guard = checkClubYearMutable(tx.clubYear, { role: session?.user?.role, allowCorrection: !!body.allowCorrection });
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 409 });
  const data: Record<string, unknown> = {};
  const newDate = body.date ? new Date(body.date) : null;
  if (newDate) data.date = newDate;
  if (body.counterparty !== undefined) data.counterparty = body.counterparty;
  if (body.purpose !== undefined) data.purpose = body.purpose;
  if (body.note !== undefined) data.note = body.note;
  if (body.amount !== undefined) data.amount = Number(body.amount);
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.memberId !== undefined) data.memberId = body.memberId || null;
  if (body.projectId !== undefined) data.projectId = body.projectId || null;
  if (body.attachmentId !== undefined) data.attachmentId = body.attachmentId || null;

  // Clubjahr-Zuordnung: explizit gewähltes Jahr hat Vorrang, sonst folgt das
  // Jahr automatisch dem (neuen) Buchungsdatum – so landen Buchungen immer im
  // korrekten rotarischen Jahr (1.7.–30.6.).
  let targetYearId: string | null = null;
  if (body.clubYearId) {
    const chosen = await prisma.clubYear.findUnique({ where: { id: body.clubYearId } });
    if (!chosen) return NextResponse.json({ error: "Clubjahr nicht gefunden" }, { status: 400 });
    targetYearId = chosen.id;
  } else if (newDate) {
    const resolved = await ensureClubYearForDate(newDate);
    targetYearId = resolved.id;
  }

  if (targetYearId && targetYearId !== tx.clubYearId) {
    // In das Zieljahr darf gebucht werden?
    const target = await prisma.clubYear.findUnique({ where: { id: targetYearId } });
    if (!target) return NextResponse.json({ error: "Clubjahr nicht gefunden" }, { status: 400 });
    const targetGuard = checkClubYearMutable(target, {
      role: session?.user?.role,
      allowCorrection: !!body.allowCorrection,
    });
    if (!targetGuard.ok) return NextResponse.json({ error: targetGuard.reason }, { status: 409 });
    data.clubYearId = targetYearId;
  }

  const out = await prisma.transaction.update({ where: { id }, data });
  return NextResponse.json(out);
}