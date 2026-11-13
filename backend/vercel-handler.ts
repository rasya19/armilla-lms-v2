import { randomUUID } from "crypto";
import type { Application, Request, Response } from "express";
import { productionOrigin } from "./http-security.js";
import { rateLimitSecret } from "./login-rate-limit.js";

type StartupIssue = { code: string; error: string };

export function productionConfigurationIssue(env: NodeJS.ProcessEnv): StartupIssue | null {
  if (env.NODE_ENV !== "production") return null;
  if (!env.DATABASE_URL) return { code: "DATABASE_URL_MISSING", error: "Konfigurasi database belum tersedia." };
  try {
    productionOrigin(env.APP_ORIGIN);
  } catch {
    return { code: "APP_ORIGIN_INVALID", error: "Konfigurasi origin produksi tidak valid." };
  }
  try {
    rateLimitSecret(env.LOGIN_RATE_LIMIT_SECRET);
  } catch {
    return { code: "LOGIN_RATE_LIMIT_SECRET_INVALID", error: "Konfigurasi perlindungan login tidak valid." };
  }
  return null;
}

export function createVercelHandler(loadApp: () => Promise<Application>, env: NodeJS.ProcessEnv = process.env) {
  let loading: Promise<Application> | undefined;
  return async (req: Request, res: Response): Promise<void> => {
    const issue = productionConfigurationIssue(env);
    if (issue) {
      console.error("API gagal memulai: konfigurasi tidak valid.", { code: issue.code });
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(issue));
      return;
    }
    try {
      loading = loading ?? loadApp();
      const app = await loading;
      app(req, res);
    } catch (error) {
      const reference = randomUUID();
      console.error("API gagal memulai atau memproses permintaan.", { reference, errorType: error instanceof Error ? error.name : "UnknownError" });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "API tidak tersedia. Periksa log server.", code: "API_INITIALIZATION_FAILED", reference }));
    }
  };
}
