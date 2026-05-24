import { prisma } from "@/lib/prisma";
import { authOptions, isTreasurer } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UsersAdmin } from "./UsersAdmin";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) redirect("/dashboard");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="max-w-3xl fade-up space-y-5">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="size-6 text-blue-800" /> Benutzerverwaltung</h1>
        <p className="text-slate-500 text-sm">Schatzmeister kann Präsidenten als Lesezugriff anlegen.</p>
      </header>
      <UsersAdmin users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role }))} />
    </div>
  );
}