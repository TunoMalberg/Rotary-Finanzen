import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { buildEarWorkbook } from "@/lib/earExcel";
import { uploadBlob } from "@/lib/blobStorage";
import * as XLSX from "xlsx";

/**
 * POST /api/clubyears/:id/lock
 *
 * Fixiert das Clubjahr (z. B. nach Beschluss in der Mitgliederversammlung).
 * Erzeugt zugleich die finale EAR-Excel-Datei für das Archiv und speichert
 * deren Pfad in `ArchivedYear.fileName`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cy.lockedAt) {
    return NextResponse.json({ error: `Clubjahr ${cy.label} ist bereits fixiert.` }, { status: 409 });
  }
  if (!cy.isClosed) {
    return NextResponse.json(
      { error: "Clubjahr muss zuerst abgeschlossen werden." },
      { status: 409 },
    );
  }

  // Final-Workbook generieren
  const accounts = await prisma.account.findMany();
  const main = accounts.find((a) => a.type === "MAIN") ?? null;
  const gg = accounts.find((a) => a.type === "GLOBAL_GRANT_TRUST") ?? null;
  const txs = await prisma.transaction.findMany({
    where: { clubYearId: id, deletedAt: null },
    include: { category: { select: { id: true, name: true, kind: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const budgetLines = await prisma.budgetLine.findMany({
    where: { clubYearId: id },
    include: { category: true },
  });
  const treasurer = await prisma.user.findFirst({ where: { role: "treasurer" } });
  const wb = buildEarWorkbook({
    clubYear: cy,
    treasurerName: treasurer?.name,
    mainAccount: main,
    ggAccount: gg,
    mainTxs: txs.filter((t) => main && t.accountId === main.id),
    ggTxs: txs.filter((t) => gg && t.accountId === gg.id),
    budgetLines,
    categories: await prisma.category.findMany(),
  });
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // Archiv-Excel persistent ablegen. Auf Vercel ist das Dateisystem read-only
  // (nur /tmp ist beschreibbar), daher NICHT mehr per fs in process.cwd()
  // schreiben, sondern über den Blob-Adapter (Vercel Blob bzw. lokaler
  // Fallback). Der zurückgegebene storagePath (URL bzw. local://…) wird in
  // ArchivedYear.fileName gespeichert und vom archive-file-Endpunkt gelesen.
  //
  // WICHTIG: Best-effort. Das Fixieren des Clubjahres (Beschluss der
  // Mitgliederversammlung) darf NIEMALS an der Archiv-Datei scheitern.
  // Sollte der Blob-Upload fehlschlagen (z. B. weil noch kein Blob-Store
  // verbunden ist), wird das Jahr trotzdem fixiert; die Datei kann später
  // nachgeneriert werden. Früher führte ein fs-Write hier zu HTTP 500.
  const fileName = `EAR Rotary Wien Donau ${cy.label.replace("/", "-")} (Archiv).xlsx`;
  let archiveRel: string | null = null;
  try {
    const stored = await uploadBlob({
      fileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buf,
      keyPrefix: "archive/",
    });
    archiveRel = stored.storagePath;
  } catch (e) {
    console.error("[lock] Archiv-Upload fehlgeschlagen (Jahr wird trotzdem fixiert):", e);
  }

  // Snapshot summary
  const income: Record<string, number> = {};
  const expense: Record<string, number> = {};
  const openingMain = cy.openingBalanceMain;
  const openingGG = cy.openingBalanceGG;
  let closingMain = openingMain;
  let closingGG = openingGG;
  for (const t of txs) {
    if (t.category) {
      if (t.amount > 0) income[t.category.name] = (income[t.category.name] ?? 0) + t.amount;
      else expense[t.category.name] = (expense[t.category.name] ?? 0) + Math.abs(t.amount);
    }
    if (main && t.accountId === main.id) closingMain += t.amount;
    if (gg && t.accountId === gg.id) closingGG += t.amount;
  }

  const summaryJson = JSON.stringify({
    income,
    expense,
    openingMain,
    closingMain,
    openingGG,
    closingGG,
    archiveFileName: fileName,
    archiveRelPath: archiveRel,
  });

  await prisma.$transaction([
    prisma.clubYear.update({
      where: { id },
      data: {
        lockedAt: new Date(),
        lockedById: session?.user?.id,
      },
    }),
    prisma.archivedYear.upsert({
      where: { clubYearId: id },
      update: { summaryJson, fileName: archiveRel, closedAt: new Date(), closedById: session?.user?.id },
      create: {
        clubYearId: id,
        summaryJson,
        fileName: archiveRel,
        closedById: session?.user?.id,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, fileName, archiveRelPath: archiveRel });
}