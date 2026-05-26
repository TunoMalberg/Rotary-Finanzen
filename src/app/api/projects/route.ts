import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { ensureProjectCategory } from "@/lib/projectCategory";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: [{ isClosed: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.code || !body.name)
    return NextResponse.json({ error: "code and name required" }, { status: 400 });

  const code: string = String(body.code).trim().toUpperCase().replace(/\s+/g, "");
  const exists = await prisma.project.findUnique({ where: { code } });
  if (exists) return NextResponse.json({ error: "code already exists" }, { status: 409 });

  const project = await prisma.$transaction(async (db) => {
    const created = await db.project.create({
      data: {
        code,
        name: String(body.name).trim(),
        description: body.description?.trim() || null,
        color: body.color || "#7B2D8E",
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      },
    });
    await ensureProjectCategory(db, {
      projectId: created.id,
      name: created.name,
      color: created.color,
    });
    return db.project.findUnique({
      where: { id: created.id },
      include: { category: true },
    });
  });
  return NextResponse.json(project);
}