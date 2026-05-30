import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions, canRead } from "@/lib/auth";

/**
 * GET /api/mail-inbox/:id/body
 *
 * Liefert HTML- oder Text-Body der Mail. Wird vom Modal in AttachmentsPanel
 * in einem sandboxed iframe angezeigt – externe Ressourcen sind durch das
 * leere `sandbox=""`-Attribut blockiert (kein JS, kein Bild-Load von extern).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!canRead(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const inbox = await prisma.mailInbox.findUnique({ where: { id } });
  if (!inbox) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (inbox.htmlBody) {
    // HTML wird sandbox-isoliert ausgeliefert; CSS bleibt erhalten.
    const html = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;color:#111;padding:12px;line-height:1.45}img{max-width:100%}</style></head><body>${inbox.htmlBody}</body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  const text = inbox.textBody ?? "(keine Mail-Inhalte verfügbar)";
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:12px;white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}