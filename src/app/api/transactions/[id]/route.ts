import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { checkClubYearMutable } from "@/lib/clubYearLifecycle";

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
  if (body.date) data.date = new Date(body.date);
  if (body.counterparty !== undefined) data.counterparty = body.counterparty;
  if (body.purpose !== undefined) data.purpose = body.purpose;
  if (body.note !== undefined) data.note = body.note;
  if (body.amount !== undefined) data.amount = Number(body.amount);
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.memberId !== undefined) data.memberId = body.memberId || null;
  if (body.projectId !== undefined) data.projectId = body.projectId || null;
  if (body.attachmentId !== undefined) data.attachmentId = body.attachmentId || null;
  const out = await prisma.transaction.update({ where: { id }, data });
  return NextResponse.json(out);
}