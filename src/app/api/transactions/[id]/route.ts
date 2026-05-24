import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
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
  const tx = await prisma.transaction.update({ where: { id }, data });
  return NextResponse.json(tx);
}