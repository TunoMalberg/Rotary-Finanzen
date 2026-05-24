import { prisma } from "@/lib/prisma";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}.${m}.${y}`;
}

function fmtAmount(n: number): string {
  // German decimal: 1234,56
  return n.toFixed(2).replace(".", ",");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return new Response("not found", { status: 404 });

  const txs = await prisma.transaction.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: true, account: true, member: true, clubYear: true },
  });

  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance = income + expense;

  const lines: string[] = [];
  lines.push(`Projekt-Abrechnung;${csvEscape(project.code)};${csvEscape(project.name)}`);
  if (project.description) lines.push(`Beschreibung;${csvEscape(project.description)}`);
  lines.push(`Erstellt am;${csvEscape(fmtDate(new Date()))}`);
  lines.push("");
  lines.push("Datum;Konto;Clubjahr;Gegenpartei;Verwendungszweck;Kategorie;Mitglied;Betrag (EUR);Lfd. Saldo (EUR)");

  let run = 0;
  for (const t of txs) {
    run += t.amount;
    lines.push(
      [
        fmtDate(t.date),
        t.account.type === "MAIN" ? "Hauptkonto" : "Global Grant",
        t.clubYear.label,
        t.counterparty ?? "",
        t.purpose ?? "",
        t.category?.name ?? "",
        t.member ? `${t.member.firstName} ${t.member.lastName}` : "",
        fmtAmount(t.amount),
        fmtAmount(run),
      ]
        .map(csvEscape)
        .join(";"),
    );
  }
  lines.push("");
  lines.push(`;;;;;;Einnahmen;${fmtAmount(income)};`);
  lines.push(`;;;;;;Ausgaben;${fmtAmount(expense)};`);
  lines.push(`;;;;;;Saldo;${fmtAmount(balance)};`);

  // Excel-friendly: UTF-8 BOM + CRLF
  const body = `\uFEFF${lines.join("\r\n")}`;
  const fileName = `Projekt-${project.code}-Abrechnung.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}