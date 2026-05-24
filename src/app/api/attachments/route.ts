import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE = path.join(process.cwd(), "uploads");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "OTHER");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Datei > 20MB" }, { status: 400 });
  await mkdir(STORAGE, { recursive: true });
  const ext = path.extname(file.name) || ".bin";
  const safe = `${randomUUID()}${ext}`;
  const fullPath = path.join(STORAGE, safe);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buf);
  const a = await prisma.attachment.create({
    data: {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storagePath: safe,
      kind,
      uploadedById: session?.user?.id,
    },
  });
  return NextResponse.json({ id: a.id, fileName: a.fileName });
}