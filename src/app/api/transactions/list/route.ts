import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "1000"), 5000);
  const txs = await prisma.transaction.findMany({
    where: { deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      date: true,
      counterparty: true,
      purpose: true,
      amount: true,
      projectId: true,
      account: { select: { type: true } },
      category: { select: { name: true, color: true } },
      project: { select: { code: true, color: true } },
    },
  });
  return NextResponse.json(txs);
}