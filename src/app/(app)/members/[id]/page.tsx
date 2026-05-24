import { prisma } from "@/lib/prisma";
import { formatDate, formatEUR } from "@/lib/format";
import { notFound } from "next/navigation";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { MemberEditForm } from "./MemberEditForm";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const canEdit = isTreasurer(session?.user?.role);
  const m = await prisma.member.findUnique({
    where: { id },
    include: {
      invoices: { orderBy: { createdAt: "desc" }, include: { clubYear: true } },
      transactions: { take: 30, orderBy: { date: "desc" }, include: { category: true, account: true } },
    },
  });
  if (!m) notFound();

  return (
    <div className="space-y-5 fade-up max-w-5xl">
      <header>
        <div className="text-xs uppercase tracking-widest text-amber-600">Mitglied</div>
        <h1 className="text-2xl font-bold">{m.lastName}, {m.firstName}</h1>
        <p className="text-slate-500 text-sm">Rotary-ID {m.rotaryMemberId ?? "—"} · seit {m.joinedAt ? formatDate(m.joinedAt) : "—"}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="card-soft p-3 sm:p-5 space-y-3">
          <h3 className="font-semibold border-b pb-2">Stammdaten</h3>
          {canEdit ? (
            <MemberEditForm member={{
              id: m.id,
              lastName: m.lastName, firstName: m.firstName,
              email: m.email, phone: m.phone, address: m.address, city: m.city,
              postalCode: m.postalCode, country: m.country,
              paysBySEPA: m.paysBySEPA, isExempt: m.isExempt, duesAmount: m.duesAmount,
              status: m.status, notes: m.notes,
            }} />
          ) : (
            <dl className="space-y-2 text-sm">
              <Row k="E-Mail" v={m.email ?? "—"} />
              <Row k="Telefon" v={m.phone ?? "—"} />
              <Row k="Adresse" v={`${m.address ?? "—"}, ${m.postalCode ?? ""} ${m.city ?? ""}`} />
              <Row k="EZ" v={m.paysBySEPA ? "Ja" : "Nein"} />
              <Row k="Befreit" v={m.isExempt ? "Ja" : "Nein"} />
              <Row k="Beitrag" v={formatEUR(m.duesAmount)} />
              <Row k="Status" v={m.status} />
            </dl>
          )}
        </div>

        <div className="card-soft p-3 sm:p-5 space-y-3">
          <h3 className="font-semibold border-b pb-2">Forderungen</h3>
          <div className="table-scroll -mx-3 sm:mx-0 px-3 sm:px-0">
            <table className="data-table text-sm">
              <thead><tr><th>Clubjahr</th><th>Referenz</th><th>Methode</th><th>Status</th><th className="text-right">Betrag</th></tr></thead>
              <tbody>
                {m.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.clubYear.label}</td>
                    <td className="font-mono text-xs break-all">{i.reference}</td>
                    <td><span className={`chip ${i.paymentMethod === "SEPA" ? "chip-sepa" : "chip-invoice"}`}>{i.paymentMethod === "SEPA" ? "EZ" : "Rg."}</span></td>
                    <td><span className={`chip chip-${i.status.toLowerCase()}`}>{statusDe(i.status)}</span></td>
                    <td className="text-right tabular whitespace-nowrap">{formatEUR(i.amount)}</td>
                  </tr>
                ))}
                {m.invoices.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-4">Keine Forderungen.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b font-semibold">Buchungen mit diesem Mitglied</div>
        <div className="table-stack sm:p-0 p-3">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Datum</th><th>Konto</th><th>Verwendungszweck</th><th>Kategorie</th><th className="text-right">Betrag</th></tr></thead>
              <tbody>
                {m.transactions.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Datum" className="whitespace-nowrap">{formatDate(t.date)}</td>
                    <td data-label="Konto" className="text-xs text-slate-500">{t.account.type === "MAIN" ? "Haupt" : "GG"}</td>
                    <td data-label="Zweck">{t.purpose ?? t.counterparty}</td>
                    <td data-label="Kategorie">{t.category?.name ?? "—"}</td>
                    <td data-label="Betrag" className={`text-right font-mono tabular ${t.amount >= 0 ? "amount-pos" : "amount-neg"}`}>{formatEUR(t.amount)}</td>
                  </tr>
                ))}
                {m.transactions.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-6 no-stack-label">Keine Buchungen verknüpft.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <Link href="/members" className="btn-ghost">← Zurück zur Liste</Link>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 text-slate-800">{v}</dd>
    </div>
  );
}

function statusDe(s: string) {
  switch (s) {
    case "OPEN": return "Offen";
    case "PAID": return "Bezahlt";
    case "REMINDED": return "Gemahnt";
    case "CANCELLED": return "Storniert";
    default: return s;
  }
}