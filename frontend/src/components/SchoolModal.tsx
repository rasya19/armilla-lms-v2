import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export function SchoolModal({ title, titleIcon, busy = false, onClose, children, wide = false }: { title: string; titleIcon?: ReactNode; busy?: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} aria-labelledby="school-modal-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className={`glass-dialog${wide ? " student-dialog" : ""}`}>
    <div className={`flex items-start justify-between gap-4${wide ? " shrink-0 px-5 pt-5 sm:px-7 sm:pt-6" : ""}`}>
      <h2 id="school-modal-title" className="flex items-center gap-3 text-xl font-bold text-slate-900">{titleIcon}{title}</h2>
      <button type="button" disabled={busy} onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
    </div>
    {children}
  </dialog>;
}
