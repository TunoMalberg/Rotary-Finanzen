// Auto-Kategorisierungs-Heuristik basierend auf Texten der EAR-Excel.
export type CategoryRule = {
  name: string;
  kind: "INCOME" | "EXPENSE" | "NEUTRAL";
  patterns: RegExp[];
};

export const CATEGORY_SEED: {
  name: string;
  kind: "INCOME" | "EXPENSE" | "NEUTRAL";
  color: string;
  isDuesCategory?: boolean;
  sortOrder: number;
}[] = [
  // Einnahmen
  {
    name: "Mitgliedsbeitrag",
    kind: "INCOME",
    color: "#17458F",
    isDuesCategory: true,
    sortOrder: 1,
  },
  { name: "Aufnahmegebühr", kind: "INCOME", color: "#0099CC", sortOrder: 2 },
  { name: "RYLA Einnahmen", kind: "INCOME", color: "#00A28A", sortOrder: 3 },
  { name: "Spenden Einnahmen", kind: "INCOME", color: "#7B2D8E", sortOrder: 4 },
  { name: "Zinsen", kind: "INCOME", color: "#5A8DEE", sortOrder: 5 },
  {
    name: "Sonstige Einnahmen",
    kind: "INCOME",
    color: "#A6CEE3",
    sortOrder: 6,
  },
  {
    name: "Präsenzaufwand Einnahmen",
    kind: "INCOME",
    color: "#3CA9C8",
    sortOrder: 7,
  },
  { name: "Fundraising", kind: "INCOME", color: "#E07B00", sortOrder: 8 },
  { name: "District Grant", kind: "INCOME", color: "#F7A81B", sortOrder: 9 },
  // Ausgaben
  {
    name: "Distriktsbeitrag",
    kind: "EXPENSE",
    color: "#17458F",
    sortOrder: 20,
  },
  {
    name: "Rotary Intl. & Foundation",
    kind: "EXPENSE",
    color: "#D41367",
    sortOrder: 21,
  },
  { name: "Spesen", kind: "EXPENSE", color: "#888888", sortOrder: 22 },
  { name: "RYLA Ausgaben", kind: "EXPENSE", color: "#00A28A", sortOrder: 23 },
  {
    name: "Clubprojekte / Spenden",
    kind: "EXPENSE",
    color: "#7B2D8E",
    sortOrder: 24,
  },
  { name: "Präsenzaufwand", kind: "EXPENSE", color: "#3CA9C8", sortOrder: 25 },
  { name: "Saalmiete", kind: "EXPENSE", color: "#7C5E2A", sortOrder: 26 },
  {
    name: "Sonstige Ausgaben",
    kind: "EXPENSE",
    color: "#555555",
    sortOrder: 27,
  },
  { name: "Global Grant", kind: "EXPENSE", color: "#F7A81B", sortOrder: 28 },
];

export const CATEGORY_RULES: CategoryRule[] = [
  {
    name: "Mitgliedsbeitrag",
    kind: "INCOME",
    patterns: [/mitgliedsbeitrag/i, /mgbeitrag/i, /mb-?beitrag/i],
  },
  {
    name: "Aufnahmegebühr",
    kind: "INCOME",
    patterns: [/aufnahmegeb(uehr|ühr)/i],
  },
  {
    name: "RYLA Einnahmen",
    kind: "INCOME",
    patterns: [/ryla.*(beitrag|teilnehmer|einnahme)/i],
  },
  {
    name: "Spenden Einnahmen",
    kind: "INCOME",
    patterns: [/spende.*(eingang|erhalten)/i, /^spende\b/i],
  },
  { name: "Zinsen", kind: "INCOME", patterns: [/habenzinsen/i, /^zinsen$/i] },
  {
    name: "Distriktsbeitrag",
    kind: "EXPENSE",
    patterns: [/distrikt/i, /sets/i, /pets/i],
  },
  {
    name: "Rotary Intl. & Foundation",
    kind: "EXPENSE",
    patterns: [/rotary intl/i, /foundation/i, /rotary magazin/i, /^magazin/i],
  },
  {
    name: "Spesen",
    kind: "EXPENSE",
    patterns: [
      /kontof(uehr|ühr)/i,
      /buchungskosten/i,
      /kostenbeitrag digital/i,
      /porto/i,
      /sollzinsen/i,
      /^kest$/i,
      /spesen/i,
    ],
  },
  {
    name: "RYLA Ausgaben",
    kind: "EXPENSE",
    patterns: [/ryla\b.*(ausgabe|spese|spende|kosten)/i],
  },
  {
    name: "Clubprojekte / Spenden",
    kind: "EXPENSE",
    patterns: [
      /clubprojekt/i,
      /weihnacht(s)?aktion/i,
      /spende\b.*(an|für|fuer)/i,
      /kids camp/i,
      /caritas/i,
      /concordia/i,
    ],
  },
  {
    name: "Präsenzaufwand",
    kind: "EXPENSE",
    patterns: [
      /heuriger/i,
      /pr(ä|ae)sidentenheuriger/i,
      /pr(ä|ae)senzaufwand/i,
      /oper\b/i,
      /konzert/i,
      /tosca/i,
    ],
  },
  {
    name: "Saalmiete",
    kind: "EXPENSE",
    patterns: [/saalmiete/i, /raummiete/i],
  },
  { name: "Global Grant", kind: "EXPENSE", patterns: [/global grant/i] },
];

export function autoCategoryName(input: {
  purpose?: string | null;
  counterparty?: string | null;
  code?: string | null;
  amount: number;
}): { name: string; kind: "INCOME" | "EXPENSE" | "NEUTRAL" } | null {
  const hay = [input.purpose, input.counterparty, input.code]
    .filter(Boolean)
    .join(" || ");
  if (!hay) return null;
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((rx) => rx.test(hay))) {
      // skip if sign mismatch
      if (rule.kind === "INCOME" && input.amount < 0) continue;
      if (rule.kind === "EXPENSE" && input.amount > 0) continue;
      return { name: rule.name, kind: rule.kind };
    }
  }
  // Sign-Fallback
  if (input.amount > 0) return { name: "Sonstige Einnahmen", kind: "INCOME" };
  if (input.amount < 0) return { name: "Sonstige Ausgaben", kind: "EXPENSE" };
  return null;
}

/**
 * Liefert einen Score für eine Kategorie gegen einen Buchungstext.
 * Score basiert auf: Treffer einer Pattern-Regel (50 Punkte), Substring-
 * Treffer der einzelnen Wörter aus dem Kategorienamen im Text (10 Punkte
 * je Wort), und einem Sign-Bonus (10 Punkte).
 */
export function scoreCategoryMatch(
  cat: { name: string; kind: string },
  input: {
    purpose?: string | null;
    counterparty?: string | null;
    code?: string | null;
    amount: number;
  },
): number {
  const hayParts = [input.purpose, input.counterparty, input.code].filter(
    Boolean,
  );
  const hay = hayParts.join(" || ").toLowerCase();
  if (!hay) return 0;
  let score = 0;
  // Sign matters
  const signOk =
    cat.kind === "NEUTRAL" ||
    (cat.kind === "INCOME" && input.amount >= 0) ||
    (cat.kind === "EXPENSE" && input.amount <= 0);
  if (!signOk) return 0;
  score += 5; // sign-fit baseline

  // Rule pattern hit
  const rule = CATEGORY_RULES.find((r) => r.name === cat.name);
  if (rule?.patterns.some((rx) => rx.test(hay))) score += 60;

  // Token presence (each significant word ≥4 chars from the cat name appearing in hay)
  const words = cat.name
    .toLowerCase()
    .split(/[\s/&]+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !["intl", "sonstige", "ausgaben", "einnahmen"].includes(w),
    );
  for (const w of words) {
    if (hay.includes(w)) score += 12;
  }

  return score;
}

/**
 * Liefert die Top-N Kategorien sortiert nach Score, plus Sign-Fallback
 * ("Sonstige Einnahmen"/"Sonstige Ausgaben") falls keine andere matched.
 */
export function rankCategories(
  cats: { id: string; name: string; kind: string; color: string }[],
  input: {
    purpose?: string | null;
    counterparty?: string | null;
    code?: string | null;
    amount: number;
  },
  topN = 3,
): { id: string; name: string; kind: string; color: string; score: number }[] {
  const scored = cats
    .map((c) => ({ ...c, score: scoreCategoryMatch(c, input) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
