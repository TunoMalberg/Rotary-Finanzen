import { prisma } from "@/lib/prisma";
import { authOptions, canRead } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { formatEUR, formatDate } from "@/lib/format";
import { findMatchCandidates } from "@/lib/mailMatch";
import { InboxTable } from "./InboxTable";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getServerSession(authOptions);
  if (!canRead(session?.user?.role)) redirect("/login");

  const inbox = await prisma.mailInbox.findMany({
    where: { status: "UNMATCHED" },
    include: {
      attachments: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  // Top-3 Kandidaten pro Mail vorberechnen
  const rows = await Promise.all(
    inbox.map(async (m) => {
      const cands = await findMatchCandidates(
        {
          amount: m.extractedAmount,
          iban: m.extractedIban,
          invoiceNumber: m.extractedInvNo,
          fromAddress: m.fromAddress,
          fromName: m.fromName,
          receivedAt: m.receivedAt,
        },
        3,
      );
      return {
        id: m.id,
        from: m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress,
        subject: m.subject ?? "(kein Betreff)",
        receivedAt: m.receivedAt.toISOString(),
        extractedAmount: m.extractedAmount,
        extractedIban: m.extractedIban,
        extractedInvNo: m.extractedInvNo,
        attachments: m.attachments,
        candidates: cands.map((c) => ({
          transactionId: c.transactionId,
          score: c.score,
          reasons: c.reasons,
          label: `${formatDate(c.date.toISOString())} · ${formatEUR(c.amount)} · ${
            c.counterparty ?? c.purpose ?? "—"
          }`,
        })),
      };
    }),
  );

  const recentlyMatched = await prisma.mailInbox.findMany({
    where: { status: "MATCHED" },
    include: { matchedTx: true, attachments: true },
    orderBy: { matchedAt: "desc" },
    take: 10,
  });

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Belege-Eingang</h1>
        <p className="text-sm text-slate-500">
          Mails, die per Weiterleitung an die Inbound-Adresse geschickt wurden,
          aber noch keiner Buchung eindeutig zugeordnet werden konnten.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card-soft p-6 text-center text-sm text-slate-500">
          Keine offenen Mails. 🎉
        </div>
      ) : (
        <InboxTable rows={rows} />
      )}

      <div>
        <h2 className="text-base font-semibold mb-2">
          Zuletzt automatisch zugeordnet
        </h2>
        {recentlyMatched.length === 0 ? (
          <div className="card-soft p-4 text-sm text-slate-500">
            Noch keine automatischen Zuordnungen.
          </div>
        ) : (
          <ul className="card-soft divide-y">
            {recentlyMatched.map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="font-medium">
                    {m.fromName ?? m.fromAddress}
                  </span>
                  <span className="text-slate-500">— {m.subject ?? "—"}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {formatDate(m.receivedAt.toISOString())}
                  </span>
                </div>
                {m.matchedTx && (
                  <div className="text-xs mt-0.5">
                    →{" "}
                    <a
                      href={`/transactions/${m.matchedTx.id}`}
                      className="text-blue-800 underline"
                    >
                      {formatDate(m.matchedTx.date.toISOString())} ·{" "}
                      {formatEUR(m.matchedTx.amount)} ·{" "}
                      {m.matchedTx.counterparty ?? "—"}
                    </a>
                    {m.matchConfidence != null && (
                      <span className="ml-2 text-slate-500">
                        Konfidenz {Math.round(m.matchConfidence * 100)}%
                      </span>
                    )}
                    {m.attachments.length > 0 && (
                      <span className="ml-2 text-slate-500">
                        · {m.attachments.length} Anhang/Anhänge
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}