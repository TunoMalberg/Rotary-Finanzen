import { prisma } from "@/lib/prisma";

/**
 * Hilfsfunktionen für Auslagenprojekte (AttendanceList).
 */

const CAT_PREFIX = "Auslagen: ";

/**
 * Auto-Kategorie pro Auslagenprojekt sicherstellen.
 *
 *  - Name: "Auslagen: <eventName>"
 *  - kind: EXPENSE
 *  - clubYearId: scoped (Projekt-Kategorie nur in diesem Clubjahr sichtbar)
 *
 * Idempotent: bei Rename wird die bestehende Kategorie umbenannt; bei Konflikt
 * mit anderer Kategorie wird ein numerischer Suffix angehängt.
 */
export async function ensureAttendanceCategory(args: {
  clubYearId: string;
  eventName: string;
  existingCategoryId: string | null;
}): Promise<string> {
  const desired = `${CAT_PREFIX}${args.eventName}`.trim();

  if (args.existingCategoryId) {
    const cat = await prisma.category.findUnique({ where: { id: args.existingCategoryId } });
    if (cat) {
      if (cat.name !== desired) {
        // Versuch Rename – falls Name belegt, Suffix anhängen.
        try {
          await prisma.category.update({ where: { id: cat.id }, data: { name: desired } });
        } catch {
          await prisma.category.update({
            where: { id: cat.id },
            data: { name: `${desired} (${cat.id.slice(0, 4)})` },
          });
        }
      }
      return cat.id;
    }
  }

  // Existiert eine gleichnamige Kategorie im Clubjahr schon → wiederverwenden.
  const existing = await prisma.category.findFirst({
    where: { clubYearId: args.clubYearId, name: desired },
  });
  if (existing) return existing.id;

  const created = await prisma.category.create({
    data: {
      name: desired,
      kind: "EXPENSE",
      clubYearId: args.clubYearId,
      color: "#D45F00",
      sortOrder: 900,
    },
  });
  return created.id;
}

/**
 * Resolved-paymentMethod für eine Entry-Zeile berechnen.
 *
 *  - paymentOverride > Listen-Default
 *  - bei Listen-Default "MIXED": SEPA wenn Member.paysBySEPA, sonst E-Mail-Rechnung.
 *  - Non-Members ohne EZ → immer EMAIL_INVOICE.
 */
export function resolvePaymentMethod(
  listMethod: string,
  override: string | null,
  member: { paysBySEPA: boolean; status: string },
): "SEPA" | "EMAIL_INVOICE" {
  if (override === "SEPA" || override === "EMAIL_INVOICE") return override;
  if (listMethod === "SEPA") return member.paysBySEPA ? "SEPA" : "EMAIL_INVOICE";
  if (listMethod === "EMAIL_INVOICE") return "EMAIL_INVOICE";
  // MIXED
  return member.paysBySEPA ? "SEPA" : "EMAIL_INVOICE";
}

/**
 * Beim Ändern von billPerHead / personCount / amount sollen offene Invoices
 * (status OPEN | REMINDED) den neuen Betrag bekommen. PAID / CANCELLED werden
 * NICHT mehr verändert.
 */
export async function syncInvoiceAmount(invoiceId: string, newAmount: number) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return;
  if (inv.status === "PAID" || inv.status === "CANCELLED") return;
  if (Math.abs(inv.amount - newAmount) < 0.005) return;
  await prisma.invoice.update({ where: { id: invoiceId }, data: { amount: newAmount } });
}