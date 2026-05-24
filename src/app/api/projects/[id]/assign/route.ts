import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";

/** Bulk-assign or unassign transactions to/from a project.
 *  Body: { transactionIds: string[], unassign?: boolean }
 *  When :id == "none" (and unassign==true), all listed transactions are detached.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { transactionIds, unassign } = await req.json();
  if (!Array.isArray(transactionIds) || transactionIds.length === 0)
    return NextResponse.json({ error: "no transactionIds" }, { status: 400 });

  if (unassign || id === "none") {
    const r = await prisma.transaction.updateMany({
      where: { id: { in: transactionIds } },
      data: { projectId: null },
    });
    return NextResponse.json({ updated: r.count, projectId: null });
  }
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const r = await prisma.transaction.updateMany({
    where: { id: { in: transactionIds } },
    data: { projectId: id },
  });
  return NextResponse.json({ updated: r.count, projectId: id });
}