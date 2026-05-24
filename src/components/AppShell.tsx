"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { RotaryLogo } from "./RotaryLogo";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  Users,
  Wallet,
  TrendingUp,
  PieChart,
  Archive,
  LogOut,
  ListChecks,
  Mail,
  Settings,
  Banknote,
  Menu,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  treasurerOnly?: boolean;
};

const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Buchungen", icon: Receipt },
  { href: "/import", label: "Bank-Import (George)", icon: Upload, treasurerOnly: true },
  { href: "/members", label: "Mitglieder", icon: Users },
  { href: "/dues", label: "Beiträge & Mahnungen", icon: Mail },
  { href: "/attendance", label: "Auslagen / Teilnahmelisten", icon: ListChecks },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/cashflow", label: "Liquiditätsplanung", icon: TrendingUp },
  { href: "/reports", label: "Vergleichscharts", icon: PieChart },
  { href: "/archive", label: "Archiv & Clubjahre", icon: Archive },
  { href: "/settings/users", label: "Benutzer", icon: Settings, treasurerOnly: true },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isTreasurer = role === "treasurer" || role === "admin";
  const items = NAV.filter((n) => !n.treasurerOnly || isTreasurer);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  const sidebarInner = (
    <>
      <div className="absolute inset-0 rotary-hero-overlay opacity-30 pointer-events-none" />
      <div className="relative z-10 px-4 sm:px-5 pt-4 pb-4 flex items-center justify-between gap-3 border-b border-white/10 safe-top">
        <div className="flex items-center gap-3 min-w-0">
          <RotaryLogo size={36} />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-white/70">Rotary Club</div>
            <div className="font-bold text-lg leading-tight truncate">Wien-Donau</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Menü schließen"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-white/80 hover:text-white p-2 -mr-2 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {items.map((n) => {
          const Icon = n.icon;
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`sidebar-link ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="relative z-10 px-4 py-3 border-t border-white/10 text-xs text-white/60 safe-bottom">
        <div className="flex items-center gap-2">
          <Banknote className="size-3.5 shrink-0" />
          <span>Distrikt 1910 · 2025/2026</span>
        </div>
        <div className="mt-1">Service Above Self</div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#f7f8fb]">
      {/* Desktop sidebar — sticky, always visible from lg upward */}
      <aside
        className="hidden lg:flex w-72 shrink-0 sticky top-0 self-start h-screen flex-col rotary-hero text-white"
        aria-label="Hauptnavigation"
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-[85%] max-w-[320px] h-full flex flex-col rotary-hero text-white shadow-2xl slide-in-left">
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="bg-white/95 border-b border-slate-200 sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/85 safe-top"
        >
          <div className="px-3 sm:px-5 lg:px-8 h-14 flex items-center justify-between gap-3">
            {/* Mobile: menu button + logo */}
            <div className="flex items-center gap-2 min-w-0 lg:hidden">
              <button
                type="button"
                aria-label="Menü öffnen"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className="p-2 -ml-2 rounded-md text-slate-700 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Menu className="size-5" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <RotaryLogo size={26} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 leading-none">Rotary</div>
                  <div className="font-bold text-sm text-slate-900 truncate">Wien-Donau</div>
                </div>
              </div>
            </div>

            {/* Desktop breadcrumb */}
            <div className="hidden lg:flex items-center gap-3 text-sm min-w-0">
              <span className="font-semibold text-slate-800">Schatzmeisterei</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 truncate">{currentPageLabel(pathname)}</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="text-right text-xs leading-tight hidden sm:block">
                <div className="font-semibold text-slate-800 max-w-[160px] truncate">
                  {session?.user?.name ?? "—"}
                </div>
                <div className="text-slate-500 capitalize">
                  {role === "treasurer" ? "Schatzmeister" : role === "president" ? "Präsident" : role}
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="btn-ghost text-sm px-2.5 sm:px-3"
                aria-label="Abmelden"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </div>
          </div>

          {/* Mobile breadcrumb on second row */}
          <div className="lg:hidden px-3 pb-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span>Schatzmeisterei</span>
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium truncate">{currentPageLabel(pathname)}</span>
          </div>
        </header>

        <main className="flex-1 px-3 sm:px-5 lg:px-8 py-4 sm:py-6 safe-bottom">
          {children}
        </main>
      </div>
    </div>
  );
}

function currentPageLabel(pathname: string) {
  const item = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return item?.label ?? "";
}