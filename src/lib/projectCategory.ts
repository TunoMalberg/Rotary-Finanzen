import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sorgt dafür, dass für ein Clubprojekt eine zugehörige Kategorie existiert
 * (Auto-Kategorie). Wird beim Anlegen und Aktualisieren eines Projekts
 * aufgerufen.
 *
 * Regeln:
 *  - Kategorie-Name = Projekt-Name (anpassbar, beim Namens-Update wird die
 *    Kategorie ebenfalls umbenannt – außer der Anwender hat sie bewusst
 *    abweichend benannt; wir erkennen dies daran, dass `Category.name` weder
 *    dem alten noch dem neuen Projekt-Namen entspricht und führen dann KEINE
 *    Umbenennung durch).
 *  - Kategorie-Farbe = Projekt-Farbe (gleiche Sync-Logik).
 *  - Kategorie-Kind = "NEUTRAL" – Projekte können sowohl Einnahmen als auch
 *    Ausgaben enthalten.
 *  - Kategorie ist global (clubYearId = null), damit das Projekt
 *    jahresübergreifend funktioniert.
 *
 * Liefert die Category-ID, die in `Project.categoryId` gespeichert werden soll.
 */
export async function ensureProjectCategory(
  db: Db,
  args: {
    projectId: string;
    name: string;
    color: string;
    /** Vorheriger Project-Name, falls dies ein Update ist. */
    prevName?: string;
    /** Vorhandene Category-ID, falls bereits verknüpft. */
    existingCategoryId?: string | null;
  },
): Promise<string> {
  const { projectId, name, color, prevName, existingCategoryId } = args;

  if (existingCategoryId) {
    const cat = await db.category.findUnique({
      where: { id: existingCategoryId },
    });
    if (cat) {
      // Wenn der bisherige Kategorie-Name dem alten Projekt-Namen entspricht
      // (oder dem neuen, falls schon synchron), → umbenennen. Sonst nicht
      // (Anwender hat manuell abweichend benannt).
      const shouldRename =
        cat.name === prevName || cat.name === name;
      if (shouldRename || cat.color !== color) {
        await db.category.update({
          where: { id: cat.id },
          data: {
            name: shouldRename ? name : cat.name,
            color,
          },
        });
      }
      return cat.id;
    }
    // existingCategoryId zeigt ins Leere – fall through zum Neu-Anlegen.
  }

  // Vorhandene globale Kategorie mit gleichem Namen wiederverwenden …
  const existingByName = await db.category.findFirst({
    where: { name, clubYearId: null },
  });
  if (existingByName) {
    // Verknüpfen
    await db.project.update({
      where: { id: projectId },
      data: { categoryId: existingByName.id },
    });
    return existingByName.id;
  }

  // … sonst neu anlegen.
  const created = await db.category.create({
    data: {
      name,
      kind: "NEUTRAL",
      color,
      clubYearId: null,
    },
  });
  await db.project.update({
    where: { id: projectId },
    data: { categoryId: created.id },
  });
  return created.id;
}

/**
 * Versucht aus der vorhandenen Buchungs-Information abzuleiten, ob ein
 * Projekt-Code in der Buchung referenziert wird. Liefert die Project-ID
 * (zuerst gefundenes Match) oder null.
 *
 * Match-Strategie (case-insensitive, Wortgrenze auf einer Seite ausreichend):
 *  - Verwendungszweck enthält den Code als ganzes Wort
 *  - Gegenpartei enthält den Code als ganzes Wort
 *  - Bank-Code-Feld (`Transaction.code`) enthält den Code
 *
 * Damit kurze Codes (z. B. "GG") nicht versehentlich matchen, ist eine
 * Mindestlänge von 3 Zeichen vorausgesetzt.
 */
export function detectProjectByCode(
  text: { purpose?: string | null; counterparty?: string | null; code?: string | null },
  projects: { id: string; code: string }[],
): { id: string; code: string } | null {
  const hay = [
    text.purpose ?? "",
    text.counterparty ?? "",
    text.code ?? "",
  ]
    .join(" ")
    .toUpperCase();
  for (const p of projects) {
    if (!p.code || p.code.length < 3) continue;
    const code = p.code.toUpperCase();
    // Wortgrenzen-Match: Code muss von Nicht-Alphanumerik umschlossen sein
    // (oder am Anfang/Ende stehen).
    const re = new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(code)}(?:$|[^A-Z0-9])`);
    if (re.test(hay)) return p;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}