import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { deriveTenantSlugFromHost, getCachedTenantProfile, saveCachedTenantProfile } from "./authSessionCache";
import { fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type ThemeKey = "ocean" | "emerald" | "sunset" | "dark";

export const TENANT_THEME_EVENT = "armilla:tenant-theme-changed";
const PREFERRED_THEME_STORAGE_KEY = "armilla:preferred-theme";

const TenantThemeContext = createContext<ThemeKey>("ocean");

export function useTenantTheme(): ThemeKey {
  return useContext(TenantThemeContext);
}

export function isThemeKey(value: unknown): value is ThemeKey {
  return value === "ocean" || value === "emerald" || value === "sunset" || value === "dark";
}

export function savePreferredTheme(themeKey: ThemeKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_THEME_STORAGE_KEY, themeKey);
  } catch {
    // Ignore storage access errors
  }
}

export function getPreferredTheme(fallback: ThemeKey = "dark"): ThemeKey {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(PREFERRED_THEME_STORAGE_KEY);
      if (isThemeKey(stored)) return stored;
    } catch {
      // Ignore storage access errors
    }
  }
  const hostSlug = deriveTenantSlugFromHost();
  const cached = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  if (cached && isThemeKey(cached.themeKey)) return cached.themeKey;
  return fallback;
}

export function dispatchTenantThemeChange(themeKey: ThemeKey) {
  savePreferredTheme(themeKey);
  window.dispatchEvent(new CustomEvent<ThemeKey>(TENANT_THEME_EVENT, { detail: themeKey }));
}

function resolveInitialTheme(initialTheme?: ThemeKey): ThemeKey {
  if (initialTheme && isThemeKey(initialTheme)) return initialTheme;
  const hostSlug = deriveTenantSlugFromHost();
  const cached = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  if (cached && isThemeKey(cached.themeKey)) return cached.themeKey;
  return getPreferredTheme("ocean");
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
        savePreferredTheme(data.themeKey);
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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tenantTheme = theme;
    savePreferredTheme(theme);
    return () => {
      if (root.dataset.tenantTheme === theme) {
        delete root.dataset.tenantTheme;
      }
    };
  }, [theme]);

  return (
    <TenantThemeContext.Provider value={theme}>
      <div data-tenant-theme={theme}>{children}</div>
    </TenantThemeContext.Provider>
  );
}
