/**
 * Storage-Adapter für Belege (PDF / .eml / Bilder).
 *
 * Primär: Vercel Blob (`@vercel/blob`). Erfordert `BLOB_READ_WRITE_TOKEN`
 * – wird von Vercel automatisch gesetzt, sobald in der Vercel-Dashboard-
 * Sektion "Storage → Blob" ein Store mit dem Projekt verknüpft ist.
 *
 * Lokaler Fallback (Dev): wenn kein Token gesetzt, schreiben wir in
 * `<projectRoot>/uploads/blob-local/` und liefern eine `file://`-Pseudo-URL.
 * Lokal greift der `/api/attachments/[id]` Stream-Endpunkt direkt auf diese
 * Datei zu (siehe getBlobReadable).
 */
import { put, del } from "@vercel/blob";
import * as fs from "fs/promises";
import * as path from "path";
import { randomBytes } from "crypto";

const LOCAL_DIR = path.join(process.cwd(), "uploads", "blob-local");

export type StoredBlob = {
  /** Eindeutiger Storage-Key (vercel-blob URL ODER lokaler Pfad-Token). */
  storagePath: string;
  /** Größe in Bytes. */
  sizeBytes: number;
  /** MIME-Type, wie übergeben oder erkannt. */
  mimeType: string;
};

function hasVercelBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Lädt einen Buffer in den Storage hoch und gibt einen StoredBlob zurück.
 * `key` wird als Pfad-Präfix verwendet (z. B. "attachments/" oder
 * "mails/<inboxId>/").
 */
export async function uploadBlob(opts: {
  fileName: string;
  mimeType: string;
  data: Buffer | Uint8Array;
  keyPrefix?: string; // z. B. "attachments/", "mails/"
}): Promise<StoredBlob> {
  const { fileName, mimeType, data, keyPrefix = "attachments/" } = opts;
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const id = randomBytes(8).toString("hex");
  const objectKey = `${keyPrefix}${Date.now()}-${id}-${safeName}`;
  const sizeBytes = data.byteLength;

  if (hasVercelBlob()) {
    const result = await put(objectKey, Buffer.from(data), {
      access: "public", // Vercel Blob hat keinen privaten-mit-Auth-Modus;
      // wir verlassen uns auf die zufällige URL als
      // "Capability"; zusätzlich gates der API-Endpunkt
      // /api/attachments/[id] den Zugriff über NextAuth.
      contentType: mimeType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { storagePath: result.url, sizeBytes, mimeType };
  }

  // Lokaler Fallback (Dev/CI)
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const fullPath = path.join(LOCAL_DIR, objectKey.replace(/\//g, "__"));
  await fs.writeFile(fullPath, data);
  return { storagePath: `local://${path.basename(fullPath)}`, sizeBytes, mimeType };
}

/**
 * Liefert die Bytes eines gespeicherten Blobs zurück (für den Stream-Endpunkt).
 */
export async function fetchBlob(storagePath: string): Promise<Buffer> {
  if (storagePath.startsWith("local://")) {
    const name = storagePath.slice("local://".length);
    return fs.readFile(path.join(LOCAL_DIR, name));
  }
  const res = await fetch(storagePath);
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Löscht den Blob (best-effort; Fehler werden geloggt, aber nicht geworfen). */
export async function deleteBlob(storagePath: string): Promise<void> {
  try {
    if (storagePath.startsWith("local://")) {
      const name = storagePath.slice("local://".length);
      await fs.unlink(path.join(LOCAL_DIR, name)).catch(() => {});
      return;
    }
    if (hasVercelBlob()) {
      await del(storagePath, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  } catch (e) {
    console.warn("[blob] delete failed", storagePath, e);
  }
}