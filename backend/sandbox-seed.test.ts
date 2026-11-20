import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { verifyPassword } from "./password.js";
import { RESERVED_SUBDOMAINS, tenantHost } from "./tenant-host.js";
import { resolveSchoolWithSandboxSeed, SANDBOX_ADMIN_EMAIL, SANDBOX_DEMO_PASSWORD } from "./sandbox-seed.js";

test("sandbox subdomain is allowed in tenantHost and not in RESERVED_SUBDOMAINS", () => {
  assert.equal(RESERVED_SUBDOMAINS.has("sandbox"), false);
  assert.deepEqual(tenantHost("sandbox.pkbm.siput.id", true, "https://pkbm.siput.id"), {
    kind: "school",
    slug: "sandbox",
  });
  assert.deepEqual(tenantHost("www.pkbm.siput.id", true, "https://pkbm.siput.id"), {
    kind: "main",
  });
});

test("resolveSchoolWithSandboxSeed auto-seeds sandbox tenant and demo records once", async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  try {
    const schools: Array<Record<string, unknown>> = [];
    const accounts: Array<Record<string, unknown>> = [];
    const teachers: Array<Record<string, unknown>> = [];
    const classes: Array<Record<string, unknown>> = [];
    const students: Array<Record<string, unknown>> = [];
    const subjects: Array<Record<string, unknown>> = [];
    const years: Array<Record<string, unknown>> = [];
    const schedules: Array<Record<string, unknown>> = [];
    const websiteSettings: Array<Record<string, unknown>> = [];

    let seq = 1;
    const nextId = (prefix: string) => `${prefix}-${seq++}`;

    const mockPrisma = {
      sekolah: {
        findUnique: async ({ where }: { where: { slug?: string; npsn?: string } }) =>
          schools.find((s) => (where.slug ? s.slug === where.slug : s.npsn === where.npsn)) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("school"), expiresAt: null, ...data };
          schools.push(record);
          return record;
        },
      },
      websiteSettings: {
        findUnique: async ({ where }: { where: { school_id?: string } }) =>
          websiteSettings.find((w) => w.school_id === where.school_id) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          websiteSettings.push(data);
          return data;
        },
      },
      akun: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          accounts.find((a) => where.email && a.email === where.email) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("akun"), ...data };
          accounts.push(record);
          return record;
        },
      },
      guru: {
        findUnique: async ({ where }: { where: { nuptk?: string } }) =>
          teachers.find((t) => where.nuptk && t.nuptk === where.nuptk) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("guru"), ...data };
          teachers.push(record);
          return record;
        },
      },
      kelas: {
        findUnique: async ({ where }: { where: { kode?: string } }) =>
          classes.find((c) => where.kode && c.kode === where.kode) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("kelas"), ...data };
          classes.push(record);
          return record;
        },
      },
      siswa: {
        findUnique: async ({ where }: { where: { nisn?: string } }) =>
          students.find((s) => where.nisn && s.nisn === where.nisn) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("siswa"), ...data };
          students.push(record);
          return record;
        },
      },
      mapel: {
        findUnique: async ({ where }: { where: { kode?: string } }) =>
          subjects.find((m) => where.kode && m.kode === where.kode) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("mapel"), ...data };
          subjects.push(record);
          return record;
        },
      },
      tahunAjaran: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = { id: nextId("ta"), ...data };
          years.push(record);
          return record;
        },
      },
      jadwalPelajaran: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          schedules.push(...data);
          return { count: data.length };
        },
      },
    } as unknown as PrismaClient;

    const missingOther = await resolveSchoolWithSandboxSeed(mockPrisma, "tidakada");
    assert.equal(missingOther, null);

    const seeded = await resolveSchoolWithSandboxSeed(mockPrisma, "sandbox");
    assert.ok(seeded);
    assert.equal(seeded.slug, "sandbox");
    assert.equal(seeded.nama, "Sandbox PKBM Rasyatech");
    assert.equal(seeded.npsn, "P9999999");
    assert.equal(seeded.plan, "pro");
    assert.equal(seeded.status, "ACTIVE");

    assert.equal(schools.length, 1);
    assert.equal(websiteSettings.length, 1);
    assert.equal(teachers.length, 2);
    assert.equal(students.length, 5);
    assert.equal(classes.length, 3);
    assert.equal(subjects.length, 4);
    assert.equal(years.length, 1);
    assert.equal(schedules.length, 3);

    const adminAccount = accounts.find((a) => a.email === SANDBOX_ADMIN_EMAIL && a.peran === "ADMIN");
    assert.ok(adminAccount);
    assert.equal(await verifyPassword(SANDBOX_DEMO_PASSWORD, String(adminAccount.passwordHash)), true);

    const secondCall = await resolveSchoolWithSandboxSeed(mockPrisma, "sandbox");
    assert.equal(secondCall?.id, seeded.id);
    assert.equal(schools.length, 1);
    assert.equal(students.length, 5);
  } finally {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  }
});
