import type { TenantPlan } from "./plan-utils.js";

const DEFAULT_LMS_PROVISION_ORIGIN = "https://pkbm.siput.id";

export function toCleanPlanCode(value: unknown): TenantPlan | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) return null;
  if (/\b(pro|enterprise|premium|gold|ultimate)\b/.test(normalized)) {
    return "pro";
  }
  if (/\b(reguler|regular|silver)\b/.test(normalized)) {
    return "reguler";
  }
  if (/\b(basic|standar|standard|starter|free|gratis)\b/.test(normalized)) {
    return "basic";
  }
  if (/\btahunan\b/.test(normalized)) {
    return "pro";
  }
  return null;
}

export function resolveLmsProvisionEndpoint(
  rawUrl: string | undefined,
  production: boolean,
): URL | null {
  const candidate = rawUrl?.trim() || DEFAULT_LMS_PROVISION_ORIGIN;
  try {
    const url = new URL(candidate);
    if (
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (production
        ? url.protocol !== "https:"
        : url.protocol !== "https:" &&
          !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) {
      return null;
    }
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api/internal/provision";
    } else if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url;
  } catch {
    return null;
  }
}

export type SyncPlanResult =
  | { ok: true; status: number; plan: TenantPlan; message: string }
  | { ok: false; status: number; error: string };

export async function syncTenantPlanToLms(
  input: {
    npsn: string | null;
    slug: string;
    plan: TenantPlan;
  },
  options: {
    endpointUrl?: string;
    token?: string;
    production?: boolean;
    fetcher?: typeof fetch;
  } = {},
): Promise<SyncPlanResult> {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const endpoint = resolveLmsProvisionEndpoint(
    options.endpointUrl ?? process.env.LMS_PROVISION_URL,
    production,
  );
  const token = (
    options.token ??
    process.env.LMS_BEARER_TOKEN ??
    process.env.MASTER_PROVISION_SECRET ??
    ""
  ).trim();

  if (!endpoint) {
    return {
      ok: false,
      status: 503,
      error: "Konfigurasi LMS_PROVISION_URL tidak valid.",
    };
  }
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "Token otorisasi LMS (LMS_BEARER_TOKEN / MASTER_PROVISION_SECRET) belum dikonfigurasi.",
    };
  }

  const payload = JSON.stringify({
    action: "update-plan",
    plan: input.plan,
    paket: input.plan,
    npsn: input.npsn,
    slug: input.slug,
    subdomain: input.slug,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const fetcher = options.fetcher || fetch;

  try {
    let response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: payload,
      signal: controller.signal,
    });

    if (response.status === 405) {
      response = await fetcher(endpoint, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: payload,
        signal: controller.signal,
      });
    }

    const body: unknown = await response.json().catch(() => null);
    const bodyObj =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;

    if (!response.ok) {
      const serverError =
        (bodyObj && typeof bodyObj.error === "string" && bodyObj.error.trim()) ||
        (bodyObj && typeof bodyObj.message === "string" && bodyObj.message.trim()) ||
        `Server LMS menolak perubahan paket (HTTP ${response.status}).`;
      return {
        ok: false,
        status: response.status >= 400 && response.status < 600 ? response.status : 502,
        error: serverError,
      };
    }

    const successMessage =
      (bodyObj && typeof bodyObj.message === "string" && bodyObj.message.trim()) ||
      `Paket berhasil disinkronkan ke LMS (${input.plan}).`;

    return {
      ok: true,
      status: response.status,
      plan: input.plan,
      message: successMessage,
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: controller.signal.aborted
        ? "Koneksi ke server LMS timeout. Coba lagi."
        : error instanceof Error && error.message
          ? `Gagal menghubungi server LMS: ${error.message}`
          : "Server LMS tidak dapat dihubungi.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
