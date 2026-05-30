import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, canRead } from "@/lib/auth";

/**
 * GET /api/transactions/search?q=…
 *
 * Liefert bis zu 20 Buchungen, die zur Query passen:
 *  - Wenn q numerisch (mit `,` oder `.`): Betragsmatch ±0.5 EUR
 *  - Sonst: contains-Match in counterparty / purpose / code
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!canRead(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const num = Number(q.replace(/\./g, "").replace(",", "."));
  let where:
    | import("@prisma/client").Prisma.TransactionWhereInput
    | undefined = undefined;
  if (Number.isFinite(num)) {
    where = {
      deletedAt: null,
      OR: [
        { amount: { gte: num - 0.5, lte: num + 0.5 } },
        { amount: { gte: -num - 0.5, lte: -num + 0.5 } },
      ],
    };
  } else {
    where = {
      deletedAt: null,
      OR: [
        { counterparty: { contains: q, mode: "insensitive" } },
        { purpose: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const results = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      date: true,
      amount: true,
      counterparty: true,
      purpose: true,
    },
    orderBy: { date: "desc" },
    take: 20,
  });
  return NextResponse.json({
    results: results.map((r) => ({ ...r, date: r.date.toISOString() })),
  });
}