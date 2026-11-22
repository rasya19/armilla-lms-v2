import type { RequestHandler } from "express";

export function productionOrigin(value: string | undefined): string {
  if (!value) throw new Error("APP_ORIGIN wajib diatur untuk produksi, misalnya https://lms.example.com.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN harus berupa origin HTTPS yang valid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== value) {
    throw new Error("APP_ORIGIN harus berupa origin HTTPS tanpa path, query, atau slash penutup.");
  }
  return url.origin;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allowedBaseDomains(origin: string | undefined): string[] {
  const domains = new Set<string>(["pkbm.siput.id", "rsch.my.id"]);
  if (origin) {
    try {
      domains.add(new URL(origin).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Ignore invalid origin here; production check enforces valid origin earlier.
    }
  }
  return [...domains];
}

export function httpSecurity(options: { production: boolean; origin?: string }): RequestHandler {
  if (options.production && !options.origin) throw new Error("Origin produksi belum dikonfigurasi.");
  const baseDomains = allowedBaseDomains(options.origin);
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (options.production && !origin) return res.status(403).json({ error: "Permintaan ditolak." });
      if (origin) {
        try {
          const parsed = new URL(origin);
          const schoolOrigin = parsed.protocol === "https:" && !parsed.port && parsed.host === req.get("host") &&
            baseDomains.some((domain) =>
              parsed.hostname === domain ||
              parsed.hostname === `www.${domain}` ||
              new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${escapeRegExp(domain)}$`).test(parsed.hostname),
            );
          if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) ||
            (options.production ? (origin !== options.origin && !schoolOrigin) || parsed.host !== req.get("host") : parsed.host !== req.get("host"))) {
            return res.status(403).json({ error: "Permintaan ditolak." });
          }

        } catch {
          return res.status(403).json({ error: "Permintaan ditolak." });
        }
      }
      if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Permintaan ditolak." });
    }
    return next();
  };
}
