import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.code !== undefined) data.code = String(body.code).trim().toUpperCase().replace(/\s+/g, "");
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.color !== undefined) data.color = body.color;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.isClosed !== undefined) data.isClosed = !!body.isClosed;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  // Detach transactions first; do not delete bookings
  await prisma.transaction.updateMany({ where: { projectId: id }, data: { projectId: null } });
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}