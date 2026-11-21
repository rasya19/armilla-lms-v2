import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { canAccessFeature, isPlanTier, type PlanTier } from "../utils/planAccess";
import { deriveTenantSlugFromHost, getCachedTenantProfile, saveCachedTenantProfile } from "./authSessionCache";
import { fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

export type ThemeKey = "ocean" | "emerald" | "sunset" | "violet" | "dark";

export const TENANT_THEME_EVENT = "armilla:tenant-theme-changed";
const PREFERRED_THEME_STORAGE_KEY = "armilla:preferred-theme";

const TenantThemeContext = createContext<ThemeKey>("ocean");

type TenantPlanContextValue = {
  plan: PlanTier;
  access: (required: PlanTier, featureName: string) => boolean;
};

const TenantPlanContext = createContext<TenantPlanContextValue>({
  plan: "basic",
  access: () => false,
});

export function useTenantTheme(): ThemeKey {
  return useContext(TenantThemeContext);
}

export function useTenantPlan(): TenantPlanContextValue {
  return useContext(TenantPlanContext);
}

export function isThemeKey(value: unknown): value is ThemeKey {
  return value === "ocean" || value === "emerald" || value === "sunset" || value === "violet" || value === "dark";
}

export function normalizeThemeKey(value: unknown, fallback: ThemeKey = "ocean"): ThemeKey {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (isThemeKey(normalized)) return normalized;
  }
  return fallback;
}

export function savePreferredTheme(themeKey: ThemeKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_THEME_STORAGE_KEY, themeKey);
  } catch {
    // Ignore storage access errors
  }
}

export function getPreferredTheme(fallback: ThemeKey = "ocean"): ThemeKey {
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

function resolveInitialPlan(explicitPlan?: PlanTier): PlanTier {
  if (explicitPlan && isPlanTier(explicitPlan)) return explicitPlan;
  const hostSlug = deriveTenantSlugFromHost();
  const cached = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  if (cached && typeof cached.plan === "string") {
    const lower = cached.plan.trim().toLowerCase();
    if (lower.includes("pro")) return "pro";
    if (lower.includes("reguler") || lower.includes("regular")) return "reguler";
  }
  return "basic";
}

export function TenantThemeProvider({
  scope,
  initialTheme,
  plan,
  onRequireUpgrade,
  children,
}: {
  scope: "sekolah" | "lms";
  initialTheme?: ThemeKey;
  plan?: PlanTier;
  onRequireUpgrade?: (featureName: string, requiredPlan: Exclude<PlanTier, "basic">) => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<ThemeKey>(() => resolveInitialTheme(initialTheme));
  const [fallbackPlan, setFallbackPlan] = useState<PlanTier>(() => resolveInitialPlan(plan));
  const [upgradeNotice, setUpgradeNotice] = useState<{ featureName: string; required: Exclude<PlanTier, "basic"> } | null>(null);

  const resolvedPlan = plan && isPlanTier(plan) ? plan : fallbackPlan;

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout(`/api/tenant/theme?scope=${scope}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const publicRes = await fetchWithTimeout("/api/public/tema", { signal: controller.signal, cache: "no-store" }).catch(() => null);
          if (!publicRes || !publicRes.ok) return;
          const pubData: unknown = await publicRes.json();
          if (typeof pubData === "object" && pubData !== null && "themeKey" in pubData && isThemeKey(pubData.themeKey)) {
            setTheme(pubData.themeKey);
            savePreferredTheme(pubData.themeKey);
          }
          return;
        }
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
          if (!plan && cached?.plan) {
            setFallbackPlan(resolveInitialPlan());
          }
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          // Fallback gracefully to cached or default theme
        }
      });
    return () => controller.abort();
  }, [scope, plan]);

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

  const access = useCallback(
    (required: PlanTier, featureName: string): boolean => {
      if (canAccessFeature(resolvedPlan, required)) return true;
      if (required !== "basic") {
        if (onRequireUpgrade) {
          onRequireUpgrade(featureName, required);
        } else {
          setUpgradeNotice({ featureName, required });
        }
      }
      return false;
    },
    [resolvedPlan, onRequireUpgrade],
  );

  const planContextValue = useMemo<TenantPlanContextValue>(
    () => ({ plan: resolvedPlan, access }),
    [resolvedPlan, access],
  );

  return (
    <TenantThemeContext.Provider value={theme}>
      <TenantPlanContext.Provider value={planContextValue}>
        <div data-tenant-theme={theme}>{children}</div>
        {upgradeNotice && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-upgrade-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          >
            <div className="glass-dialog w-full max-w-md space-y-4">
              <h2 id="tenant-upgrade-title" className="text-lg font-bold">
                Fitur Paket {upgradeNotice.required.toUpperCase()}
              </h2>
              <p className="text-sm leading-6">
                Fitur <strong>{upgradeNotice.featureName}</strong> tersedia mulai paket{" "}
                <strong>{upgradeNotice.required.toUpperCase()}</strong>. Hubungi admin sekolah atau pengelola Rasyatech untuk upgrade paket.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setUpgradeNotice(null)}
                  className="master-primary px-4 py-2"
                >
                  Mengerti
                </button>
              </div>
            </div>
          </div>
        )}
      </TenantPlanContext.Provider>
    </TenantThemeContext.Provider>
  );
}
