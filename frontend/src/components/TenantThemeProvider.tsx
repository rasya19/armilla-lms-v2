import { useEffect, useState, type ReactNode } from "react";

type ThemeKey = "ocean" | "emerald" | "sunset" | "dark";

function isThemeKey(value: unknown): value is ThemeKey {
  return value === "ocean" || value === "emerald" || value === "sunset" || value === "dark";
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

  return <div data-tenant-theme={theme}>
    {error && <p role="alert" className="relative z-50 bg-amber-100 px-4 py-2 text-sm text-amber-950">Tema sekolah belum dapat dimuat. Tampilan sementara menggunakan tema Ocean; muat ulang untuk mencoba kembali.</p>}
    {children}
  </div>;
}
