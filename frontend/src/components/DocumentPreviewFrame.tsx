import { ExternalLink } from "lucide-react";
import { classifySafePreviewUrl } from "../utils/safeUrl";

export function DocumentPreviewFrame({
  url,
  title = "Pratinjau Dokumen",
  heightClass = "h-64",
  emptyText = "Berkas belum dilampirkan.",
}: {
  url: string | null | undefined;
  title?: string;
  heightClass?: string;
  emptyText?: string;
}) {
  if (!url || !url.trim()) {
    return <p className="py-5 text-center text-xs text-slate-500">{emptyText}</p>;
  }

  const target = classifySafePreviewUrl(url);

  if (target.kind === "pdf") {
    return (
      <iframe
        src={target.safeUrl}
        title={title}
        referrerPolicy="no-referrer"
        className={`${heightClass} w-full rounded-xl border border-slate-200 bg-white`}
      />
    );
  }

  if (target.kind === "image") {
    return (
      <img
        src={target.safeUrl}
        alt={title}
        referrerPolicy="no-referrer"
        className={`mx-auto max-h-[70vh] ${heightClass === "h-64" ? "max-h-64" : ""} rounded-xl object-contain`}
      />
    );
  }

  if (target.kind === "link") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs">
        <span className="break-all font-mono text-slate-700">{target.safeUrl}</span>
        <a
          href={target.safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-bold text-indigo-700 hover:underline"
        >
          Buka <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs font-semibold text-rose-800">
      Format atau tautan berkas tidak valid sehingga tidak ditampilkan demi keamanan.
    </div>
  );
}
