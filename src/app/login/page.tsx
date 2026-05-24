"use client";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { RotaryLogo } from "@/components/RotaryLogo";
import { Loader2, ArrowRight } from "lucide-react";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("treasurer@wien-donau.at");
  const [password, setPassword] = useState("Treasurer!2025");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
      return;
    }
    router.push(callback);
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: hero */}
      <div className="rotary-hero relative hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 rotary-hero-overlay opacity-50" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <RotaryLogo size={42} />
            <div>
              <div className="text-xs uppercase tracking-widest opacity-80">Rotary Club</div>
              <div className="text-2xl font-bold">Wien-Donau</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-md fade-up">
          <div className="text-amber-300 text-sm font-semibold uppercase tracking-widest mb-2">
            Service Above Self
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Finanzverwaltung des Rotary Clubs Wien-Donau
          </h1>
          <p className="text-white/80 leading-relaxed">
            Hauptkonto und Global-Grant-Treuhand, Mitgliedsbeiträge, Forderungen,
            Mahnwesen, Budget &amp; Liquiditätsplanung – alles an einem Ort.
          </p>
        </div>
        <div className="relative z-10 text-white/60 text-sm">
          Distrikt 1910 · Schatzmeisterei
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md fade-up">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <RotaryLogo size={36} />
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Rotary Club</div>
              <div className="text-xl font-bold">Wien-Donau</div>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Anmelden</h2>
          <p className="text-slate-500 mb-8">Bitte mit Ihrem Zugang einloggen.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">E-Mail</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Passwort</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Anmelden
            </button>
          </form>

          <div className="mt-8 text-xs text-slate-500 border-t pt-6">
            <div className="font-semibold text-slate-700 mb-2">Demo-Zugänge</div>
            <div className="space-y-1 font-mono">
              <div>Schatzmeister: <span className="text-slate-700">treasurer@wien-donau.at</span> / <span className="text-slate-700">Treasurer!2025</span></div>
              <div>Präsident: <span className="text-slate-700">praesident@wien-donau.at</span> / <span className="text-slate-700">President!2025</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginInner />
    </Suspense>
  );
}