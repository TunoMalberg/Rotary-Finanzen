"use client";
import {
  AlertTriangle,
  Check,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Year = { id: string; label: string };
type Cat = {
  id: string;
  name: string;
  kind: string;
  color: string;
  sortOrder: number;
  isDuesCategory: boolean;
  clubYearId: string | null;
  clubYearLabel: string | null;
  txCount: number;
  budgetCount: number;
};

const PRESET_COLORS = [
  "#17458F",
  "#0099CC",
  "#00A28A",
  "#7B2D8E",
  "#D41367",
  "#F7A81B",
  "#E07B00",
  "#5A8DEE",
  "#888888",
  "#3CA9C8",
  "#7C5E2A",
];

export function CategoriesClient({
  years,
  categories,
}: {
  years: Year[];
  categories: Cat[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<string>("__GLOBAL__"); // "__GLOBAL__" or year.id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New form
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "NEUTRAL">("EXPENSE");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const filtered = useMemo(() => {
    if (scope === "__GLOBAL__")
      return categories.filter((c) => c.clubYearId === null);
    return categories.filter((c) => c.clubYearId === scope);
  }, [categories, scope]);

  const grouped = useMemo(() => {
    return {
      INCOME: filtered.filter((c) => c.kind === "INCOME"),
      EXPENSE: filtered.filter((c) => c.kind === "EXPENSE"),
      NEUTRAL: filtered.filter((c) => c.kind === "NEUTRAL"),
    };
  }, [filtered]);

  async function createCategory() {
    if (!name.trim()) {
      setError("Name fehlt");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          color,
          clubYearId: scope === "__GLOBAL__" ? null : scope,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Erstellen fehlgeschlagen");
      }
      setName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(
    c: Cat,
    patch: { name?: string; kind?: string; color?: string },
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Speichern fehlgeschlagen");
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(c: Cat) {
    if (c.txCount > 0 || c.budgetCount > 0) {
      alert(
        `Kategorie wird noch verwendet:\n· ${c.txCount} Buchung(en)\n· ${c.budgetCount} Budgetzeile(n)\n\nBitte zuerst die Zuordnungen ändern.`,
      );
      return;
    }
    if (
      !confirm(
        `Kategorie "${c.name}"${c.clubYearId ? ` (${c.clubYearLabel})` : " (global)"} wirklich löschen?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const force = c.clubYearId === null ? "?force=1" : "";
      const res = await fetch(`/api/categories/${c.id}${force}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Löschen fehlgeschlagen");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Scope-Auswahl */}
      <div className="card-soft p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase font-semibold text-slate-600 mr-1">
          Kategorien für:
        </span>
        <button
          type="button"
          onClick={() => setScope("__GLOBAL__")}
          aria-pressed={scope === "__GLOBAL__"}
          className={`chip inline-flex items-center gap-1 ${
            scope === "__GLOBAL__" ? "" : "opacity-50"
          }`}
          style={{
            background: scope === "__GLOBAL__" ? "#17458F1A" : "#F1F5F9",
            color: "#17458F",
            minHeight: 32,
            padding: "0.3rem 0.75rem",
          }}
        >
          <Globe className="size-3.5" /> Global
        </button>
        {years.map((y) => (
          <button
            key={y.id}
            type="button"
            onClick={() => setScope(y.id)}
            aria-pressed={scope === y.id}
            className={`chip ${scope === y.id ? "" : "opacity-50"}`}
            style={{
              background: scope === y.id ? "#F7A81B1A" : "#F1F5F9",
              color: "#7C5E2A",
              minHeight: 32,
              padding: "0.3rem 0.75rem",
            }}
          >
            {y.label}
          </button>
        ))}
      </div>

      {/* New form */}
      <div className="card-soft p-3 sm:p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="size-4" />
          Neue Kategorie{" "}
          {scope === "__GLOBAL__"
            ? "(Global)"
            : `für ${years.find((y) => y.id === scope)?.label}`}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">
              Name
            </label>
            <input
              className="input"
              placeholder="z. B. Weihnachtsaktion 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCategory();
              }}
              maxLength={60}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">
              Art
            </label>
            <select
              className="input"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "INCOME" | "EXPENSE" | "NEUTRAL")
              }
            >
              <option value="EXPENSE">Ausgaben</option>
              <option value="INCOME">Einnahmen</option>
              <option value="NEUTRAL">Neutral</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">
              Farbe
            </label>
            <div className="flex flex-wrap gap-1 max-w-[230px]">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-md border-2 ${color === c ? "border-slate-800" : "border-transparent"}`}
                  style={{ background: c }}
                  aria-label={`Farbe ${c}`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={createCategory}
            disabled={busy || !name.trim()}
            className="btn-primary"
            style={{ minHeight: 40 }}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Anlegen
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm p-2 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CatGroup
          title="Einnahmen"
          icon={<TrendingUp className="size-4 text-emerald-700" />}
          items={grouped.INCOME}
          onDelete={deleteCategory}
          onUpdate={updateCategory}
          busy={busy}
        />
        <CatGroup
          title="Ausgaben"
          icon={<TrendingDown className="size-4 text-rose-700" />}
          items={grouped.EXPENSE}
          onDelete={deleteCategory}
          onUpdate={updateCategory}
          busy={busy}
        />
        {grouped.NEUTRAL.length > 0 && (
          <CatGroup
            title="Neutral"
            icon={<Globe className="size-4 text-slate-500" />}
            items={grouped.NEUTRAL}
            onDelete={deleteCategory}
            onUpdate={updateCategory}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}

function CatGroup({
  title,
  icon,
  items,
  onDelete,
  onUpdate,
  busy,
}: {
  title: string;
  icon: React.ReactNode;
  items: Cat[];
  onDelete: (c: Cat) => void;
  onUpdate: (
    c: Cat,
    patch: { name?: string; kind?: string; color?: string },
  ) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <div className="card-soft overflow-hidden">
      <div className="px-4 py-3 border-b font-semibold flex items-center gap-2 bg-slate-50">
        {icon} {title}{" "}
        <span className="ml-auto text-xs font-normal text-slate-500">
          {items.length} {items.length === 1 ? "Kategorie" : "Kategorien"}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-400 text-center">
          Keine Kategorien.
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((c) => (
            <CatRow
              key={c.id}
              cat={c}
              onDelete={onDelete}
              onUpdate={onUpdate}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CatRow({
  cat,
  onDelete,
  onUpdate,
  busy,
}: {
  cat: Cat;
  onDelete: (c: Cat) => void;
  onUpdate: (
    c: Cat,
    patch: { name?: string; kind?: string; color?: string },
  ) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "NEUTRAL">(
    cat.kind as "INCOME" | "EXPENSE" | "NEUTRAL",
  );
  const [color, setColor] = useState(cat.color);
  const [savingLocal, setSavingLocal] = useState(false);

  const used = cat.txCount > 0 || cat.budgetCount > 0;
  const isGlobal = cat.clubYearId === null;

  function startEdit() {
    setName(cat.name);
    setKind(cat.kind as "INCOME" | "EXPENSE" | "NEUTRAL");
    setColor(cat.color);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const patch: { name?: string; kind?: string; color?: string } = {};
    if (trimmed !== cat.name) patch.name = trimmed;
    if (kind !== cat.kind) patch.kind = kind;
    if (color !== cat.color) patch.color = color;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSavingLocal(true);
    const ok = await onUpdate(cat, patch);
    setSavingLocal(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <li className="px-4 py-3 bg-blue-50/40 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            autoFocus
            className="input flex-1 min-w-[160px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancelEdit();
            }}
            maxLength={60}
            placeholder="Name"
          />
          <select
            className="input w-auto"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "INCOME" | "EXPENSE" | "NEUTRAL")
            }
          >
            <option value="EXPENSE">Ausgaben</option>
            <option value="INCOME">Einnahmen</option>
            <option value="NEUTRAL">Neutral</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-600 font-semibold">Farbe:</span>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 rounded-md border-2 ${
                  color.toLowerCase() === c.toLowerCase()
                    ? "border-slate-800"
                    : "border-transparent"
                }`}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded"
            aria-label="Eigene Farbe"
          />
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savingLocal}
              className="btn-ghost text-xs px-2 py-1"
              title="Abbrechen"
            >
              <X className="size-3.5" /> Abbrechen
            </button>
            <button
              type="button"
              onClick={save}
              disabled={savingLocal || busy || !name.trim()}
              className="btn-primary text-xs px-3 py-1.5"
              title="Speichern"
            >
              {savingLocal ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}{" "}
              Speichern
            </button>
          </div>
        </div>
        {cat.isDuesCategory && (
          <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>
              Dies ist die Mitgliedsbeitrags-Kategorie. Eine Änderung der Art
              kann die automatische Erkennung beeinflussen – nur ändern, wenn du
              dir sicher bist.
            </span>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      <span
        className="size-3.5 rounded shrink-0"
        style={{ background: cat.color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1.5">
          {cat.name}
          {cat.isDuesCategory && (
            <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1 py-0.5 rounded">
              Mitgliedsbeitrag
            </span>
          )}
          {isGlobal ? (
            <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
              <Globe className="size-2.5" /> global
            </span>
          ) : (
            <span className="text-[10px] text-amber-600">
              · {cat.clubYearLabel}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {cat.txCount} {cat.txCount === 1 ? "Buchung" : "Buchungen"}
          {cat.budgetCount > 0
            ? ` · ${cat.budgetCount} Budgetzeile${cat.budgetCount === 1 ? "" : "n"}`
            : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={startEdit}
        disabled={busy}
        title="Kategorie bearbeiten"
        className="p-1.5 rounded-md text-slate-400 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(cat)}
        disabled={busy || used}
        title={
          used
            ? "Kategorie wird verwendet – kann nicht gelöscht werden"
            : isGlobal
              ? "Globale Kategorie löschen"
              : "Jahres-Kategorie löschen"
        }
        className="p-1.5 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
      >
        {used ? <Lock className="size-4" /> : <Trash2 className="size-4" />}
      </button>
    </li>
  );
}
