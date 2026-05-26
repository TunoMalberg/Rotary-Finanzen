import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatEUR, formatDate } from "@/lib/format";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  FolderKanban,
  Download,
} from "lucide-react";
import { AssignButton, EditButton, PrintButton } from "./ProjectDetailClient";
import { RescanButton } from "./RescanButton";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true, color: true } } },
  });
  if (!project) notFound();

  const txs = await prisma.transaction.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: true, account: true, member: true, clubYear: true },
  });

  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance = income + expense;

  // running balance over the project itself
  let projectRun = 0;
  const runningById = new Map<string, number>();
  for (const t of txs) {
    projectRun += t.amount;
    runningById.set(t.id, projectRun);
  }

  // per category breakdown
  const byCat = new Map<
    string,
    { name: string; color: string; income: number; expense: number; count: number }
  >();
  for (const t of txs) {
    const k = t.category?.id ?? "__none";
    const name = t.category?.name ?? "Ohne Kategorie";
    const color = t.category?.color ?? "#94a3b8";
    const cur = byCat.get(k) ?? { name, color, income: 0, expense: 0, count: 0 };
    if (t.amount > 0) cur.income += t.amount;
    else cur.expense += t.amount;
    cur.count += 1;
    byCat.set(k, cur);
  }
  const catRows = Array.from(byCat.values()).sort(
    (a, b) => Math.abs(b.income + b.expense) - Math.abs(a.income + a.expense),
  );

  return (
    <div className="space-y-5 sm:space-y-6 fade-up">
      <div>
        <Link
          href="/projects"
          className="text-sm text-slate-500 hover:text-blue-700 inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" /> Alle Projekte
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="chip font-mono text-[11px]"
              style={{ background: `${project.color}1A`, color: project.color }}
            >
              {project.code}
            </span>
            {project.isClosed ? (
              <span className="chip bg-slate-100 text-slate-600">Abgeschlossen</span>
            ) : (
              <span className="chip bg-emerald-50 text-emerald-700">Aktiv</span>
            )}
          </div>
          <h1 className="font-bold text-slate-900 flex items-center gap-2">
            <FolderKanban className="size-5" style={{ color: project.color }} />
            {project.name}
          </h1>
          {project.description && (
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">{project.description}</p>
          )}
          {(project.startDate || project.endDate) && (
            <p className="text-xs text-slate-500 mt-1">
              Zeitraum: {project.startDate ? formatDate(project.startDate) : "…"} –{" "}
              {project.endDate ? formatDate(project.endDate) : "…"}
            </p>
          )}
          {project.category && (
            <p className="text-xs text-slate-500 mt-1">
              Auto-Kategorie:{" "}
              <span
                className="chip"
                style={{
                  background: `${project.category.color}1A`,
                  color: project.category.color,
                }}
              >
                {project.category.name}
              </span>{" "}
              · Bank-Buchungen mit{" "}
              <code className="font-mono">{project.code}</code> im
              Verwendungszweck werden automatisch hierhin zugeordnet.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap btn-row">
          <AssignButton projectId={project.id} projectName={project.name} />
          <RescanButton projectId={project.id} projectCode={project.code} />
          <EditButton project={{
            id: project.id,
            code: project.code,
            name: project.name,
            description: project.description,
            color: project.color,
            startDate: project.startDate?.toISOString().slice(0, 10) ?? "",
            endDate: project.endDate?.toISOString().slice(0, 10) ?? "",
            isClosed: project.isClosed,
          }} />
          <a
            href={`/api/projects/${project.id}/export`}
            className="btn-ghost"
            title="CSV-Export"
          >
            <Download className="size-4" /> CSV
          </a>
          <PrintButton />
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Einnahmen"
          value={formatEUR(income)}
          color="green"
          icon={<ArrowUpRight className="size-5" />}
        />
        <KpiCard
          title="Ausgaben"
          value={formatEUR(expense)}
          color="red"
          icon={<ArrowDownRight className="size-5" />}
        />
        <KpiCard
          title="Projekt-Saldo"
          value={formatEUR(balance)}
          color={balance >= 0 ? "green" : "red"}
          subtitle={`${txs.length} Buchungen`}
          icon={<Wallet className="size-5" />}
        />
        <KpiCard
          title="Letzte Buchung"
          value={txs.length ? formatDate(txs[txs.length - 1].date) : "—"}
          color="blue"
          subtitle={txs.length ? (txs[txs.length - 1].counterparty ?? "") : ""}
          icon={<FolderKanban className="size-5" />}
        />
      </div>

      {/* Category breakdown */}
      {catRows.length > 0 && (
        <div className="card-soft overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b">
            <h3 className="font-semibold">Aufschlüsselung nach Kategorie</h3>
          </div>
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kategorie</th>
                    <th className="text-right">Anzahl</th>
                    <th className="text-right">Einnahmen</th>
                    <th className="text-right">Ausgaben</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((c) => (
                    <tr key={c.name}>
                      <td data-label="Kategorie">
                        <span className="chip" style={{ background: `${c.color}1A`, color: c.color }}>
                          {c.name}
                        </span>
                      </td>
                      <td data-label="Anzahl" className="text-right tabular">{c.count}</td>
                      <td data-label="Einnahmen" className="text-right font-mono tabular amount-pos">
                        {formatEUR(c.income)}
                      </td>
                      <td data-label="Ausgaben" className="text-right font-mono tabular amount-neg">
                        {formatEUR(c.expense)}
                      </td>
                      <td
                        data-label="Saldo"
                        className={`text-right font-mono tabular font-semibold ${c.income + c.expense >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                      >
                        {formatEUR(c.income + c.expense)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bookings list */}
      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold">Buchungen ({txs.length})</h3>
          <AssignButton projectId={project.id} projectName={project.name} compact />
        </div>
        {txs.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <div>Diesem Projekt sind noch keine Buchungen zugeordnet.</div>
            <div className="text-sm mt-2">
              Klicke auf <span className="font-semibold">„Buchungen zuordnen“</span> oder weise einer Buchung in der Liste das Projekt zu.
            </div>
          </div>
        ) : (
          <div className="table-stack sm:p-0 p-3">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Konto</th>
                    <th>Gegenpartei</th>
                    <th>Verwendungszweck</th>
                    <th>Kategorie</th>
                    <th>Mitglied</th>
                    <th className="text-right">Betrag</th>
                    <th className="text-right" title="Laufender Projekt-Saldo">Projekt-Saldo</th>
                    <th className="no-stack-label" />
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Datum" className="whitespace-nowrap">{formatDate(t.date)}</td>
                      <td data-label="Konto" className="text-xs text-slate-500">
                        {t.account.type === "MAIN" ? "Haupt" : "GG"}
                      </td>
                      <td data-label="Gegenpartei" className="font-medium">{t.counterparty ?? "—"}</td>
                      <td data-label="Verwendungszweck" className="text-slate-600">{t.purpose ?? "—"}</td>
                      <td data-label="Kategorie">
                        {t.category ? (
                          <span
                            className="chip"
                            style={{ background: `${t.category.color}1A`, color: t.category.color }}
                          >
                            {t.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-label="Mitglied">
                        {t.member ? `${t.member.firstName} ${t.member.lastName}` : <span className="text-slate-400">—</span>}
                      </td>
                      <td data-label="Betrag" className={`text-right font-mono tabular ${t.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                        {formatEUR(t.amount)}
                      </td>
                      <td data-label="Projekt-Saldo" className="text-right font-mono tabular text-slate-700">
                        {formatEUR(runningById.get(t.id) ?? 0)}
                      </td>
                      <td className="text-right no-stack-label">
                        <Link href={`/transactions/${t.id}`} className="text-blue-700 hover:underline text-xs">
                          Bearbeiten
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={6} className="font-semibold no-stack-label">Summe</td>
                    <td className={`text-right font-mono tabular font-bold ${balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatEUR(balance)}
                    </td>
                    <td className={`text-right font-mono tabular font-bold ${balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatEUR(balance)}
                    </td>
                    <td className="no-stack-label" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  color,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  color: "blue" | "gold" | "green" | "red";
  icon: React.ReactNode;
}) {
  const accent = {
    blue: "linear-gradient(90deg,#17458F,#0099CC)",
    gold: "linear-gradient(90deg,#F7A81B,#D45F00)",
    green: "linear-gradient(90deg,#047857,#10b981)",
    red: "linear-gradient(90deg,#b91c1c,#ef4444)",
  }[color];
  return (
    <div className="card-soft overflow-hidden">
      <div style={{ height: 4, background: accent }} />
      <div className="p-5">
        <div className="flex items-start justify-between text-slate-500">
          <span className="text-sm">{title}</span>
          <span className="text-slate-400">{icon}</span>
        </div>
        <div className="text-2xl font-bold mt-1 tabular text-slate-900">{value}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1 truncate">{subtitle}</div>}
      </div>
    </div>
  );
}