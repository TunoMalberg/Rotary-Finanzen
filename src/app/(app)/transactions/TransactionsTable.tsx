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
      <div className="overflow-x-auto">
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
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{formatDate(t.date)}</td>
                <td>
                  <span className="text-xs text-slate-500">
                    {t.accountType === "MAIN" ? "Haupt" : "GG"}
                  </span>
                </td>
                <td className="font-medium max-w-[220px] truncate" title={t.counterparty ?? ""}>{t.counterparty ?? "—"}</td>
                <td className="text-slate-600 max-w-[260px] truncate" title={t.purpose ?? ""}>{t.purpose ?? "—"}</td>
                <td>
                  {t.category ? (
                    <span className="chip" style={{ background: `${t.category.color}1A`, color: t.category.color }}>
                      {t.category.name}
                    </span>
                  ) : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="text-slate-600 text-sm">{t.memberName ?? "—"}</td>
                <td>
                  {t.attachmentId ? (
                    <a className="text-blue-700 hover:underline text-sm inline-flex items-center gap-1" href={`/api/attachments/${t.attachmentId}`} target="_blank" rel="noreferrer">
                      <Paperclip className="size-3.5" /> {t.attachmentName?.slice(0, 12)}…
                    </a>
                  ) : <span className="text-slate-300 text-sm">—</span>}
                </td>
                <td className={`text-right font-mono tabular ${t.amount >= 0 ? "amount-pos" : "amount-neg"}`}>
                  {formatEUR(t.amount)}
                </td>
                {canEdit && (
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/transactions/${t.id}`} className="btn-ghost text-xs px-2 py-1">Bearbeiten</Link>
                      <button onClick={() => del(t.id)} disabled={busy === t.id} className="btn-danger text-xs px-2 py-1">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={canEdit ? 9 : 8} className="text-center text-slate-500 py-12">Keine Buchungen für diese Auswahl.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}