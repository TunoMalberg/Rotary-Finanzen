"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";

export function CloseYearBtn({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function close() {
    if (!confirm("Clubjahr abschließen? Es können danach keine Buchungen mehr geändert werden.")) return;
    setBusy(true);
    await fetch(`/api/clubyears/${id}/close`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }
  return <button onClick={close} disabled={busy} className="btn-ghost text-xs"><span className="inline-flex items-center gap-1">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />} Jahr abschließen</span></button>;
}