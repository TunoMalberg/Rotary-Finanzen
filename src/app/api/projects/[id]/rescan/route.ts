import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { ensureProjectCategory, detectProjectByCode } from "@/lib/projectCategory";

/**
 * POST /api/projects/:id/rescan
 *
 * Sucht in vorhandenen Buchungen (in nicht-fixierten Clubjahren) nach dem
 * Projekt-Code und ordnet treffende Buchungen diesem Projekt + dessen
 * Auto-Kategorie zu. Standardmäßig werden nur Buchungen ohne Projekt-/
 * Kategorie-Zuordnung verändert; mit `?force=1` werden auch bereits
 * zugeordnete überschrieben.
 *
 * Antwort: { matched, assigned, skipped, projectCode }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
  }
  if (!project.code || project.code.length < 3) {
    return NextResponse.json(
      { error: "Projekt-Code fehlt oder ist zu kurz (min. 3 Zeichen)." },
      { status: 400 },
    );
  }

  // Auto-Kategorie sicherstellen (für Altprojekte ohne Kategorie).
  const categoryId = await ensureProjectCategory(prisma, {
    projectId: project.id,
    name: project.name,
    color: project.color,
    existingCategoryId: project.categoryId,
  });

  // Buchungen in offenen Clubjahren laden (case-insensitive ILIKE %CODE%).
  const codeUpper = project.code.toUpperCase();
  const candidates = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      clubYear: { lockedAt: null },
      OR: [
        { purpose: { contains: codeUpper, mode: "insensitive" } },
        { counterparty: { contains: codeUpper, mode: "insensitive" } },
        { code: { contains: codeUpper, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      purpose: true,
      counterparty: true,
      code: true,
      projectId: true,
      categoryId: true,
    },
  });

  const projectsList = [{ id: project.id, code: project.code }];
  let matched = 0;
  let assigned = 0;
  let skipped = 0;

  for (const tx of candidates) {
    const hit = detectProjectByCode(
      { purpose: tx.purpose, counterparty: tx.counterparty, code: tx.code },
      projectsList,
    );
    if (!hit) continue;
    matched++;
    const alreadyOnProject = tx.projectId === project.id;
    const canSetProject = force || !tx.projectId || alreadyOnProject;
    const canSetCategory = force || !tx.categoryId || tx.categoryId === categoryId;
    if (!canSetProject || !canSetCategory) {
      skipped++;
      continue;
    }
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        projectId: project.id,
        categoryId: canSetCategory ? categoryId : tx.categoryId,
      },
    });
    assigned++;
  }

  return NextResponse.json({
    projectCode: project.code,
    categoryId,
    matched,
    assigned,
    skipped,
    force,
  });
}