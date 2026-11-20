import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { parseProfile, parsePublicApplicant } from "./public-school-input.js";
import { schoolSlugBase } from "./school-slug.js";

const profile = {
  nama: "PKBM Uji", npsn: "P1234567", namaYayasan: null, skIzinOperasional: null,
  alamatLengkap: null, kabupatenKota: null, provinsi: null, teleponWa: null,
  emailSekolah: null, websiteSekolah: null, logoUrl: null, namaKetuaPkbm: null,
};
const applicant = { nama: "Calon Uji", nik: "1234567890123456", nisn: "", tempatLahir: "Bandung", tanggalLahir: "2000-02-29", jenisKelamin: "L", jenjang: "Paket B", telepon: "08123456789", asalSekolah: "SMP Uji" };

test("validates public profile, logo, and PPDB data without fabricating required legacy fields", () => {
  const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")}`;
  assert.ok(parseProfile({ ...profile, logoUrl: png }));
  assert.equal(parseProfile({ ...profile, logoUrl: "data:image/svg+xml;base64,PHN2Zz4=" }), null);
  assert.equal(parseProfile({ ...profile, logoUrl: "data:image/png;base64,YWJj" }), null);
  assert.equal(parseProfile({ ...profile, websiteSekolah: "javascript:alert(1)" }), null);
  assert.equal(parseProfile({ ...profile, npsn: "123" }), null);
  assert.ok(parsePublicApplicant(applicant));
  assert.ok(parsePublicApplicant({ ...applicant, nik: "", nisn: "0123456789" }));
  for (const bad of [{ nik: "", nisn: "" }, { nik: "123" }, { tanggalLahir: "2001-02-29" }, { jenisKelamin: "X" }, { jenjang: "Paket D" }, { telepon: "abc" }]) {
    assert.equal(parsePublicApplicant({ ...applicant, ...bad }), null);
  }
  assert.equal(schoolSlugBase("Login"), "lembagalogin");
});

test("public portal and profile isolate tenants, enforce plan and persist registration data", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = "https://rsch.my.id";
  process.env.LOGIN_RATE_LIMIT_SECRET = "ab".repeat(32);
  const { prisma, loginPool, pool } = await import("./db.js");
  const { default: app } = await import("./server.js");
  let tier = "basic";
  let status: "ACTIVE" | "SUSPENDED" = "ACTIVE";
  let storedProfile = { ...profile };
  let created: Record<string, unknown> | null = null;
  const school = () => ({ ...storedProfile, id: "school-a", slug: "armilla", status, expiresAt: null, planTier: tier, themeKey: "ocean", adminPhone: "08123456789" });
  Object.defineProperty(prisma.sekolah, "findUnique", { configurable: true, value: async ({ where, select }: { where: { slug?: string; id?: string }; select: Record<string, boolean> }) => {
    const result = where.slug === "armilla" || where.id === "school-a" ? school() : where.slug === "other" ? { ...school(), id: "school-b", slug: "other" } : null;
    return result && Object.fromEntries(Object.entries(result).filter(([key]) => select[key]));
  } });
  Object.defineProperty(prisma.sekolah, "update", { configurable: true, value: async ({ where, data }: { where: { id: string }; data: typeof profile }) => {
    assert.equal(where.id, "school-a"); storedProfile = { ...storedProfile, ...data }; return storedProfile;
  } });
  Object.defineProperty(prisma.sesiAkun, "findUnique", { configurable: true, value: async () => ({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000), akun: { aktif: true, peran: "ADMIN", sekolahId: "school-a", sekolah: { status: "ACTIVE", expiresAt: null } } }) });
  Object.defineProperty(loginPool, "query", { configurable: true, value: async () => ({ rows: [{ count: 1, remaining: 3600 }] }) });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
    $queryRaw: async (_query: TemplateStringsArray, slug: string) => slug === "armilla" ? [{ id: "school-a" }] : [],
    sekolah: { findUnique: async () => school() },
    pPDB: { create: async ({ data }: { data: Record<string, unknown> }) => { created = data; } },
  }) });
  const server = express().use((req, _res, next) => { if (req.get("x-test-host")) req.headers.host = req.get("x-test-host"); next(); }).use(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "GET", host = "pkbm.siput.id", body?: unknown, cookie?: string) => fetch(base + path, { method, headers: { "x-test-host": host, origin: `https://${host}`, "x-vercel-forwarded-for": "192.0.2.1", ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const publicResponse = await request("/api/public/sekolah/armilla");
    assert.equal(publicResponse.status, 200);
    const publicData = await publicResponse.json();
    assert.equal(publicData.nama, "PKBM Uji"); assert.equal(publicData.teleponWa, "08123456789"); assert.equal(publicData.planTier, "basic");
    assert.equal("id" in publicData, false); assert.equal("status" in publicData, false);
    assert.equal((await request("/api/public/sekolah/missing")).status, 404);
    assert.equal((await request("/api/public/sekolah/armilla", "GET", "other.rsch.my.id")).status, 404);
    assert.equal((await request("/api/sekolah/profil")).status, 404);
    assert.equal((await request("/api/sekolah/profil", "GET", "armilla.rsch.my.id")).status, 401);
    const cookie = `sekolah_session=${"a".repeat(64)}`;
    assert.equal((await request("/api/sekolah/profil", "GET", "other.rsch.my.id", undefined, cookie)).status, 401);
    assert.equal((await request("/api/sekolah/profil", "PUT", "armilla.rsch.my.id", { ...profile, namaYayasan: "YAYASAN UJI", namaKetuaPkbm: "Ketua Uji" }, cookie)).status, 200);
    assert.equal((await (await request("/api/public/sekolah/armilla")).json()).namaYayasan, "YAYASAN UJI");
    assert.equal((await request("/api/sekolah/profil", "PUT", "armilla.rsch.my.id", { ...profile, logoUrl: "data:image/png;base64,YWJj" }, cookie)).status, 400);
    const blocked = await request("/api/public/sekolah/armilla/ppdb", "POST", "pkbm.siput.id", applicant);
    assert.equal(blocked.status, 403); assert.equal(created, null);
    tier = "reguler";
    assert.equal((await request("/api/public/sekolah/armilla/ppdb", "POST", "pkbm.siput.id", { ...applicant, nik: "1" })).status, 400);
    const registered = await request("/api/public/sekolah/armilla/ppdb", "POST", "pkbm.siput.id", applicant);
    assert.equal(registered.status, 201);
    const receipt = await registered.json();
    assert.match(receipt.noDaftar, /^[a-f0-9]{32}$/);
    assert.ok(created);
    assert.equal((created as Record<string, unknown>).sekolahId, "school-a");
    assert.equal((created as Record<string, unknown>).noDaftar, receipt.noDaftar);
    assert.equal((created as Record<string, unknown>).nik, applicant.nik);
    status = "SUSPENDED";
    assert.equal((await request("/api/public/sekolah/armilla")).status, 404);
    assert.equal((await request("/api/public/sekolah/armilla/ppdb", "POST", "pkbm.siput.id", applicant)).status, 404);
  } finally { server.close(); await once(server, "close"); await prisma.$disconnect(); await loginPool.end(); await pool.end(); }
});
