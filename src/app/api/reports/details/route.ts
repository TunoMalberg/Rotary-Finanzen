import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearLabel = url.searchParams.get("year");
  const categoryName = url.searchParams.get("category");
  const kind = url.searchParams.get("kind"); // "INCOME" | "EXPENSE" | null
  if (!yearLabel || !categoryName) {
    return NextResponse.json(
      { error: "year and category required" },
      { status: 400 },
    );
  }

  const year = await prisma.clubYear.findFirst({ where: { label: yearLabel } });
  if (!year)
    return NextResponse.json({
      year: yearLabel,
      category: categoryName,
      items: [],
      total: 0,
    });

  let categoryFilter: {
    categoryId?: string | null;
    category?: { name: string };
  } = {};
  if (categoryName === "Ohne Kategorie") {
    categoryFilter = { categoryId: null };
  } else {
    const cat = await prisma.category.findFirst({
      where: { name: categoryName },
    });
    if (!cat)
      return NextResponse.json({
        year: yearLabel,
        category: categoryName,
        items: [],
        total: 0,
      });
    categoryFilter = { categoryId: cat.id } as { categoryId: string };
  }

  const txs = await prisma.transaction.findMany({
    where: {
      clubYearId: year.id,
      deletedAt: null,
      ...categoryFilter,
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      counterparty: true,
      purpose: true,
      amount: true,
      account: { select: { name: true, type: true } },
      project: { select: { code: true, name: true, color: true } },
      category: { select: { name: true, color: true, kind: true } },
    },
  });

  let items = txs;
  if (kind === "INCOME") items = items.filter((t) => t.amount > 0);
  if (kind === "EXPENSE") items = items.filter((t) => t.amount < 0);

  const total = items.reduce((s, t) => s + t.amount, 0);
  return NextResponse.json({
    year: yearLabel,
    category: categoryName,
    total,
    items,
  });
}
