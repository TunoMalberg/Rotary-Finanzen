import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { buildEarWorkbook } from "@/lib/earExcel";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/clubyears/:id/export
 * Liefert das Clubjahr als Excel-Datei im EAR-Format des RC Wien-Donau.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const cy = await prisma.clubYear.findUnique({ where: { id } });
  if (!cy) return NextResponse.json({ error: "not found" }, { status: 404 });
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
  const fileName = `EAR Rotary Wien Donau ${cy.label.replace("/", "-")}.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}