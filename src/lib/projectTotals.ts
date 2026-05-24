import { prisma } from "./prisma";

export type ProjectTotal = {
  id: string;
  code: string;
  name: string;
  color: string;
  description: string | null;
  isClosed: boolean;
  startDate: Date | null;
  endDate: Date | null;
  income: number;
  expense: number; // negative number
  balance: number; // income + expense
  count: number;
  lastBookingDate: Date | null;
};

/** Aggregates income / expense / balance per project across the entire history.
 *  Excludes soft-deleted bookings.
 */
export async function getProjectTotals(): Promise<ProjectTotal[]> {
  const projects = await prisma.project.findMany({
    orderBy: [{ isClosed: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });

  if (projects.length === 0) return [];

  // group by projectId + amount sign in JS — sqlite makes this simpler than two SQL aggregates
  const txs = await prisma.transaction.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, deletedAt: null },
    select: { projectId: true, amount: true, date: true },
  });

  return projects.map((p) => {
    const tx = txs.filter((t) => t.projectId === p.id);
    const income = tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = tx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const lastBookingDate = tx.length
      ? tx.reduce<Date | null>((acc, t) => (acc && acc > t.date ? acc : t.date), null)
      : null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      color: p.color,
      description: p.description,
      isClosed: p.isClosed,
      startDate: p.startDate,
      endDate: p.endDate,
      income,
      expense,
      balance: income + expense,
      count: tx.length,
      lastBookingDate,
    };
  });
}