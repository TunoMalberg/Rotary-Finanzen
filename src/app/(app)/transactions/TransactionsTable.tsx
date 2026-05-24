"use client";
import { formatDate, formatEUR } from "@/lib/format";
import { Paperclip, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TxRow = {
  id: string;
  date: string;
  accountType: string;
  accountName: string;
  counterparty: string | null;
  purpose: string | null;
  code: string | null;
  amount: number;
  source: string;
  category: { id: string; name: string; color: string } | null;
  memberName: string | null;
  attachmentName: string | null;
  attachmentId: string | null;
  /** Laufender Saldo NACH dieser Buchung (Konto + Clubjahr). */
  balanceAfter: number | null;
};

export function TransactionsTable({ transactions, canEdit }: { transactions: TxRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function del(id: string) {
    if (!confirm("Buchung wirklich stornieren?")) return;
    setBusy(id);
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="card-soft overflow-hidden">
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
                <th>Beleg</th>
                <th className="text-right">Betrag</th>
                <th className="text-right whitespace-nowrap" title="Kontosaldo nach dieser Buchung">Saldo</th>
                {canEdit && <th><span className="sr-only">Aktionen</span></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td data-label="Datum" className="whitespace-nowrap">{formatDate(t.date)}</td>
                  <td data-label="Konto">
                    <span className="text-xs text-slate-500">
                      {t.accountType === "MAIN" ? "Haupt" : "GG"}
                    </span>
                  </td>
                  <td data-label="Gegenpartei" className="font-medium sm:max-w-[220px] sm:truncate" title={t.counterparty ?? ""}>{t.counterparty ?? "—"}</td>
                  <td data-label="Zweck" className="text-slate-600 sm:max-w-[260px] sm:truncate" title={t.purpose ?? ""}>{t.purpose ?? "—"}</td>
                  <td data-label="Kategorie">
                    {t.category ? (
                      <span className="chip" style={{ background: `${t.category.color}1A`, color: t.category.color }}>
                        {t.category.name}
                      </span>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td data-label="Mitglied" className="text-slate-600 text-sm">{t.memberName ?? "—"}</td>
                  <td data-label="Beleg">
                    {t.attachmentId ? (
                      <a className="text-blue-700 hover:underline text-sm inline-flex items-center gap-1 break-all"
                         href={`/api/attachments/${t.attachmentId}`} target="_blank" rel="noreferrer">
                        <Paperclip className="size-3.5 shrink-0" /> {t.attachmentName?.slice(0, 18) ?? "Anhang"}
                      </a>
                    ) : <span className="text-slate-300 text-sm">—</span>}
                  </td>
                  <td data-label="Betrag" className={`text-right font-mono tabular ${t.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                    {formatEUR(t.amount)}
                  </td>
                  <td
                    data-label={t.accountType === "MAIN" ? "Saldo Hauptkonto" : "Saldo GG"}
                    className="text-right font-mono tabular text-slate-700 whitespace-nowrap"
                    title={`Kontosaldo nach dieser Buchung (${t.accountType === "MAIN" ? "Hauptkonto" : "Global Grant"})`}
                  >
                    {t.balanceAfter == null ? <span className="text-slate-300">—</span> : formatEUR(t.balanceAfter)}
                  </td>
                  {canEdit && (
                    <td data-label="Aktionen" className="text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Link href={`/transactions/${t.id}`} className="btn-ghost text-xs px-2.5 py-1.5" style={{ minHeight: 36 }}>Bearbeiten</Link>
                        <button onClick={() => del(t.id)} disabled={busy === t.id}
                                aria-label="Buchung stornieren"
                                className="btn-danger text-xs px-2.5 py-1.5" style={{ minHeight: 36 }}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={canEdit ? 10 : 9} className="text-center text-slate-500 py-12 no-stack-label">Keine Buchungen für diese Auswahl.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}