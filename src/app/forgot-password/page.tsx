"use client";
import { useState } from "react";
import Link from "next/link";
import { RotaryLogo } from "@/components/RotaryLogo";
import { Loader2, ArrowRight, MailCheck, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
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
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                <MailCheck className="size-6" />
              </div>
              <h1 className="text-xl font-bold mb-2">E-Mail unterwegs</h1>
              <p className="text-slate-600 text-sm mb-6">
                Falls ein Konto mit dieser E-Mail existiert, haben wir einen Link zum
                Zurücksetzen des Passworts gesendet. Der Link ist 60&nbsp;Minuten gültig.
              </p>
              <Link href="/login" className="btn-ghost w-full justify-center">
                <ArrowLeft className="size-4" /> Zurück zur Anmeldung
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1">Passwort vergessen?</h1>
              <p className="text-slate-500 text-sm mb-6">
                Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum
                Zurücksetzen.
              </p>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="fp-email" className="text-sm font-medium text-slate-700 mb-1 block">
                    E-Mail
                  </label>
                  <input
                    id="fp-email"
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
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Link senden
                </button>
              </form>
              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-blue-800 hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="size-3.5" /> Zurück zur Anmeldung
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}