"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { RotaryLogo } from "./RotaryLogo";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  Users,
  FileText,
  Wallet,
  TrendingUp,
  PieChart,
  Archive,
  LogOut,
  ListChecks,
  Mail,
  Settings,
  Banknote,
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
  { href: "/dues", label: "Mitgliedsbeiträge & Mahnungen", icon: Mail },
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

  return (
    <div className="min-h-screen flex bg-[#f7f8fb]">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 sticky top-0 self-start h-screen flex flex-col rotary-hero text-white">
        <div className="absolute inset-0 rotary-hero-overlay opacity-30 pointer-events-none" />
        <div className="relative z-10 px-5 py-6 flex items-center gap-3 border-b border-white/10">
          <RotaryLogo size={36} />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-white/70">Rotary Club</div>
            <div className="font-bold text-lg">Wien-Donau</div>
          </div>
        </div>
        <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {items.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} className={`sidebar-link ${active ? "active" : ""}`}>
                <Icon className="size-4 shrink-0" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="relative z-10 px-4 py-4 border-t border-white/10 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <Banknote className="size-3.5" />
            <span>Distrikt 1910 · 2025/2026</span>
          </div>
          <div className="mt-1">Service Above Self</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-slate-800">Schatzmeisterei</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{currentPageLabel(pathname)}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs leading-tight">
                <div className="font-semibold text-slate-800">{session?.user?.name ?? "—"}</div>
                <div className="text-slate-500 capitalize">
                  {role === "treasurer" ? "Schatzmeister" : role === "president" ? "Präsident" : role}
                </div>
              </div>
              <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-ghost text-sm">
                <LogOut className="size-4" />
                Abmelden
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

function currentPageLabel(pathname: string) {
  const item = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return item?.label ?? "";
}