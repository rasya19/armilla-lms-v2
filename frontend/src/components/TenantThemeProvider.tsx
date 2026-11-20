import { useEffect, useState, type ReactNode } from "react";
import { deriveTenantSlugFromHost, getCachedTenantProfile, saveCachedTenantProfile } from "./authSessionCache";
import { fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type ThemeKey = "ocean" | "emerald" | "sunset" | "dark";

export const TENANT_THEME_EVENT = "armilla:tenant-theme-changed";

export function isThemeKey(value: unknown): value is ThemeKey {
  return value === "ocean" || value === "emerald" || value === "sunset" || value === "dark";
}

export function dispatchTenantThemeChange(themeKey: ThemeKey) {
  window.dispatchEvent(new CustomEvent<ThemeKey>(TENANT_THEME_EVENT, { detail: themeKey }));
}

function resolveInitialTheme(initialTheme?: ThemeKey): ThemeKey {
  if (initialTheme && isThemeKey(initialTheme)) return initialTheme;
  const hostSlug = deriveTenantSlugFromHost();
  const cached = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  if (cached && isThemeKey(cached.themeKey)) return cached.themeKey;
  return "ocean";
}

export function TenantThemeProvider({
  scope,
  initialTheme,
  children,
}: {
  scope: "sekolah" | "lms";
  initialTheme?: ThemeKey;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<ThemeKey>(() => resolveInitialTheme(initialTheme));

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout(`/api/tenant/theme?scope=${scope}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("themeKey" in data) || !isThemeKey(data.themeKey)) return;
        setTheme(data.themeKey);
        const hostSlug = deriveTenantSlugFromHost();
        if (hostSlug) {
          const cached = getCachedTenantProfile(hostSlug);
          if (cached) {
            saveCachedTenantProfile(hostSlug, { nama: cached.nama, slug: hostSlug, themeKey: data.themeKey });
          }
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          // Fallback gracefully to cached or default theme
        }
      });
    return () => controller.abort();
  }, [scope]);

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const custom = event as CustomEvent<unknown>;
      if (isThemeKey(custom.detail)) {
        setTheme(custom.detail);
      }
    }
    window.addEventListener(TENANT_THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(TENANT_THEME_EVENT, handleThemeChange);
  }, []);

  return <div data-tenant-theme={theme}>{children}</div>;
}
