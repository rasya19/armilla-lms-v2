import type { RequestHandler } from "express";
import { tenantAccessible, tenantBlockReason } from "./tenant-access.js";

type Tenant = { id: string; slug: string; status: "ACTIVE" | "SUSPENDED"; expiresAt: Date | null };
export type HostTenant = { kind: "main" | "local" } | { kind: "school"; id: string; slug: string };

declare global {
  namespace Express {
    interface Request {
      tenant?: HostTenant;
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tenantBaseDomains(appOrigin?: string): string[] {
  const domains = new Set<string>(["pkbm.siput.id", "rsch.my.id"]);
  if (appOrigin) {
    try {
      domains.add(new URL(appOrigin).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Ignore malformed APP_ORIGIN here
    }
  }
  return [...domains];
}

export const RESERVED_SUBDOMAINS = new Set<string>(["www"]);

export function tenantHost(host: string | undefined, production: boolean, appOrigin?: string): { kind: "main" } | { kind: "local" } | { kind: "invalid" } | { kind: "school"; slug: string } {
  const hostname = host?.toLowerCase();
  const baseDomains = tenantBaseDomains(appOrigin);
  for (const domain of baseDomains) {
    if (hostname === domain || hostname === `www.${domain}`) return { kind: "main" };
    const match = new RegExp(`^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${escapeRegExp(domain)}$`).exec(hostname ?? "");
    if (match && !RESERVED_SUBDOMAINS.has(match[1])) return { kind: "school", slug: match[1] };
  }
  if (!production && hostname) return { kind: "local" };
  return { kind: "invalid" };
}

export function tenantHostMiddleware(production: boolean, findSchool: (slug: string) => Promise<Tenant | null>, appOrigin?: string): RequestHandler {
  return async (req, res, next) => {
    const host = tenantHost(req.get("host"), production, appOrigin);
    if (host.kind === "invalid") return res.status(404).json({ error: "Sekolah / Lembaga tidak terdaftar.", code: "TENANT_NOT_FOUND" });
    if (host.kind === "school") {
      try {
        const school = await findSchool(host.slug);
        if (!school || !tenantAccessible(school)) {
          const reason = tenantBlockReason(school);
          if (reason === "EXPIRED" && school?.expiresAt) {
            return res.status(404).json({
              error: "Masa uji coba 14 hari / masa aktif lembaga telah berakhir. Akses otomatis diblokir.",
              code: "TENANT_EXPIRED",
              expiresAt: school.expiresAt.toISOString(),
            });
          }
          return res.status(404).json({
            error: "Sekolah / Lembaga tidak terdaftar atau tidak aktif.",
            code: reason === "SUSPENDED" ? "TENANT_SUSPENDED" : "TENANT_NOT_FOUND",
          });
        }
        req.tenant = { kind: "school", id: school.id, slug: school.slug };
      } catch (error) {
        console.error("Gagal memeriksa subdomain sekolah:", error instanceof Error ? error.name : "UnknownError");
        return res.status(503).json({ error: "Layanan sekolah tidak tersedia." });
      }
    } else {
      req.tenant = host;
    }
    return next();
  };
}
