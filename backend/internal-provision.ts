import { createHash, timingSafeEqual } from "crypto";
import express, { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { generateTemporaryPassword, hashPassword } from "./password.js";
import { parseRegistration } from "./school-registration.js";

type Status = "ACTIVE" | "SUSPENDED";
type Provision = { institutionName: string; npsn: string; subdomain: string; adminName: string; adminEmail: string; adminPhone: string; plan: string; expiresAt: Date };
type InternalStore = {
  provision: (data: Provision, passwordHash: string) => Promise<string>;
  updateStatus: (npsn: string, status: Status, expiresAt: Date) => Promise<boolean>;
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
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) || !plan || plan.length > 100) return null;
  return { institutionName: parsed.namaSekolah, npsn: parsed.npsn, subdomain, adminName: parsed.namaKontak, adminEmail: parsed.emailKontak, adminPhone: parsed.teleponKontak, plan, expiresAt };
}

function loginUrl(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return `${url.origin}/login`;
  } catch {
    return null;
  }
}

export function prismaInternalStore(prisma: PrismaClient): InternalStore {
  return {
    async provision(data, passwordHash) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (await tx.sekolah.findUnique({ where: { npsn: data.npsn }, select: { id: true } })) throw new ProvisionConflict("NPSN sudah terdaftar.");
          if (await tx.sekolah.findUnique({ where: { slug: data.subdomain }, select: { id: true } })) throw new ProvisionConflict("Subdomain sudah terdaftar.");
          if (await tx.akun.findUnique({ where: { email: data.adminEmail }, select: { id: true } })) throw new ProvisionConflict("Email admin sudah terdaftar.");
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
  };
}

export function internalProvisionRouter(store: InternalStore, settings: { secret: () => string | undefined; origin: () => string | undefined; production: boolean }) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = settings.secret();
    const match = /^Bearer ([^\s]+)$/.exec(req.get("authorization") ?? "");
    const actual = createHash("sha256").update(match?.[1] ?? "").digest();
    const expected = createHash("sha256").update(secret ?? "").digest();
    if (!secret || !secret.trim() || !match || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: "Unauthorized." });
    if (settings.production) return res.status(503).json({ error: "Provisioning internal hanya tersedia untuk pengujian, belum siap produksi." });
    if (req.get("origin") || req.get("sec-fetch-site")) return res.status(403).json({ error: "Endpoint hanya menerima permintaan antar-server." });
    return next();
  });
  router.use(express.json({ limit: "16kb" }));
  router.get("/health", (_req, res) => res.json({ success: true }));
  router.post("/provision", async (req, res) => {
    const data = provisionInput(req.body);
    if (!data) return res.status(400).json({ error: "Data tenant tidak valid. Periksa NPSN, subdomain, kontak, paket, dan expiresAt UTC di masa depan." });
    const url = loginUrl(settings.origin());
    if (!url) {
      console.error("APP_ORIGIN tidak valid untuk provisioning internal.");
      return res.status(503).json({ error: "Konfigurasi URL login tidak tersedia." });
    }
    try {
      const temporaryPassword = generateTemporaryPassword();
      const tenantId = await store.provision(data, await hashPassword(temporaryPassword));
      return res.status(201).json({ success: true, tenantId, loginUrl: url, initialUsername: data.adminEmail, temporaryPassword });
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
  return internalProvisionRouter(prismaInternalStore(prisma), { secret: () => process.env.MASTER_PROVISION_SECRET, origin: () => process.env.APP_ORIGIN, production: process.env.NODE_ENV === "production" });
}
