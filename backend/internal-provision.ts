import { createHash, timingSafeEqual } from "crypto";
import express, { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { generateTemporaryPassword, hashPassword } from "./password.js";
import { parseRegistration } from "./school-registration.js";
import { toCleanPlanCode } from "./lms-plan-sync.js";
import type { TenantPlan } from "./plan-utils.js";

type Status = "ACTIVE" | "SUSPENDED";
type ThemeKey = "ocean" | "emerald" | "sunset" | "dark";
type Provision = { institutionName: string; npsn: string; subdomain: string; adminName: string; adminEmail: string; adminPhone: string; plan: string; expiresAt: Date };
type PlanUpdate = { npsn: string | null; slug: string | null; plan: TenantPlan };
type UpdatedTenantPlan = { id: string; nama: string; slug: string; npsn: string | null; plan: string | null };
type InternalStore = {
  provision: (data: Provision, passwordHash: string) => Promise<string>;
  updateStatus: (npsn: string, status: Status, expiresAt: Date) => Promise<boolean>;
  getTheme: (npsn: string) => Promise<string | null>;
  updateTheme: (themeKey: ThemeKey, sekolahId: string | null, npsn?: string) => Promise<number>;
  updatePlan?: (data: PlanUpdate) => Promise<UpdatedTenantPlan | null>;
};

export class ProvisionConflict extends Error {}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return date.toISOString() === canonical ? date : null;
}

function provisionInput(body: unknown): Provision | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const parsed = parseRegistration({ namaSekolah: input.institutionName, npsn: input.npsn, namaKontak: input.adminName, emailKontak: input.adminEmail, teleponKontak: input.adminPhone });
  const expiresAt = dateValue(input.expiresAt);
  if (!parsed || !parsed.npsn || typeof input.subdomain !== "string" || typeof input.plan !== "string" || !expiresAt || expiresAt <= new Date()) return null;
  const subdomain = input.subdomain.trim().toLowerCase();
  const plan = input.plan.trim();
  if (!/^[a-z0-9]{1,63}$/.test(subdomain) || subdomain === "www" || !plan || plan.length > 100) return null;
  return { institutionName: parsed.namaSekolah, npsn: parsed.npsn, subdomain, adminName: parsed.namaKontak, adminEmail: parsed.emailKontak, adminPhone: parsed.teleponKontak, plan, expiresAt };
}

export function prismaInternalStore(prisma: PrismaClient): InternalStore {
  return {
    async provision(data, passwordHash) {
      try {
        return await prisma.$transaction(async (tx) => {
          const [dupNpsn, dupSlug, dupEmail] = await Promise.all([
            tx.sekolah.findUnique({ where: { npsn: data.npsn }, select: { id: true } }),
            tx.sekolah.findUnique({ where: { slug: data.subdomain }, select: { id: true } }),
            tx.akun.findUnique({ where: { email: data.adminEmail }, select: { id: true } }),
          ]);
          if (dupNpsn) throw new ProvisionConflict("NPSN sudah terdaftar.");
          if (dupSlug) throw new ProvisionConflict("Subdomain sudah terdaftar.");
          if (dupEmail) throw new ProvisionConflict("Email admin sudah terdaftar.");
          const school = await tx.sekolah.create({ data: { nama: data.institutionName, npsn: data.npsn, slug: data.subdomain, status: "ACTIVE", expiresAt: data.expiresAt, plan: data.plan, adminPhone: data.adminPhone } });
          await tx.akun.create({ data: { sekolahId: school.id, nama: data.adminName, email: data.adminEmail, passwordHash, peran: "ADMIN" } });
          await tx.pendaftaranSekolah.updateMany({
            where: { npsn: data.npsn, status: "MENUNGGU", sekolahId: null },
            data: {
              sekolahId: school.id,
              status: "DISETUJUI",
              catatanTinjauan: "Disetujui melalui Rasyatech Admin.",
              ditinjauPada: new Date(),
            },
          });
          return school.id;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const target = String(error.meta?.target ?? "");
          if (target.includes("npsn")) throw new ProvisionConflict("NPSN sudah terdaftar.");
          if (target.includes("slug")) throw new ProvisionConflict("Subdomain sudah terdaftar.");
          if (target.includes("email")) throw new ProvisionConflict("Email admin sudah terdaftar.");
          throw new ProvisionConflict("NPSN, subdomain, atau email admin sudah terdaftar.");
        }
        throw error;
      }
    },
    async updateStatus(npsn, status, expiresAt) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.sekolah.updateMany({ where: { npsn }, data: { status, expiresAt } });
        if (!updated.count) return false;
        await tx.sesiAkun.updateMany({ where: { akun: { sekolah: { npsn } }, revokedAt: null }, data: { revokedAt: new Date() } });
        return true;
      });
    },
    async getTheme(npsn) {
      const school = await prisma.sekolah.findUnique({ where: { npsn }, select: { themeKey: true } });
      return school?.themeKey ?? null;
    },
    async updateTheme(themeKey, sekolahId, npsn) {
      const where = sekolahId ? { id: sekolahId } : npsn ? { npsn } : {
        status: "ACTIVE" as const,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      };
      const result = await prisma.sekolah.updateMany({ where, data: { themeKey } });
      return result.count;
    },
    async updatePlan({ npsn, slug, plan }) {
      const school =
        (npsn ? await prisma.sekolah.findUnique({ where: { npsn }, select: { id: true } }) : null) ??
        (slug ? await prisma.sekolah.findUnique({ where: { slug }, select: { id: true } }) : null);
      if (!school) return null;
      return prisma.sekolah.update({
        where: { id: school.id },
        data: { plan },
        select: { id: true, nama: true, slug: true, npsn: true, plan: true },
      });
    },
  };
}

export function internalProvisionRouter(store: InternalStore, settings: { secret: () => string | undefined }) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = settings.secret();
    const match = /^Bearer ([^\s]+)$/.exec(req.get("authorization") ?? "");
    const actual = createHash("sha256").update(match?.[1] ?? "").digest();
    const expected = createHash("sha256").update(secret ?? "").digest();
    if (!secret || !secret.trim() || !match || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: "Unauthorized." });
    if (req.get("origin") || req.get("sec-fetch-site")) return res.status(403).json({ error: "Endpoint hanya menerima permintaan antar-server." });
    return next();
  });
  router.use(express.json({ limit: "16kb" }));
  router.get("/health", (_req, res) => res.json({ success: true }));
  router.get("/tenant-theme/capabilities", (_req, res) => res.json({ success: true, bulkScope: "active-unexpired" }));
  router.get("/tenant-theme", async (req, res) => {
    const npsn = req.query.npsn;
    if (typeof npsn !== "string" || !/^(?:\d{8}|[PK]\d{7})$/.test(npsn)) return res.status(400).json({ error: "NPSN tidak valid." });
    try {
      const themeKey = await store.getTheme(npsn);
      if (themeKey === null) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
      return res.json({ success: true, themeKey });
    } catch (error) {
      console.error("Gagal membaca tema tenant:", error);
      return res.status(503).json({ error: "Tema tenant belum dapat dibaca." });
    }
  });
  router.patch("/tenant-theme", async (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Permintaan tema tidak valid." });
    const input = body as Record<string, unknown>;
    const themeKey = input.themeKey;
    const id = input.sekolahId;
    const npsn = input.npsn;
    const all = input.applyToAll;
    const validId = typeof id === "string" && id.length > 0 && id.length <= 100 && id === id.trim();
    const validNpsn = typeof npsn === "string" && /^(?:\d{8}|[PK]\d{7})$/.test(npsn);
    if ((themeKey !== "ocean" && themeKey !== "emerald" && themeKey !== "sunset" && themeKey !== "dark") || !((all === true && id === undefined && npsn === undefined) || (all === undefined && ((validId && npsn === undefined) || (id === undefined && validNpsn))))) return res.status(400).json({ error: "Tema atau target sekolah tidak valid." });
    try {
      const count = await store.updateTheme(themeKey, validId ? id : null, validNpsn ? npsn : undefined);
      if (all !== true && count === 0) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
      return res.json({ success: true, updated: count });
    } catch (error) {
      console.error("Gagal memperbarui tema tenant:", error);
      return res.status(503).json({ error: "Tema tenant belum dapat diperbarui." });
    }
  });
  function parsePlanUpdate(body: unknown, paramNpsn?: string): PlanUpdate | { error: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Data perubahan paket tidak valid." };
    }
    const input = body as Record<string, unknown>;
    const cleanPlan = toCleanPlanCode(input.plan ?? input.paket);
    if (!cleanPlan) {
      return { error: "Kode paket tidak valid. Gunakan basic, reguler, atau pro." };
    }
    const rawNpsn = typeof paramNpsn === "string" ? paramNpsn : typeof input.npsn === "string" ? input.npsn : "";
    const trimmedNpsn = rawNpsn.trim().toUpperCase();
    const npsn = trimmedNpsn ? (/^(?:\d{8}|[PK]\d{7})$/.test(trimmedNpsn) ? trimmedNpsn : null) : null;
    if (trimmedNpsn && !npsn) {
      return { error: "Format NPSN tidak valid." };
    }
    const rawSlug = typeof input.slug === "string" ? input.slug : typeof input.subdomain === "string" ? input.subdomain : "";
    const trimmedSlug = rawSlug.trim().toLowerCase();
    const slug = trimmedSlug ? (/^[a-z0-9]{1,63}$/.test(trimmedSlug) && trimmedSlug !== "www" ? trimmedSlug : null) : null;
    if (trimmedSlug && !slug) {
      return { error: "Format slug/subdomain tidak valid." };
    }
    if (!npsn && !slug) {
      return { error: "NPSN atau slug sekolah wajib disertakan untuk pembaruan paket." };
    }
    return { npsn, slug, plan: cleanPlan };
  }

  function isPlanUpdateRequest(body: unknown): boolean {
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    const input = body as Record<string, unknown>;
    if (input.action === "update-plan" || input.type === "update-plan") return true;
    const hasPlan = "plan" in input || "paket" in input;
    const hasTarget = "npsn" in input || "slug" in input || "subdomain" in input;
    const hasCreationFields = "institutionName" in input || "adminEmail" in input || "expiresAt" in input;
    return hasPlan && hasTarget && !hasCreationFields;
  }

  async function handlePlanUpdate(req: express.Request, res: express.Response, paramNpsn?: string) {
    if (!store.updatePlan) {
      return res.status(503).json({ error: "Pembaruan paket belum tersedia." });
    }
    const parsed = parsePlanUpdate(req.body, paramNpsn);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }
    try {
      const updated = await store.updatePlan(parsed);
      if (!updated) {
        return res.status(404).json({ error: "Tenant tidak ditemukan di LMS." });
      }
      return res.json({
        success: true,
        plan: parsed.plan,
        sekolah: updated,
        message: `Paket tenant ${updated.nama} berhasil diperbarui ke ${parsed.plan}.`,
      });
    } catch (error) {
      console.error("Gagal memperbarui paket tenant:", error);
      return res.status(503).json({ error: "Paket tenant belum dapat diperbarui." });
    }
  }

  router.patch("/provision", (req, res) => handlePlanUpdate(req, res));
  router.patch("/tenants/:npsn/plan", (req, res) => handlePlanUpdate(req, res, req.params.npsn));

  router.post("/provision", async (req, res) => {
    if (isPlanUpdateRequest(req.body)) {
      return handlePlanUpdate(req, res);
    }
    const data = provisionInput(req.body);
    if (!data) return res.status(400).json({ error: "Data tenant tidak valid. Subdomain harus 1–63 huruf kecil atau angka tanpa spasi dan strip, serta bukan www; periksa juga NPSN, kontak, paket, dan expiresAt UTC di masa depan." });
    try {
      const temporaryPassword = generateTemporaryPassword();
      const tenantId = await store.provision(data, await hashPassword(temporaryPassword));
      let appDomain = "rsch.my.id";
      if (process.env.APP_ORIGIN) {
        try {
          appDomain = new URL(process.env.APP_ORIGIN).hostname.toLowerCase().replace(/^www\./, "");
        } catch {
          appDomain = "rsch.my.id";
        }
      }
      return res.status(201).json({ success: true, tenantId, loginUrl: `https://${data.subdomain}.${appDomain}/login`, initialUsername: data.adminEmail, temporaryPassword });
    } catch (error) {
      if (error instanceof ProvisionConflict) return res.status(409).json({ error: error.message });
      console.error("Gagal memproses provisioning internal:", error);
      return res.status(503).json({ error: "Provisioning belum dapat diproses." });
    }
  });
  router.patch("/tenants/:npsn/status", async (req, res) => {
    const npsn = req.params.npsn.trim().toUpperCase();
    const { status, expiresAt: inputDate } = req.body ?? {};
    const expiresAt = dateValue(inputDate);
    if (!/^(?:\d{8}|[PK]\d{7})$/.test(npsn) || (status !== "ACTIVE" && status !== "SUSPENDED") || !expiresAt || (status === "ACTIVE" && expiresAt <= new Date())) return res.status(400).json({ error: "NPSN, status, atau expiresAt UTC tidak valid." });
    try {
      if (!await store.updateStatus(npsn, status, expiresAt)) return res.status(404).json({ error: "Tenant tidak ditemukan." });
      return res.json({ success: true });
    } catch (error) {
      console.error("Gagal memperbarui status tenant:", error);
      return res.status(503).json({ error: "Status tenant belum dapat diperbarui." });
    }
  });
  return router;
}

export function internalProvisionRoutes(prisma: PrismaClient) {
  return internalProvisionRouter(prismaInternalStore(prisma), {
    secret: () => process.env.MASTER_PROVISION_SECRET,
  });
}
