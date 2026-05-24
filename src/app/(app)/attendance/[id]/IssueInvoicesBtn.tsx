"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, FileText } from "lucide-react";

export function IssueInvoicesBtn({ listId }: { listId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch(`/api/attendance/${listId}/issue-invoices`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      alert(`${d.created} Rechnungen erzeugt.`);
      router.refresh();
    }
  }
  return <button onClick={go} disabled={busy} className="btn-primary">{busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Forderungen erzeugen</button>;
}