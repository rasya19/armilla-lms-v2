import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const ConfirmContext = createContext<((message: string) => Promise<boolean>) | null>(null);

export function GlassConfirmProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const resolver = useRef<((result: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const finish = useCallback((result: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    if (dialog.current?.open) dialog.current.close();
    setMessage("");
    resolve?.(result);
  }, []);

  const confirm = useCallback((text: string) => {
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setMessage(text);
    });
  }, []);

  useEffect(() => {
    if (message && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [message]);

  useEffect(() => () => {
    resolver.current?.(false);
    resolver.current = null;
  }, []);

  return <ConfirmContext.Provider value={confirm}>
    {children}
    <dialog ref={dialog} className="glass-dialog" aria-labelledby="glass-confirm-title" aria-describedby="glass-confirm-message" onCancel={(event) => { event.preventDefault(); finish(false); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); finish(false); } }}>
      <h2 id="glass-confirm-title" className="text-lg font-bold text-slate-900">Konfirmasi</h2>
      <p id="glass-confirm-message" className="mt-3 break-words text-sm leading-6 text-slate-700">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" autoFocus onClick={() => finish(false)} className="master-outline">Batal</button>
        <button type="button" onClick={() => finish(true)} className="master-primary">Lanjutkan</button>
      </div>
    </dialog>
  </ConfirmContext.Provider>;
}

export function useGlassConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("GlassConfirmProvider belum tersedia.");
  return confirm;
}
