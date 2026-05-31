import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isTreasurer } from "@/lib/auth";
import { collectTreasurerReport } from "@/lib/treasurerReport";
import { buildTreasurerExcel } from "@/lib/treasurerReport/excel";
import { buildTreasurerPptx } from "@/lib/treasurerReport/pptx";
import { buildTreasurerPdf } from "@/lib/treasurerReport/pdf";

// PDF-Generierung kann je nach Buchungs-Volumen länger dauern
export const maxDuration = 60;
// Hot-Reload + große Buffer: kein Caching
export const dynamic = "force-dynamic";

const ALLOWED_FORMATS = ["pdf", "pptx", "xlsx"] as const;
type Format = (typeof ALLOWED_FORMATS)[number];

const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * GET /api/reports/treasurer?format=pdf|pptx|xlsx&year=<clubYearId>&inline=1
 *
 * Liefert den Schatzmeister-(Zwischen-)Abschluss als Datei zurück.
 *
 * Query:
 *  - format: pdf | pptx | xlsx (Pflicht)
 *  - year:   ClubYear-ID (Pflicht; UI liefert immer aktuelle ID mit)
 *  - inline: wenn "1" → Content-Disposition inline (sonst attachment Download)
 *
 * Auth: Schatzmeister oder Auditor (isTreasurer akzeptiert beide)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isTreasurer(session?.user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") as Format | null;
  const year = url.searchParams.get("year");
  const inline = url.searchParams.get("inline") === "1";

  if (!format || !ALLOWED_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `Ungültiges format. Erwartet: ${ALLOWED_FORMATS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!year) {
    return NextResponse.json({ error: "Query-Parameter 'year' fehlt" }, { status: 400 });
  }

  let report;
  try {
    report = await collectTreasurerReport({
      clubYearId: year,
      generatedBy: session?.user?.email ?? session?.user?.name ?? null,
      asOf: new Date(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bericht konnte nicht erzeugt werden.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    if (format === "xlsx") buffer = await buildTreasurerExcel(report);
    else if (format === "pptx") buffer = await buildTreasurerPptx(report);
    else buffer = await buildTreasurerPdf(report);
  } catch (e) {
    console.error("[treasurer-report]", format, "build failed:", e);
    const msg = e instanceof Error ? e.message : "Datei konnte nicht erzeugt werden.";
    return NextResponse.json({ error: msg, format }, { status: 500 });
  }

  const safeYear = report.clubYear.label.replace(/[^\w.-]+/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const kind = report.isInterim ? "Zwischenabschluss" : "Jahresabschluss";
  const filename = `RC-Wien-Donau_${kind}_${safeYear}_${dateStr}.${format}`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.byteLength),
    },
  });
}