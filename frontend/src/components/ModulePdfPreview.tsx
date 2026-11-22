import { useState } from "react";
import { ExternalLink, Eye, EyeOff, FileText, Maximize2, Minimize2 } from "lucide-react";

export type ResolvedModuleLink = {
  kind: "gdrive" | "pdf" | "external";
  originalUrl: string;
  embedUrl: string | null;
};

const SAFE_DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,120}$/;

/**
 * Validates module URLs (https/http only, no embedded credentials or javascript:/data: schemes)
 * and automatically converts Google Drive / Docs links or direct .pdf links into embeddable preview URLs.
 */
export function resolveModulePreview(rawUrl: string | null | undefined): ResolvedModuleLink | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // Google Drive: /file/d/<ID>/view or /file/d/<ID>/edit or /file/d/<ID>/preview
  if (host === "drive.google.com") {
    const fileMatch = path.match(/^\/file\/d\/([^/]+)(?:\/(view|edit|preview))?/i);
    if (fileMatch && SAFE_DRIVE_ID_RE.test(fileMatch[1])) {
      return {
        kind: "gdrive",
        originalUrl: parsed.href,
        embedUrl: `https://drive.google.com/file/d/${fileMatch[1]}/preview`,
      };
    }
    const idParam = parsed.searchParams.get("id");
    if (idParam && SAFE_DRIVE_ID_RE.test(idParam)) {
      return {
        kind: "gdrive",
        originalUrl: parsed.href,
        embedUrl: `https://drive.google.com/file/d/${idParam}/preview`,
      };
    }
  }

  // Google Docs / Slides / Sheets: /<type>/d/<ID>/edit or /view -> /preview
  if (host === "docs.google.com") {
    const docMatch = path.match(/^\/(document|presentation|spreadsheets)\/d\/([^/]+)(?:\/(edit|view|preview))?/i);
    if (docMatch && SAFE_DRIVE_ID_RE.test(docMatch[2])) {
      return {
        kind: "gdrive",
        originalUrl: parsed.href,
        embedUrl: `https://docs.google.com/${docMatch[1].toLowerCase()}/d/${docMatch[2]}/preview`,
      };
    }
  }

  // Direct PDF links
  if (path.toLowerCase().endsWith(".pdf") || parsed.search.toLowerCase().includes(".pdf")) {
    return {
      kind: "pdf",
      originalUrl: parsed.href,
      embedUrl: parsed.href,
    };
  }

  return {
    kind: "external",
    originalUrl: parsed.href,
    embedUrl: null,
  };
}

export function ModulePdfPreview({
  url,
  title,
  defaultExpanded = false,
  dark = false,
}: {
  url: string | null | undefined;
  title: string;
  defaultExpanded?: boolean;
  dark?: boolean;
}) {
  const resolved = resolveModulePreview(url);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [tall, setTall] = useState(false);

  if (!url || !url.trim()) return null;

  if (!resolved) {
    return <p className="mt-2 text-xs font-medium text-rose-700">Tautan modul tidak valid atau tidak aman untuk ditampilkan.</p>;
  }

  const canEmbed = Boolean(resolved.embedUrl);

  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${
        dark ? "border-white/15 bg-slate-950/60 text-slate-200" : "border-slate-200 bg-white/90 text-slate-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText
            size={15}
            className={dark ? "shrink-0 text-sky-300" : "shrink-0 text-indigo-600"}
            aria-hidden="true"
          />
          <span className="truncate text-xs font-bold">
            {resolved.kind === "gdrive"
              ? "Dokumen Google Drive (Pratinjau PDF)"
              : resolved.kind === "pdf"
                ? "Dokumen Modul PDF"
                : "Tautan Lampiran Modul"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canEmbed && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                dark
                  ? "border-sky-400/30 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                  : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              }`}
            >
              {expanded ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
              {expanded ? "Sembunyikan Pratinjau" : "Pratinjau PDF"}
            </button>
          )}

          {canEmbed && expanded && (
            <button
              type="button"
              onClick={() => setTall((prev) => !prev)}
              aria-label={tall ? "Perkecil tampilan PDF" : "Perbesar tampilan PDF"}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                dark
                  ? "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tall ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
            </button>
          )}

          <a
            href={resolved.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              dark
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            <ExternalLink size={13} aria-hidden="true" />
            Buka / Unduh PDF
          </a>
        </div>
      </div>

      {canEmbed && expanded && resolved.embedUrl && (
        <div
          className={`mt-3 overflow-hidden rounded-xl border ${
            dark ? "border-white/15 bg-slate-900" : "border-slate-200 bg-slate-100"
          }`}
        >
          <iframe
            src={resolved.embedUrl}
            title={`Pratinjau PDF: ${title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            allow="fullscreen"
            className={`w-full border-0 transition-all ${tall ? "h-[72vh] min-h-[560px]" : "h-[460px] sm:h-[520px]"}`}
          />
        </div>
      )}
    </div>
  );
}
