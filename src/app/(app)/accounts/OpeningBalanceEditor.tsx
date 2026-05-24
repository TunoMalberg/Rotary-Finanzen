"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

export function OpeningBalanceEditor({
  yearId,
  yearLabel,
  accountType,
  currentValue,
}: {
  yearId: string;
  yearLabel: string;
  accountType: "MAIN" | "GLOBAL_GRANT_TRUST";
  currentValue: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentValue.toFixed(2).replace(".", ","));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const num = Number(val.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(num)) {
      setErr("Ungültige Zahl");
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/clubyears/${yearId}/opening`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountType,
        value: num,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || `HTTP ${res.status}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost text-xs px-2.5 py-1.5"
        style={{ minHeight: 32 }}
        onClick={() => setOpen(true)}
        title="Eröffnungssaldo bearbeiten"
      >
        <Pencil className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-stretch min-w-[200px]">
      <label className="text-[11px] text-slate-500 font-semibold">
        Eröffnungssaldo {yearLabel} ·{" "}
        {accountType === "MAIN" ? "Haupt" : "GG"}
      </label>
      <div className="flex gap-1.5">
        <input
          autoFocus
          className="input flex-1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setOpen(false);
          }}
          inputMode="decimal"
        />
        <button
          type="button"
          className="btn-primary text-xs px-2.5 py-1.5"
          style={{ minHeight: 32 }}
          onClick={save}
          disabled={busy}
        >
          OK
        </button>
        <button
          type="button"
          className="btn-ghost text-xs px-2.5 py-1.5"
          style={{ minHeight: 32 }}
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          ✕
        </button>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}
    </div>
  );
}