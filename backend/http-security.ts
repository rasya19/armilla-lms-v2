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

export function httpSecurity(options: { production: boolean; origin?: string }): RequestHandler {
  if (options.production && !options.origin) throw new Error("Origin produksi belum dikonfigurasi.");
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (options.production && !origin) return res.status(403).json({ error: "Permintaan ditolak." });
      if (origin) {
        try {
          const parsed = new URL(origin);
          if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) ||
            (options.production ? origin !== options.origin : parsed.host !== req.get("host"))) {
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
