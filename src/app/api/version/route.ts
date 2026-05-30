import { NextResponse } from "next/server";

/**
 * Diagnose-Endpoint: liefert den aktuell deployten Build-Marker.
 * Wird genutzt, um zu prüfen, ob ein Vercel-Auto-Deploy korrekt durchgegangen ist.
 */
export function GET() {
  return NextResponse.json({
    build: "2287b56-bankimport-george-xlsx",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "(unknown)",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "(unknown)",
    deployedAt: new Date().toISOString(),
    features: {
      bankImport_eingehenderAusgehender: true,
      bankImport_aiFallback: !!process.env.OPENAI_API_KEY,
    },
  });
}