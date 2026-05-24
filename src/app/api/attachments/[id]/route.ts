import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const { id } = await params;
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fullPath = path.join(process.cwd(), "uploads", a.storagePath);
  const buf = await readFile(fullPath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(a.fileName)}"`,
    },
  });
}