"use client";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettleAllocationsButton({
  transactionId,
  openCount,
}: {
  transactionId: string;
  openCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    settled: number;
    alreadyPaid: number;
    withoutInvoice: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function settle() {
    if (
      !confirm(
        `${openCount} verknüpfte Forderung(en) als bezahlt markieren? Die Forderungen werden mit dieser Sammelbuchung verknüpft (paidTransactionId).`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/transactions/${transactionId}/settle-allocations`,
      { method: "POST" },
    );
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error ?? "Begleichen fehlgeschlagen.");
      return;
    }
    setResult(await res.json());
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={settle}
        disabled={busy || openCount === 0}
        className="btn-primary"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}{" "}
        Einzüge vornehmen{openCount > 0 ? ` (${openCount})` : ""}
      </button>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}
      {result && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          ✓ {result.settled} Forderung(en) auf PAID gesetzt.
          {result.alreadyPaid > 0 && ` ${result.alreadyPaid} bereits bezahlt.`}
          {result.withoutInvoice > 0 &&
            ` ${result.withoutInvoice} Aufteilungen ohne Forderungs-Verknüpfung.`}
        </div>
      )}
    </div>
  );
}