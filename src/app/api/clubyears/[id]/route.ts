import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * GET /api/clubyears/:id/preview-delete
 * (oder GET /api/clubyears/:id) – liefert eine Vorschau, was beim Löschen
 * dieses Clubjahres alles entfernt würde.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const summary = await collectDeletionSummary(id);
  if (!summary) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(summary);
}

/**
 * DELETE /api/clubyears/:id
 *
 * Löscht ein komplettes Clubjahr inklusive aller damit verbundenen
 * Buchungen, Forderungen, Auslagenlisten, Budget-/Cashflow-Einträge,
 * jahres-spezifischen Kategorien und Archiv-Datei.
 *
 * Sicherheits-Schranken:
 *  - Nur Schatzmeister dürfen löschen.
 *  - Fixierte Jahre (lockedAt != null) können NIE gelöscht werden – diese
 *    sind durch Mitgliederversammlungs-Beschluss endgültig.
 *  - Wenn das Jahr Buchungen oder Forderungen enthält, ist `?force=1`
 *    Pflicht, sonst Statuscode 409.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const cy = await prisma.clubYear.findUnique({
    where: { id },
    include: { archivedYear: true },
  });
  if (!cy) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (cy.lockedAt) {
    return NextResponse.json(
      {
        error:
          "Dieses Clubjahr wurde von der Mitgliederversammlung fixiert und kann nicht mehr gelöscht werden.",
      },
      { status: 423 }, // Locked
    );
  }

  const summary = await collectDeletionSummary(id);
  if (!summary) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const totalContent =
    summary.transactions +
    summary.invoices +
    summary.attendanceLists +
    summary.budgetLines +
    summary.cashflows +
    summary.categories;

  if (totalContent > 0 && !force) {
    return NextResponse.json(
      {
        error:
          "Clubjahr enthält Daten. Zum Löschen mit ?force=1 bestätigen.",
        usage: summary,
      },
      { status: 409 },
    );
  }

  // Tatsächliches Löschen (Reihenfolge nach Foreign-Key-Abhängigkeit)
  await prisma.$transaction(
    async (tx) => {
      const txIds = (
        await tx.transaction.findMany({ where: { clubYearId: id }, select: { id: true } })
      ).map((t) => t.id);
      const invoiceIds = (
        await tx.invoice.findMany({ where: { clubYearId: id }, select: { id: true } })
      ).map((i) => i.id);
      const attendanceIds = (
        await tx.attendanceList.findMany({
          where: { clubYearId: id },
          select: { id: true },
        })
      ).map((a) => a.id);

      // 1) Mail-Inbox-Verknüpfungen lösen (nicht Cascade)
      if (txIds.length > 0) {
        await tx.mailInbox.updateMany({
          where: { matchedTxId: { in: txIds } },
          data: { matchedTxId: null, status: "UNMATCHED", matchedAt: null, matchedById: null },
        });
      }

      // 2) Erinnerungs-Logs zu Forderungen
      if (invoiceIds.length > 0) {
        await tx.reminderLog.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      }

      // 3) Allocations lösen
      if (txIds.length > 0) {
        await tx.txAllocation.deleteMany({ where: { transactionId: { in: txIds } } });
      }
      if (invoiceIds.length > 0) {
        await tx.txAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      }

      // 4) Bezahl-Verknüpfung von Forderungen aus *anderen* Jahren auf
      //    diese Tx lösen (sehr selten, aber möglich)
      if (txIds.length > 0) {
        await tx.invoice.updateMany({
          where: { paidTransactionId: { in: txIds } },
          data: { paidTransactionId: null, paidAt: null, status: "OPEN" },
        });
      }

      // 5) AttendanceEntries (1:1 zu Invoice) löschen.
      //    Cascade ist auf onDelete der listId gesetzt, aber wir löschen
      //    explizit, damit die Reihenfolge mit den Invoices stimmt.
      if (attendanceIds.length > 0) {
        await tx.attendanceEntry.deleteMany({
          where: { listId: { in: attendanceIds } },
        });
      }

      // 6) Transaction-Attachments-Links (auch wenn Cascade gesetzt – defensiv)
      if (txIds.length > 0) {
        await tx.transactionAttachment.deleteMany({
          where: { transactionId: { in: txIds } },
        });
      }

      // 8) Forderungen, Listen, Buchungen, Budget, Cashflow, Kategorien
      await tx.invoice.deleteMany({ where: { clubYearId: id } });
      await tx.attendanceList.deleteMany({ where: { clubYearId: id } });
      await tx.transaction.deleteMany({ where: { clubYearId: id } });
      await tx.budgetLine.deleteMany({ where: { clubYearId: id } });
      await tx.cashflowEntry.deleteMany({ where: { clubYearId: id } });

      // Year-scoped Kategorien (aber nur die, die jetzt keine Buchungen mehr
      // halten – Buchungen sind oben gelöscht, restliche Verweise sollten
      // also keine sein)
      await tx.category.deleteMany({
        where: { clubYearId: id, transactions: { none: {} }, budgetLines: { none: {} } },
      });

      // 9) ArchivedYear-Eintrag entfernen
      if (cy.archivedYear) {
        await tx.archivedYear.delete({ where: { id: cy.archivedYear.id } });
      }

      // 10) Schließlich das Jahr selbst
      await tx.clubYear.delete({ where: { id } });
    },
    { timeout: 30_000 },
  );

  // Archiv-Datei (lokales FS) auf Best-Effort-Basis entfernen (auf Vercel
  // ephemer, daher nicht kritisch).
  if (cy.archivedYear?.fileName) {
    try {
      await fs.unlink(path.join(process.cwd(), "uploads", cy.archivedYear.fileName));
    } catch {
      /* ignorieren */
    }
  }

  return NextResponse.json({ ok: true, deleted: summary });
}

/* ------------------------------- Helfer ------------------------------- */

async function collectDeletionSummary(clubYearId: string) {
  const cy = await prisma.clubYear.findUnique({
    where: { id: clubYearId },
    include: { archivedYear: true },
  });
  if (!cy) return null;

  const [
    transactions,
    invoices,
    attendanceLists,
    budgetLines,
    cashflows,
    categories,
  ] = await Promise.all([
    prisma.transaction.count({ where: { clubYearId } }),
    prisma.invoice.count({ where: { clubYearId } }),
    prisma.attendanceList.count({ where: { clubYearId } }),
    prisma.budgetLine.count({ where: { clubYearId } }),
    prisma.cashflowEntry.count({ where: { clubYearId } }),
    prisma.category.count({ where: { clubYearId } }),
  ]);

  return {
    clubYearId: cy.id,
    label: cy.label,
    isLocked: !!cy.lockedAt,
    isAudited: !!cy.auditedAt,
    isClosed: cy.isClosed,
    archived: !!cy.archivedYear,
    transactions,
    invoices,
    attendanceLists,
    budgetLines,
    cashflows,
    categories,
  };
}