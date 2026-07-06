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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-white">
      {/* Hero — full hero on desktop, compact banner on mobile */}
      <div className="rotary-hero relative flex flex-col justify-between p-6 sm:p-10 lg:p-12 text-white safe-top">
        <div className="absolute inset-0 rotary-hero-overlay opacity-50" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <RotaryLogo size={40} />
            <div>
              <div className="text-[11px] sm:text-xs uppercase tracking-widest opacity-80">Rotary Club</div>
              <div className="text-xl sm:text-2xl font-bold">Wien-Donau</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-md fade-up mt-6 lg:mt-12">
          <div className="text-amber-300 text-xs sm:text-sm font-semibold uppercase tracking-widest mb-2">
            Service Above Self
          </div>
          <h1 className="font-bold leading-tight mb-3 sm:mb-4 text-2xl sm:text-3xl lg:text-4xl">
            Finanzverwaltung des Rotary&nbsp;Clubs Wien-Donau
          </h1>
          <p className="text-white/85 leading-relaxed text-sm sm:text-base hidden sm:block">
            Hauptkonto und Global-Grant-Treuhand, Mitgliedsbeiträge, Forderungen,
            Mahnwesen, Budget &amp; Liquiditätsplanung – alles an einem Ort.
          </p>
        </div>
        <div className="relative z-10 text-white/60 text-xs sm:text-sm mt-6 lg:mt-0 hidden sm:block">
          Distrikt 1910 · Schatzmeisterei
        </div>
      </div>

      {/* Form */}
      <div className="flex items-start lg:items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-10 bg-white safe-bottom">
        <div className="w-full max-w-md fade-up">
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Anmelden</h2>
          <p className="text-slate-500 mb-6 sm:mb-8 text-sm sm:text-base">Bitte mit Ihrem Zugang einloggen.</p>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="text-sm font-medium text-slate-700 mb-1 block">E-Mail</label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Passwort</label>
                <a href="/forgot-password" className="text-xs text-blue-800 hover:underline">Passwort vergessen?</a>
              </div>
              <input
                id="login-password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Anmelden
            </button>
          </form>

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