import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function PWAInstallButton({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else if (isIOS) {
            setShowIOSGuide(true);
          }
        }}
        className={
          className ||
          `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-sky-300/70 bg-sky-50/90 font-bold text-sky-900 transition hover:bg-sky-100 ${
            compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-xs"
          }`
        }
      >
        {isIOS && !isInstallable ? <Smartphone size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
        <span>Pasang Aplikasi</span>
      </button>

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-ios-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/icons/siput-pkbm-logo.png"
                  alt="Logo SIPUT PKBM"
                  className="h-11 w-11 rounded-xl object-cover shadow-xs"
                />
                <div>
                  <h3 id="pwa-ios-guide-title" className="text-base font-bold text-slate-900">
                    Pasang SIPUT PKBM di iOS
                  </h3>
                  <p className="text-xs text-slate-500">Tambahkan ke Layar Utama</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Tutup panduan pasang aplikasi"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
              <li>
                Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.
              </li>
              <li>
                Gulir ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
              </li>
              <li>
                Ketuk <strong>Tambah</strong> untuk memasang ikon <strong>SIPUT PKBM</strong>.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-sky-700 py-2.5 text-xs font-bold text-white hover:bg-sky-800"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
