"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Archive, Loader2 } from "lucide-react";

/**
 * Aktionen je Mitglieds-Zeile in der Liste:
 *  - Bearbeiten (→ Detailseite mit Formular)
 *  - Löschen: versucht endgültiges Löschen (nur ohne verknüpfte Daten).
 *    Existiert Historie → Rückfrage, ob stattdessen archiviert (INACTIVE)
 *    werden soll.
 */
export function MemberRowActions({
  memberId,
  memberName,
  isInactive,
  afterDeleteHref,
}: {
  memberId: string;
  memberName: string;
  isInactive: boolean;
  /** Wenn gesetzt, nach endgültigem Löschen dorthin navigieren (z. B. "/members"). */
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "del" | "arch">(null);

  async function archive() {
    setBusy("arch");
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error ?? `Fehler ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    if (!confirm(`„${memberName}" endgültig löschen?`)) return;
    setBusy("del");
    try {
      const res = await fetch(`/api/members/${memberId}?hard=1`, { method: "DELETE" });
      if (res.ok) {
        if (afterDeleteHref) router.push(afterDeleteHref);
        else router.refresh();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Historie vorhanden → Archivieren anbieten.
        if (
          confirm(
            `${d?.error ?? "Endgültiges Löschen nicht möglich."}\n\nStattdessen jetzt archivieren (auf „Inaktiv" setzen)?`,
          )
        ) {
          await archive();
        }
        return;
      }
      alert(d?.error ?? `Fehler ${res.status}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Link
        href={`/members/${memberId}`}
        className="btn-ghost text-xs px-2 py-1"
        title="Bearbeiten"
      >
        <Pencil className="size-3.5" /> Bearbeiten
      </Link>
      {!isInactive && (
        <button
          onClick={archive}
          disabled={!!busy}
          className="btn-ghost text-xs px-2 py-1"
          title="Archivieren (auf Inaktiv setzen – Historie bleibt erhalten)"
        >
          {busy === "arch" ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
        </button>
      )}
      <button
        onClick={del}
        disabled={!!busy}
        className="btn-ghost text-xs px-2 py-1 text-rose-600 hover:bg-rose-50"
        title="Endgültig löschen"
      >
        {busy === "del" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
    </div>
  );
}