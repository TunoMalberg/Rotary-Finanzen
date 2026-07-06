import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBlob } from "@/lib/blobStorage";
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

  // Anzeigename bevorzugt aus dem Snapshot (summaryJson.archiveFileName),
  // damit auch bei Blob-URLs ein sprechender Dateiname erhalten bleibt.
  let display = path.basename(archived.fileName);
  try {
    const meta = archived.summaryJson ? JSON.parse(archived.summaryJson) : null;
    if (meta?.archiveFileName) display = String(meta.archiveFileName);
  } catch {
    /* ignore */
  }

  // Neue Archive liegen als Blob (URL bzw. local://…) vor → fetchBlob.
  // Legacy-Archive mit relativem fs-Pfad (z. B. "archive/…") werden noch
  // best-effort aus dem lokalen uploads-Ordner gelesen.
  const fn = archived.fileName;
  let buf: Uint8Array;
  if (fn.startsWith("http") || fn.startsWith("local://")) {
    buf = await fetchBlob(fn);
  } else {
    try {
      buf = await fs.readFile(path.join(process.cwd(), "uploads", fn));
    } catch {
      return NextResponse.json(
        { error: "Archiv-Datei nicht mehr verfügbar. Bitte Jahr erneut fixieren/archivieren." },
        { status: 404 },
      );
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${display}"`,
      "Cache-Control": "no-store",
    },
  });
}