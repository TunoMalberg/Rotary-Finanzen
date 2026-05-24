import { prisma } from "@/lib/prisma";
import { formatEUR } from "@/lib/format";
import Link from "next/link";
import { Users, Upload } from "lucide-react";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; method?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);

  const where: { status?: string; paysBySEPA?: boolean; isExempt?: boolean; OR?: Array<{ lastName?: { contains: string }; firstName?: { contains: string }; email?: { contains: string } }> } = {};
  if (params.status === "active") where.status = "ACTIVE";
  else if (params.status === "exempt") where.isExempt = true;
  if (params.method === "sepa") where.paysBySEPA = true;
  else if (params.method === "invoice") where.paysBySEPA = false;
  if (params.q) where.OR = [
    { lastName: { contains: params.q } },
    { firstName: { contains: params.q } },
    { email: { contains: params.q } },
  ];

  const members = await prisma.member.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const total = members.length;
  const sepa = members.filter((m) => m.paysBySEPA).length;
  const exempt = members.filter((m) => m.isExempt).length;
  const totalDues = members.reduce((s, m) => s + (m.isExempt ? 0 : m.duesAmount), 0);

  return (
    <div className="space-y-5 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="size-6 text-blue-800" /> Mitglieder
          </h1>
          <p className="text-slate-500 text-sm">{total} Mitglieder · {sepa} mit Einzugsermächtigung · {exempt} befreit</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/members/import" className="btn-primary"><Upload className="size-4" /> Excel-Import</Link>
            <Link href="/members/new" className="btn-ghost">Neues Mitglied</Link>
          </div>
        )}
      </header>

      <div className="grid sm:grid-cols-4 gap-4">
        <Stat label="Mitglieder" value={total.toString()} accent="blue" />
        <Stat label="EZ aktiv" value={sepa.toString()} accent="azure" />
        <Stat label="Befreit" value={exempt.toString()} accent="cranberry" />
        <Stat label="Beitragsvolumen" value={formatEUR(totalDues)} accent="gold" />
      </div>

      <form method="get" className="card-soft p-4 grid sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Suche</label>
          <input className="input" name="q" defaultValue={params.q ?? ""} placeholder="Name, E-Mail …" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
          <select className="input" name="status" defaultValue={params.status ?? ""}>
            <option value="">Alle</option>
            <option value="active">Aktiv</option>
            <option value="exempt">Befreit</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Zahlungsmethode</label>
          <select className="input" name="method" defaultValue={params.method ?? ""}>
            <option value="">Alle</option>
            <option value="sepa">Einzug (EZ)</option>
            <option value="invoice">E-Mail-Rechnung</option>
          </select>
        </div>
        <div className="sm:col-span-4 flex gap-2">
          <button className="btn-primary">Filter</button>
          <Link href="/members" className="btn-ghost">Reset</Link>
        </div>
      </form>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rotary-ID</th>
                <th>Stadt</th>
                <th>E-Mail</th>
                <th>Telefon</th>
                <th>Methode</th>
                <th>Status</th>
                <th className="text-right">Beitrag</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/members/${m.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {m.lastName}, {m.firstName}
                    </Link>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{m.rotaryMemberId ?? "—"}</td>
                  <td className="text-slate-600 text-sm">{m.city ?? "—"}</td>
                  <td className="text-slate-600 text-sm">{m.email ?? "—"}</td>
                  <td className="text-slate-600 text-sm">{m.phone ?? "—"}</td>
                  <td>
                    {m.paysBySEPA
                      ? <span className="chip chip-sepa">EZ</span>
                      : <span className="chip chip-invoice">Rechnung</span>}
                  </td>
                  <td>
                    {m.isExempt
                      ? <span className="chip chip-exempt">Befreit</span>
                      : m.status === "ACTIVE"
                        ? <span className="chip chip-active">Aktiv</span>
                        : <span className="chip chip-cancelled">{m.status}</span>}
                  </td>
                  <td className="text-right font-mono tabular">{formatEUR(m.duesAmount)}</td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-500 py-12">Keine Mitglieder gefunden.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: "blue" | "azure" | "cranberry" | "gold" }) {
  const grad = {
    blue: "linear-gradient(90deg,#17458F,#0099CC)",
    azure: "linear-gradient(90deg,#0099CC,#17458F)",
    cranberry: "linear-gradient(90deg,#D41367,#7B2D8E)",
    gold: "linear-gradient(90deg,#F7A81B,#D45F00)",
  }[accent];
  return (
    <div className="card-soft overflow-hidden">
      <div style={{ height: 4, background: grad }} />
      <div className="p-4">
        <div className="text-xs uppercase text-slate-500 tracking-wider">{label}</div>
        <div className="text-2xl font-bold mt-1 tabular">{value}</div>
      </div>
    </div>
  );
}