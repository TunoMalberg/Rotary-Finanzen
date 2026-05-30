import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, canRead } from "@/lib/auth";
import { fetchBlob } from "@/lib/blobStorage";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/attachments/:id
 *
 * Streamt den Beleg-Inhalt (PDF/Bild/.eml) an eingeloggte Nutzer.
 * Unterstützt drei Storage-Welten:
 *  1) Vercel-Blob-URL (`https://…blob.vercel-storage.com/…`)
 *  2) Local-Dev-Pseudo-URL (`local://…`) – fetchBlob übernimmt das.
 *  3) Legacy: alter relativer Pfad in `<project>/uploads/<…>` (vor Blob-Migration).
 *
 * `?download=1` erzwingt Content-Disposition=attachment.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!canRead(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const forceDownload = url.searchParams.get("download") === "1";

  let buf: Buffer;
  if (
    att.storagePath.startsWith("http://") ||
    att.storagePath.startsWith("https://") ||
    att.storagePath.startsWith("local://")
  ) {
    buf = await fetchBlob(att.storagePath);
  } else {
    // Legacy: relativer Pfad in `uploads/`
    const fullPath = path.join(process.cwd(), "uploads", att.storagePath);
    buf = await readFile(fullPath);
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${
        att.fileName.replace(/"/g, "")
      }"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}