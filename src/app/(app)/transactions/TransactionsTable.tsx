"use client";
import { formatDate, formatEUR } from "@/lib/format";
import { ChevronDown, ChevronRight, Paperclip, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { InlineSelect, InlineText } from "./InlineEdit";

export type TxAllocationRow = {
  id: string;
  partnerName: string | null;
  partnerIban: string | null;
  memberName: string | null;
  invoiceRef: string | null;
  invoiceStatus: string | null;
  amount: number;
};

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
  categoryId: string | null;
  category: { id: string; name: string; color: string } | null;
  memberId: string | null;
  memberName: string | null;
  attachmentName: string | null;
  attachmentId: string | null;
  /** Laufender Saldo NACH dieser Buchung (Konto + Clubjahr). */
  balanceAfter: number | null;
  /** Aufteilungen aus SEPA-Sammeleinzug (leer wenn keine vorhanden). */
  allocations: TxAllocationRow[];
};

export type CategoryOption = { id: string; name: string; color: string; kind: string };
export type MemberOption = { id: string; name: string };

export function TransactionsTable({
  transactions,
  canEdit,
  inlineEditable,
  categories,
  members,
}: {
  transactions: TxRow[];
  canEdit: boolean;
  inlineEditable: boolean;
  categories: CategoryOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `HTTP ${res.status}`);
    }
    // Daten neu laden, damit der Saldo-Lauf etc. konsistent bleibt.
    startTransition(() => router.refresh());
  }

  async function del(id: string) {
    if (!confirm("Buchung wirklich stornieren?")) return;
    setBusy(id);
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
    color: c.color,
  }));
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));

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
              {transactions.map((t) => {
                const hasAllocs = t.allocations.length > 0;
                const isOpen = expanded.has(t.id);
                return (
                <Fragment key={t.id}>
                <tr className={hasAllocs ? "bg-blue-50/30" : ""}>
                  <td data-label="Datum" className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {hasAllocs ? (
                        <button
                          type="button"
                          onClick={() => toggle(t.id)}
                          aria-label={isOpen ? "Aufteilung einklappen" : "Aufteilung anzeigen"}
                          aria-expanded={isOpen}
                          className="text-blue-700 hover:text-blue-900 -ml-1 p-0.5 rounded hover:bg-blue-100"
                          title={`${t.allocations.length} Einzelbuchungen`}
                        >
                          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                      <span>{formatDate(t.date)}</span>
                    </div>
                  </td>
                  <td data-label="Konto">
                    <span className="text-xs text-slate-500">
                      {t.accountType === "MAIN" ? "Haupt" : "GG"}
                    </span>
                  </td>
                  <td data-label="Gegenpartei" className="font-medium sm:max-w-[220px]">
                    {inlineEditable ? (
                      <InlineText
                        value={t.counterparty}
                        placeholder="Gegenpartei"
                        onCommit={(v) => patch(t.id, { counterparty: v })}
                      />
                    ) : (
                      <span className="block sm:truncate" title={t.counterparty ?? ""}>{t.counterparty ?? "—"}</span>
                    )}
                  </td>
                  <td data-label="Zweck" className="text-slate-600 sm:max-w-[260px]">
                    {inlineEditable ? (
                      <InlineText
                        value={t.purpose}
                        placeholder="Verwendungszweck"
                        onCommit={(v) => patch(t.id, { purpose: v })}
                      />
                    ) : (
                      <span className="block sm:truncate" title={t.purpose ?? ""}>{t.purpose ?? "—"}</span>
                    )}
                  </td>
                  <td data-label="Kategorie" className="sm:min-w-[180px]">
                    {inlineEditable ? (
                      <InlineSelect
                        value={t.categoryId}
                        options={categoryOptions}
                        placeholder="— ohne Kategorie —"
                        onCommit={(v) => patch(t.id, { categoryId: v })}
                      />
                    ) : t.category ? (
                      <span className="chip" style={{ background: `${t.category.color}1A`, color: t.category.color }}>
                        {t.category.name}
                      </span>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td data-label="Mitglied" className="text-slate-600 text-sm sm:min-w-[180px]">
                    {inlineEditable ? (
                      <InlineSelect
                        value={t.memberId}
                        options={memberOptions}
                        placeholder="— kein Mitglied —"
                        onCommit={(v) => patch(t.id, { memberId: v })}
                      />
                    ) : (
                      t.memberName ?? "—"
                    )}
                  </td>
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
                {hasAllocs && !isOpen && (
                  <tr className="bg-blue-50/20 no-stack-label">
                    <td />
                    <td colSpan={canEdit ? 9 : 8} className="text-xs text-blue-800 py-1.5">
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        className="hover:underline"
                      >
                        ↳ {t.allocations.length} Einzelbuchungen
                        {" · "}Summe {formatEUR(t.allocations.reduce((a, x) => a + x.amount, 0))}
                        {" · "}<span className="text-blue-600">anzeigen</span>
                      </button>
                    </td>
                  </tr>
                )}
                {hasAllocs && isOpen && t.allocations.map((a) => (
                  <tr key={a.id} className="bg-blue-50/40 text-sm no-stack-label">
                    <td />
                    <td colSpan={2} className="text-xs text-slate-500 pl-4">
                      <span className="text-blue-700">↳</span> {a.partnerName ?? "—"}
                    </td>
                    <td className="text-slate-600 text-xs">
                      {a.invoiceRef ? (
                        <span title={`Forderung ${a.invoiceRef}`}>
                          <code className="text-[11px]">{a.invoiceRef}</code>{" "}
                          {a.invoiceStatus === "PAID" ? (
                            <span className="text-emerald-700 font-medium">✓ beglichen</span>
                          ) : (
                            <span className="text-amber-700">{a.invoiceStatus}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">keine Forderung verknüpft</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-400">—</td>
                    <td className="text-xs text-slate-600">{a.memberName ?? "—"}</td>
                    <td className="text-xs font-mono text-slate-400">
                      {a.partnerIban ?? ""}
                    </td>
                    <td className="text-right font-mono tabular text-xs amount-pos">
                      {formatEUR(a.amount)}
                    </td>
                    <td />
                    {canEdit && <td />}
                  </tr>
                ))}
                </Fragment>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={canEdit ? 10 : 9} className="text-center text-slate-500 py-12 no-stack-label">Keine Buchungen für diese Auswahl.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {inlineEditable && (
        <div className="px-3 sm:px-4 py-2 border-t border-slate-100 text-xs text-slate-500 bg-slate-50/50">
          Tipp: Felder <span className="font-medium">Gegenpartei</span>, <span className="font-medium">Verwendungszweck</span>, <span className="font-medium">Kategorie</span> und <span className="font-medium">Mitglied</span> können direkt in der Tabelle bearbeitet werden – Änderung wird automatisch gespeichert.
        </div>
      )}
    </div>
  );
}