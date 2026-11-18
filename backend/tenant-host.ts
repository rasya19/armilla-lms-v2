import type { RequestHandler } from "express";
import { tenantAccessible } from "./tenant-access.js";

type Tenant = { id: string; slug: string; status: "ACTIVE" | "SUSPENDED"; expiresAt: Date | null };
export type HostTenant = { kind: "main" | "local" } | { kind: "school"; id: string; slug: string };

declare global {
  namespace Express {
    interface Request {
      tenant?: HostTenant;
    }
  }
}

export function tenantHost(host: string | undefined, production: boolean): { kind: "main" } | { kind: "local" } | { kind: "invalid" } | { kind: "school"; slug: string } {
  const hostname = host?.toLowerCase();
  if (hostname === "rsch.my.id" || hostname === "www.rsch.my.id") return { kind: "main" };
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.rsch\.my\.id$/.exec(hostname ?? "");
  if (match) return { kind: "school", slug: match[1] };
  if (!production && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(hostname ?? "")) return { kind: "local" };
  return { kind: "invalid" };
}

export function tenantHostMiddleware(production: boolean, findSchool: (slug: string) => Promise<Tenant | null>): RequestHandler {
  return async (req, res, next) => {
    const host = tenantHost(req.get("host"), production);
    if (host.kind === "invalid") return res.status(404).json({ error: "Sekolah / Lembaga tidak terdaftar." });
    if (host.kind === "school") {
      try {
        const school = await findSchool(host.slug);
        if (!school || !tenantAccessible(school)) return res.status(404).json({ error: "Sekolah / Lembaga tidak terdaftar atau tidak aktif." });
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
