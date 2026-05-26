"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

export function RescanButton({
  projectId,
  projectCode,
}: {
  projectId: string;
  projectCode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rescan(force: boolean) {
    if (
      force &&
      !confirm(
        "Erzwingen heißt, dass auch Buchungen mit anderem Projekt/Kategorie überschrieben werden. Fortfahren?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch(
      `/api/projects/${projectId}/rescan${force ? "?force=1" : ""}`,
      { method: "POST" },
    );
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error ?? "Rescan fehlgeschlagen.");
      return;
    }
    const d = await res.json();
    setResult(
      `${d.assigned} zugeordnet · ${d.matched} Treffer · ${d.skipped} übersprungen`,
    );
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => rescan(false)}
        disabled={busy}
        className="btn-ghost"
        title={`Buchungen mit "${projectCode}" im Verwendungszweck zuordnen`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{" "}
        Buchungen scannen
      </button>
      {result && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          ✓ {result}
          {" · "}
          <button
            type="button"
            onClick={() => rescan(true)}
            className="underline hover:text-emerald-900"
          >
            erzwingen
          </button>
        </div>
      )}
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}