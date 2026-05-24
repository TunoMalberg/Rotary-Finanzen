export const EUR = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const NUM = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return EUR.format(n);
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function clubYearLabel(date: Date) {
  // Rotary club year runs 1.7. – 30.6. So Jul-Dec belong to next year-pair.
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  if (m >= 6) return `${y}/${y + 1}`; // Jul or later
  return `${y - 1}/${y}`;
}

export function clubYearBounds(label: string): { startsAt: Date; endsAt: Date } {
  const [a, b] = label.split("/").map(Number);
  return {
    startsAt: new Date(Date.UTC(a, 6, 1)), // 1.7.
    endsAt: new Date(Date.UTC(b, 5, 30, 23, 59, 59)), // 30.6.
  };
}

export function parseGermanNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s
    .toString()
    .replace(/\s/g, "")
    .replace(/[^0-9.,\-+]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}