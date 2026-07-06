"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotaryLogo } from "@/components/RotaryLogo";
import { Loader2, ArrowRight, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      return;
    }
    fetch(`/api/password/reset?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        setTokenValid(Boolean(j?.valid));
      })
      .catch(() => active && setTokenValid(false))
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2200);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Passwort konnte nicht gesetzt werden.");
      if (res.status === 410) setTokenValid(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10 safe-top safe-bottom">
      <div className="w-full max-w-md fade-up">
        <div className="flex items-center gap-3 mb-6">
          <RotaryLogo size={40} />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Rotary Club</div>
            <div className="text-xl font-bold text-slate-900">Wien-Donau</div>
          </div>
        </div>

        <div className="card-soft p-6 sm:p-8">
          {checking ? (
            <div className="flex items-center gap-3 text-slate-500 text-sm justify-center py-6">
              <Loader2 className="size-5 animate-spin" /> Link wird geprüft …
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="size-6" />
              </div>
              <h1 className="text-xl font-bold mb-2">Passwort geändert</h1>
              <p className="text-slate-600 text-sm mb-6">
                Ihr Passwort wurde gesetzt. Sie werden zur Anmeldung weitergeleitet …
              </p>
              <Link href="/login" className="btn-primary w-full justify-center">
                Zur Anmeldung <ArrowRight className="size-4" />
              </Link>
            </div>
          ) : !tokenValid ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="size-6" />
              </div>
              <h1 className="text-xl font-bold mb-2">Link ungültig oder abgelaufen</h1>
              <p className="text-slate-600 text-sm mb-6">
                Dieser Link ist nicht mehr gültig. Bitte fordern Sie einen neuen Link an.
              </p>
              <Link href="/forgot-password" className="btn-primary w-full justify-center">
                Neuen Link anfordern <ArrowRight className="size-4" />
              </Link>
              <div className="mt-4">
                <Link href="/login" className="text-sm text-blue-800 hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="size-3.5" /> Zurück zur Anmeldung
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1">Neues Passwort vergeben</h1>
              <p className="text-slate-500 text-sm mb-6">Mindestens 8 Zeichen.</p>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="rp-pw" className="text-sm font-medium text-slate-700 mb-1 block">
                    Neues Passwort
                  </label>
                  <input
                    id="rp-pw"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label htmlFor="rp-pw2" className="text-sm font-medium text-slate-700 mb-1 block">
                    Passwort wiederholen
                  </label>
                  <input
                    id="rp-pw2"
                    type="password"
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                {error && (
                  <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
                    {error}
                  </div>
                )}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Passwort speichern
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div />}>
      <ResetInner />
    </Suspense>
  );
}