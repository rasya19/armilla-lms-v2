import type { ErrorRequestHandler, Request, RequestHandler } from "express";

export type VerifiedActorSession = {
  userId: string;
  role: "MASTER_ADMIN" | "ADMIN" | "GURU" | "SISWA" | "DINAS";
  schoolId: string | null;
};

export type VerifiedActorResolver = (req: Request) => Promise<VerifiedActorSession | null>;

/**
 * Extracts any client-supplied schoolId/sekolahId fields from headers, query, or body.
 * Protected routes must derive schoolId strictly from verified server sessions; if a client
 * sends a mismatched schoolId/sekolahId attempting cross-tenant tampering, reject with 403.
 */
export function extractClientSuppliedSchoolIds(req: Request): string[] {
  const found: string[] = [];
  const collect = (val: unknown) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed) found.push(trimmed);
    }
  };

  collect(req.get("x-school-id"));
  collect(req.get("x-sekolah-id"));
  collect(req.query?.schoolId);
  collect(req.query?.sekolahId);

  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    const body = req.body as Record<string, unknown>;
    collect(body.schoolId);
    collect(body.sekolahId);
  }
  return found;
}

const STUDENT_ALLOWED_SEKOLAH_PREFIXES = [
  "/sekolah/diskusi",
  "/sekolah/ai-assistant",
  "/school/diskusi",
  "/school/ai-assistant",
];

const TEACHER_ALLOWED_SEKOLAH_PREFIXES = [
  "/sekolah/cbt",
  "/sekolah/raport",
  "/sekolah/modul-kesetaraan",
  "/sekolah/agenda-mengajar",
  "/sekolah/diskusi",
  "/sekolah/ai-assistant",
  "/sekolah/master-content",
  "/sekolah/import-master-content",
  "/sekolah/pustaka-konten",
  "/school/diskusi",
  "/school/ai-assistant",
  "/school/attendance",
  "/school/master-content",
  "/school/import-master-content",
  "/school/pustaka-konten",
];

const ADMIN_OR_TEACHER_PREFIXES = [
  "/cbt",
  "/module-bank",
  "/modules",
  "/school/attendance",
  "/lms/guru",
];

function matchesAnyPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Centralized Tenant Isolation & RBAC Guard mounted on `/api`.
 * - Prevents cross-tenant `schoolId`/`sekolahId` tampering (returns 403 Forbidden).
 * - Blocks authenticated `SISWA` (STUDENT) from administrative/teacher endpoints with 403 Forbidden.
 * - Blocks authenticated `GURU` (TEACHER) from strictly school-admin endpoints (account creation/reset,
 *   school profile edits, attendance deletion on `/api/sekolah/presensi`, PPDB review, etc.) with 403 Forbidden.
 * - Blocks non-Master authenticated users from `/api/master/*` with 403 Forbidden.
 * Unauthenticated requests continue to individual route handlers which return 401 Unauthorized.
 */
export function createSecurityGuardMiddleware(resolveActor: VerifiedActorResolver): RequestHandler {
  return async (req, res, next) => {
    const path = req.path || "/";

    // Skip public, health, tenant lookup, and auth endpoints
    if (
      path === "/health" ||
      path === "/tenant/context" ||
      path.startsWith("/public") ||
      path.startsWith("/auth") ||
      path.startsWith("/ppdb") ||
      path.startsWith("/pendaftaran-sekolah") ||
      path.startsWith("/internal")
    ) {
      return next();
    }

    try {
      const actor = await resolveActor(req);
      if (!actor) {
        return next();
      }

      // 1. Cross-tenant schoolId tampering check for tenant-scoped actors
      if (actor.role !== "MASTER_ADMIN" && actor.role !== "DINAS" && actor.schoolId) {
        const suppliedSchoolIds = extractClientSuppliedSchoolIds(req);
        if (suppliedSchoolIds.some((id) => id !== actor.schoolId)) {
          return res.status(403).json({
            error: "Akses ditolak. Tidak diizinkan mengakses atau mengubah data sekolah lain.",
          });
        }
      }

      // 2. Master-only namespace protection
      if ((path === "/master" || path.startsWith("/master/")) && actor.role !== "MASTER_ADMIN") {
        return res.status(403).json({
          error: "Akses ditolak. Endpoint ini hanya untuk Master Admin.",
        });
      }

      // 3. Student RBAC lock on admin & teacher endpoints
      if (actor.role === "SISWA") {
        if (matchesAnyPrefix(path, ADMIN_OR_TEACHER_PREFIXES)) {
          return res.status(403).json({
            error: "Akses ditolak. Fitur ini tidak tersedia untuk akun siswa.",
          });
        }
        if (
          (path === "/sekolah" || path.startsWith("/sekolah/") || path === "/school" || path.startsWith("/school/")) &&
          !matchesAnyPrefix(path, STUDENT_ALLOWED_SEKOLAH_PREFIXES)
        ) {
          return res.status(403).json({
            error: "Akses ditolak. Endpoint administratif hanya untuk pengelola sekolah.",
          });
        }
      }

      // 4. Teacher RBAC lock on strictly Admin-only school endpoints
      if (actor.role === "GURU") {
        if (
          (path === "/sekolah" || path.startsWith("/sekolah/") || path === "/school" || path.startsWith("/school/")) &&
          !matchesAnyPrefix(path, TEACHER_ALLOWED_SEKOLAH_PREFIXES)
        ) {
          return res.status(403).json({
            error: "Akses ditolak. Endpoint ini hanya tersedia untuk Admin Sekolah.",
          });
        }
      }

      return next();
    } catch (error) {
      console.error("Gagal memverifikasi otorisasi keamanan:", error instanceof Error ? error.name : "UnknownError");
      return res.status(503).json({ error: "Layanan keamanan sementara tidak tersedia." });
    }
  };
}

/**
 * Global Express error handler that guarantees no stack trace, SQL query,
 * Prisma internals, or sensitive runtime details ever leak to HTTP clients.
 */
export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const errorObj = err as { status?: number; statusCode?: number; type?: string; message?: string; name?: string } | null;
  const status = errorObj?.status ?? errorObj?.statusCode;

  if (errorObj?.type === "entity.too.large" || status === 413) {
    return res.status(413).json({
      error: "Ukuran berkas atau data yang dikirim melebihi batas maksimum yang diizinkan.",
    });
  }

  if (errorObj?.type === "entity.parse.failed" || (err instanceof SyntaxError && status === 400)) {
    return res.status(400).json({
      error: "Format data JSON pada permintaan tidak valid.",
    });
  }

  console.error("Unhandled server error:", {
    name: errorObj?.name ?? "Error",
    message: errorObj?.message ?? "Unknown error",
  });

  return res.status(500).json({
    error: "Terjadi kesalahan internal pada server. Silakan coba lagi nanti.",
  });
};
