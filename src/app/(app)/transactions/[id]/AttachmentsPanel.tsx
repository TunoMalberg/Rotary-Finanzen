"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Mail,
  Trash2,
  Download,
  ExternalLink,
} from "lucide-react";

export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  uploadedAt: string;
  source: "LEGACY" | "UPLOAD" | "MAIL_AUTO" | "MAIL_MANUAL";
  mailInbox: {
    id: string;
    fromAddress: string;
    fromName: string | null;
    subject: string | null;
    receivedAt: string;
  } | null;
};

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} kB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime === "message/rfc822") return Mail;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  return Paperclip;
}

export function AttachmentsPanel({
  transactionId,
  initial,
  canEdit,
}: {
  transactionId: string;
  initial: AttachmentItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewMail, setPreviewMail] = useState<AttachmentItem["mailInbox"] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/transactions/${transactionId}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Upload fehlgeschlagen.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(att: AttachmentItem) {
    if (!confirm(`Beleg "${att.fileName}" wirklich entfernen?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/transactions/${transactionId}/attachments/${att.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Löschen fehlgeschlagen.");
      setItems((prev) => prev.filter((x) => x.id !== att.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Paperclip className="size-4 text-blue-800" />
          Belege & Original-Mails
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          PDF-Rechnungen, .eml-Mails (per „Speichern unter" aus Outlook/Gmail
          exportiert), Quittungs-Fotos. Mehrere Dateien gleichzeitig erlaubt.
        </p>
      </div>

      {canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
          }}
          className={`mx-4 sm:mx-5 my-3 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 hover:border-slate-400 bg-slate-50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.eml,.msg,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 text-blue-800 font-medium hover:underline disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Datei(en) wählen
          </button>
          <span className="text-slate-500"> oder per Drag & Drop hier ablegen</span>
          <div className="text-[11px] text-slate-400 mt-1">
            PDF · JPG/PNG · .eml/.msg — max. 25 MB pro Datei
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 sm:mx-5 mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-2">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="px-4 sm:px-5 py-6 text-sm text-slate-500 text-center">
          Noch keine Belege hinterlegt.
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((a) => {
            const Icon = iconFor(a.mimeType);
            return (
              <li
                key={a.id}
                className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <Icon className="size-5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.fileName}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{fmtSize(a.sizeBytes)}</span>
                    <span>·</span>
                    <span>
                      {a.kind === "EMAIL"
                        ? "E-Mail"
                        : a.kind === "INVOICE"
                          ? "Rechnung"
                          : a.kind === "RECEIPT"
                            ? "Quittung"
                            : "Beleg"}
                    </span>
                    {a.mailInbox && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setPreviewMail(a.mailInbox)}
                          className="text-blue-800 hover:underline inline-flex items-center gap-0.5"
                        >
                          aus Mail von{" "}
                          <strong>{a.mailInbox.fromName ?? a.mailInbox.fromAddress}</strong>
                        </button>
                      </>
                    )}
                    {a.source === "MAIL_AUTO" && (
                      <span className="chip chip-active">automatisch</span>
                    )}
                  </div>
                </div>
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener"
                  className="btn-ghost px-2 py-1 text-xs"
                  title="In neuem Tab öffnen"
                >
                  <ExternalLink className="size-3.5" />
                </a>
                <a
                  href={`/api/attachments/${a.id}?download=1`}
                  className="btn-ghost px-2 py-1 text-xs"
                  title="Herunterladen"
                >
                  <Download className="size-3.5" />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    className="btn-ghost px-2 py-1 text-xs text-red-700"
                    title="Beleg entfernen"
                    disabled={busy}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {previewMail && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPreviewMail(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Original-Mail</h3>
            <div className="text-sm space-y-1 mb-3 border-b pb-3">
              <div>
                <strong>Von:</strong>{" "}
                {previewMail.fromName
                  ? `${previewMail.fromName} <${previewMail.fromAddress}>`
                  : previewMail.fromAddress}
              </div>
              <div>
                <strong>Empfangen:</strong>{" "}
                {new Date(previewMail.receivedAt).toLocaleString("de-AT")}
              </div>
              <div>
                <strong>Betreff:</strong> {previewMail.subject ?? "—"}
              </div>
            </div>
            <iframe
              src={`/api/mail-inbox/${previewMail.id}/body`}
              className="w-full h-[400px] border rounded"
              sandbox=""
              title="Mail-Body"
            />
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={() => setPreviewMail(null)}
                className="btn-primary"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}