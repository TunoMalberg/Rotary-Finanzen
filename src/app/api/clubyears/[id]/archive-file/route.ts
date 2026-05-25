import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * GET /api/clubyears/:id/archive-file
 * Liefert die beim Lock-Vorgang erzeugte EAR-Datei (Archiv).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const archived = await prisma.archivedYear.findUnique({
    where: { clubYearId: id },
    include: { clubYear: { select: { label: true } } },
  });
  if (!archived?.fileName) return NextResponse.json({ error: "kein Archiv vorhanden" }, { status: 404 });
  const fullPath = path.join(process.cwd(), "uploads", archived.fileName);
  const buf = await fs.readFile(fullPath);
  const display = path.basename(archived.fileName);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${display}"`,
      "Cache-Control": "no-store",
    },
  });
}