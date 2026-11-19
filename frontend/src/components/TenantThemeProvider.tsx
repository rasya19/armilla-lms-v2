import { useEffect, useState, type ReactNode } from "react";

export type ThemeKey = "ocean" | "emerald" | "sunset" | "dark";

export const TENANT_THEME_EVENT = "armilla:tenant-theme-changed";

export function isThemeKey(value: unknown): value is ThemeKey {
  return value === "ocean" || value === "emerald" || value === "sunset" || value === "dark";
}

export function dispatchTenantThemeChange(themeKey: ThemeKey) {
  window.dispatchEvent(new CustomEvent<ThemeKey>(TENANT_THEME_EVENT, { detail: themeKey }));
}

export function TenantThemeProvider({ scope, children }: { scope: "sekolah" | "lms"; children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeKey>("ocean");
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tenant/theme?scope=${scope}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Tema sekolah tidak tersedia (${response.status}).`);
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("themeKey" in data) || !isThemeKey(data.themeKey)) throw new Error("Respons tema sekolah tidak valid.");
      setTheme(data.themeKey);
      setError(false);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        console.error("Gagal memuat tema sekolah:", failure);
        setTheme("ocean");
        setError(true);
      }
    });
    return () => controller.abort();
  }, [scope]);

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const custom = event as CustomEvent<unknown>;
      if (isThemeKey(custom.detail)) {
        setTheme(custom.detail);
        setError(false);
      }
    }
    window.addEventListener(TENANT_THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(TENANT_THEME_EVENT, handleThemeChange);
  }, []);

  return <div data-tenant-theme={theme}>
    {error && <p role="alert" className="relative z-50 bg-amber-100 px-4 py-2 text-sm text-amber-950">Tema sekolah belum dapat dimuat. Tampilan sementara menggunakan tema Ocean; muat ulang untuk mencoba kembali.</p>}
    {children}
  </div>;
}
