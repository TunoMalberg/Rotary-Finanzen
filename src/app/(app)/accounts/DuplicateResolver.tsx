"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DuplicateResolver({
  rows,
}: {
  rows: { id: string; hasRef: boolean; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Standard-Vorschlag: alle Zeilen OHNE externalRef löschen
  // (Bank-Importe mit Referenz behalten).
  const toDelete = rows.filter((r) => !r.hasRef);
  const toKeep = rows.filter((r) => r.hasRef);

  async function execute() {
    if (toDelete.length === 0 || toKeep.length === 0) return;
    if (
      !confirm(
        `Manuelle Variante(n) löschen und Bank-Import behalten?\n\nLöschen:\n• ${toDelete
          .map((r) => r.label)
          .join("\n• ")}\n\nBehalten:\n• ${toKeep.map((r) => r.label).join("\n• ")}`,
      )
    )
      return;
    setBusy(true);
    for (const r of toDelete) {
      await fetch(`/api/transactions/${r.id}`, { method: "DELETE" });
    }
    setBusy(false);
    router.refresh();
  }

  if (toDelete.length === 0 || toKeep.length === 0) {
    return <span className="text-xs text-slate-400">manuelle Prüfung</span>;
  }

  return (
    <button
      type="button"
      onClick={execute}
      disabled={busy}
      className="btn-danger text-xs px-2.5 py-1.5 inline-flex items-center gap-1"
      style={{ minHeight: 32 }}
      title="Manuelle Variante löschen, Bank-Import behalten"
    >
      <Trash2 className="size-3.5" /> bereinigen
    </button>
  );
}