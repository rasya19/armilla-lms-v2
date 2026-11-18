import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
test("production routes work without an opt-in while enforcing authentication and PPDB rate limits", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = "https://rsch.my.id";
  process.env.LOGIN_RATE_LIMIT_SECRET = "ab".repeat(32);
  delete process.env.LMS_ENABLE_EXPERIMENTAL_FEATURES;
  process.env.MASTER_PROVISION_SECRET = "test-provision-secret";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { hashPassword } = await import("./password.js");
  const { default: app } = await import("./server.js");
  let count = 0;
  let limitFails = false;
  const passwordHash = await hashPassword("test-password");
  let schoolStatus = "ACTIVE";
  let schoolLookupFails = false;
  let summaryFails = false;
  let sessions = 0;
  const account = { id: "account-id", nama: "Penguji", email: "test@example.invalid", passwordHash, aktif: true, peran: "ADMIN", sekolahId: "school-id" };
  const schoolHost = "sekolahuji.rsch.my.id";
  let loginAccount: object = account;
  let provisioned: object | null = null;
  Object.defineProperty(prisma.akun, "findUnique", { configurable: true, value: async () => loginAccount });
  Object.defineProperty(prisma.akun, "findFirst", { configurable: true, value: async () => loginAccount });
  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (fn: (tx: object) => Promise<unknown>) => {
      let queryCount = 0;
      return fn({
        $queryRaw: async () => ++queryCount === 1 ? [loginAccount] : [{ status: schoolStatus, expiresAt: null }],
        sesiAkun: { create: async () => { sessions++; } },
        sekolah: { findUnique: async () => null, create: async () => ({ id: "school-id" }) },
        akun: {
          findUnique: async () => null,
          create: async ({ data }: { data: { nama: string; email: string; passwordHash: string; sekolahId: string; peran: "ADMIN" } }) => {
            provisioned = { id: "new-admin", aktif: true, ...data };
          },
        },
        pendaftaranSekolah: { updateMany: async () => ({ count: 1 }) },
      });
    },
  });
  Object.defineProperty(loginPool, "connect", {
    configurable: true,
    value: async () => ({
      query: async () => ({ rows: [] }),
      release: () => undefined,
    }),
  });
  Object.defineProperty(loginPool, "query", {
    configurable: true,
    value: async (_sql: string, values?: [string, number]) => {
      if (!values) return { rows: [] };
      if (limitFails) throw new Error("database unavailable");
      assert.equal(values[1], 3600);
      return { rows: [{ count: ++count, remaining: 3600 }] };
    },
  });
  Object.defineProperty(prisma.sekolah, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { slug?: string; id?: string } }) => {
      if (schoolLookupFails) throw new Error("database unavailable");
      if (where.slug === "sekolahuji" || where.id === "school-id") return { id: "school-id", slug: "sekolahuji", nama: "Sekolah Uji", status: schoolStatus, expiresAt: null, themeKey: "emerald" };
      if (where.slug === "lain") return { id: "other-school", slug: "lain", nama: "Sekolah Lain", status: "ACTIVE", expiresAt: null };
      return null;
    },
  });
  Object.defineProperty(prisma.sesiAkun, "findUnique", {
    configurable: true,
    value: async ({ include }: { include: { akun: { include: { sekolah: { select: object }; siswa?: { select: object } } } } }) => {
      assert.deepEqual(include.akun.include.sekolah.select, { status: true, expiresAt: true });
      if (include.akun.include.siswa) assert.deepEqual(include.akun.include.siswa.select, { sekolahId: true, status: true, kelasId: true });
      return { revokedAt: null, expiresAt: new Date(Date.now() + 60_000), akun: { ...loginAccount, sekolah: { status: "ACTIVE", expiresAt: null } } };
    },
  });
  Object.defineProperty(prisma.siswa, "findMany", {
    configurable: true,
    value: async ({ where }: { where: { sekolahId: string } }) => {
      assert.equal(where.sekolahId, "school-id");
      return [{ id: "student-id", nama: "Siswa", nisn: "1234567890", status: "Aktif", akun: null }];
    },
  });
  for (const [model, expectedStatus, count] of [
    [prisma.siswa, "Aktif", 3],
    [prisma.guru, "Aktif", 2],
    [prisma.kelas, undefined, 1],
  ] as const) {
    Object.defineProperty(model, "count", {
      configurable: true,
      value: async ({ where }: { where: { sekolahId: string; status?: string } }) => {
        assert.equal(where.sekolahId, "school-id");
        assert.equal(where.status, expectedStatus);
        if (summaryFails) throw new Error("database unavailable");
        return count;
      },
    });
  }
  Object.defineProperty(prisma.pPDB, "count", {
    configurable: true,
    value: async ({ where }: { where: { sekolahId: string; status: string } }) => {
      assert.equal(where.sekolahId, "school-id");
      if (summaryFails) throw new Error("database unavailable");
      if (where.status === "Pending") return 4;
      if (where.status === "Diterima") return 2;
      if (where.status === "Ditolak") return 1;
      throw new Error("Unexpected PPDB status");
    },
  });
  const server = express().use((req, _res, next) => { if (req.get("x-test-host")) req.headers.host = req.get("x-test-host"); next(); }).use(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const routes: [string, string, number][] = [
      ["POST", "/api/auth/sekolah/login", 400],
      ["POST", "/api/auth/lms/login", 400],
      ["GET", "/api/auth/lms/session", 401],
      ["GET", "/api/tenant/theme?scope=sekolah", 401],
      ["GET", "/api/tenant/theme?scope=lms", 401],
      ["POST", "/api/auth/lms/ganti-password", 401],
      ["GET", "/api/lms/beranda", 401],
      ["GET", "/api/lms/jadwal", 401],
      ["GET", "/api/lms/guru/siswa-reset", 401],
      ["POST", "/api/lms/guru/siswa/id/reset-password", 401],
      ["GET", "/api/lms/pembelajaran/materi", 401],
      ["POST", "/api/sekolah/siswa/id/akun", 401],
      ["POST", "/api/sekolah/siswa/id/reset-password", 401],
      ["POST", "/api/sekolah/siswa/import", 401],
      ["POST", "/api/sekolah/guru", 401],
      ["GET", "/api/ppdb/test", 404],
      ["POST", "/api/sekolah/ppdb/id/tinjau", 401],
      ["GET", "/api/sekolah/akademik", 401],
      ["GET", "/api/sekolah/kelas", 401],
      ["POST", "/api/sekolah/kelas", 401],
      ["PATCH", "/api/sekolah/kelas/id", 401],
      ["GET", "/api/sekolah/penempatan-siswa", 401],
      ["PATCH", "/api/sekolah/siswa/id/kelas", 401],
      ["GET", "/api/sekolah/siswa", 401],
      ["GET", "/api/sekolah/ringkasan", 401],
    ];
    const request = (method: string, path: string, headers: Record<string, string> = {}) => fetch(base + path, {
      method,
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1", ...headers },
      ...(method !== "GET" ? { body: "{}" } : {}),
    });
    for (const [method, path, status] of routes) {
      assert.equal((await request(method, path)).status, status, `${method} ${path}`);
    }
    assert.equal((await request("POST", "/api/auth/sekolah/login", { origin: "https://evil.example.invalid" })).status, 403);
    const login = () => fetch(base + "/api/auth/sekolah/login", {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ email: account.email, password: "test-password" }),
    });
    const provision = await fetch(base + "/api/internal/provision", {
      method: "POST",
      headers: { authorization: "Bearer test-provision-secret", "content-type": "application/json" },
      body: JSON.stringify({ institutionName: "Sekolah Uji", npsn: "P1234567", subdomain: "sekolahuji", adminName: "Admin Uji", adminEmail: "new@example.invalid", adminPhone: "08123456789", plan: "Tahunan", expiresAt: "2099-12-31T23:59:59Z" }),
    });
    assert.equal(provision.status, 201);
    const credentials = await provision.json();
    assert.ok(provisioned);
    loginAccount = provisioned;
    const newAdminLogin = await fetch(base + "/api/auth/sekolah/login", {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ email: credentials.initialUsername, password: credentials.temporaryPassword }),
    });
    assert.equal(newAdminLogin.status, 200);
    loginAccount = account;
    sessions = 0;
    const authenticated = await login();
    assert.equal(authenticated.status, 200);
    assert.match(authenticated.headers.get("set-cookie") ?? "", /HttpOnly; Secure; SameSite=Strict/);
    const cookie = (authenticated.headers.get("set-cookie") ?? "").split(";")[0];
    assert.equal((await request("GET", "/api/auth/sekolah/session", { cookie })).status, 200);
    const theme = await request("GET", "/api/tenant/theme?scope=sekolah", { cookie });
    assert.equal(theme.status, 200);
    assert.equal(theme.headers.get("cache-control"), "no-store");
    assert.deepEqual(await theme.json(), { themeKey: "emerald" });
    assert.equal((await request("GET", "/api/tenant/theme?scope=lms", { cookie })).status, 401);
    assert.equal((await request("GET", "/api/tenant/theme", { cookie })).status, 400);
    assert.equal((await request("GET", "/api/tenant/theme?scope=sekolah", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    const summary = await request("GET", "/api/sekolah/ringkasan", { cookie });
    assert.equal(summary.status, 200);
    assert.deepEqual(await summary.json(), { siswa: 3, guru: 2, kelas: 1, ppdb: 4, ppdbDiterima: 2, ppdbDitolak: 1 });
    assert.equal((await request("GET", "/api/sekolah/ringkasan", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    summaryFails = true;
    assert.equal((await request("GET", "/api/sekolah/ringkasan", { cookie })).status, 503);
    summaryFails = false;
    const students = await request("GET", "/api/sekolah/siswa", { cookie });
    assert.equal(students.status, 200);
    assert.deepEqual((await students.json()).rows.map((row: { id: string }) => row.id), ["student-id"]);
    const originalTransaction = prisma.$transaction;
    let otherTenant = false;
    let updatedSql = "";
    let createdStudents: unknown = null;
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
      siswa: {
        findMany: async () => [{ nisn: "0123456789", sekolahId: otherTenant ? "other-school" : "school-id" }],
        createMany: async (args: unknown) => { createdStudents = args; },
      },
      $executeRaw: async (strings: TemplateStringsArray) => { updatedSql = strings.join("?"); return 1; },
    }) });
    const importStudents = () => fetch(base + "/api/sekolah/siswa/import", {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, cookie, "content-type": "application/json" },
      body: JSON.stringify({ rows: [
        { nama: "Siswa Lama", nisn: "0123456789", tanggalLahir: "2000-02-29", namaAyah: "Ayah" },
        { nama: "Siswa Baru", nisn: "1234567890", nik: "1234567890123456", jenisKelamin: "L" },
      ] }),
    });
    const imported = await importStudents();
    assert.equal(imported.status, 200);
    assert.deepEqual(await imported.json(), { created: 1, updated: 1 });
    assert.match(updatedSql, /siswa\."sekolahId" =/);
    assert.match(updatedSql, /COALESCE\(data\.tanggal_lahir, siswa\."tanggalLahir"\)/);
    assert.deepEqual(createdStudents, { data: [{ nama: "Siswa Baru", nisn: "1234567890", nik: "1234567890123456", jenisKelamin: "L", sekolahId: "school-id", status: "Aktif" }] });
    otherTenant = true;
    assert.equal((await importStudents()).status, 409);
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: originalTransaction });
    const teachers = Array.from({ length: 28 }, (_, index) => ({
      id: `teacher-${index}`, sekolahId: "school-id", nama: `Guru ${index}`, nuptk: `NUPTK${index}`, email: `teacher${index}@example.invalid`, status: "Aktif", akun: null,
    })).concat([{ id: "other", sekolahId: "other-school", nama: "Guru luar", nuptk: "NUPTK99", email: "other@example.invalid", status: "Aktif", akun: null }]);
    type TeacherWhere = { sekolahId: string; OR?: { nama?: { contains: string; mode: string }; nuptk?: { contains: string; mode: string }; email?: { contains: string; mode: string } }[] };
    const matchesTeacher = (where: TeacherWhere) => {
      assert.equal(where.sekolahId, "school-id");
      if (where.OR) {
        assert.deepEqual(where.OR.map((entry) => Object.keys(entry)[0]), ["nama", "nuptk", "email"]);
        assert.ok(where.OR.every((entry) => Object.values(entry)[0].mode === "insensitive"));
      }
      const term = where.OR?.[0].nama?.contains.toLowerCase();
      return teachers.filter((teacher) => teacher.sekolahId === where.sekolahId && (!term || [teacher.nama, teacher.nuptk, teacher.email].some((value) => value.toLowerCase().includes(term))));
    };
    Object.defineProperty(prisma.guru, "findMany", { configurable: true, value: async ({ where, skip, take }: { where: TeacherWhere; skip: number; take: number }) => matchesTeacher(where).slice(skip, skip + take) });
    Object.defineProperty(prisma.guru, "count", { configurable: true, value: async ({ where }: { where: TeacherWhere }) => matchesTeacher(where).length });
    const teacherPage = await request("GET", "/api/sekolah/guru?page=1", { cookie });
    const firstTeachers = await teacherPage.json();
    assert.equal(firstTeachers.total, 28);
    assert.equal(firstTeachers.rows.length, 25);
    assert.equal(firstTeachers.hasNext, true);
    const secondTeachers = await (await request("GET", "/api/sekolah/guru?page=2", { cookie })).json();
    assert.equal(secondTeachers.rows.length, 3);
    assert.equal(secondTeachers.hasNext, false);
    for (const search of ["gUrU 7", "nuptk7", "TEACHER7@"]) {
      const result = await (await request("GET", `/api/sekolah/guru?q=${encodeURIComponent(search)}`, { cookie })).json();
      assert.equal(result.total, 1);
      assert.equal(result.rows[0].id, "teacher-7");
    }
    assert.equal((await request("GET", `/api/sekolah/guru?q=${"a".repeat(101)}`, { cookie })).status, 400);
    assert.equal((await request("GET", "/api/sekolah/guru?q=guru", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    Object.defineProperty(prisma.kelas, "findFirst", { configurable: true, value: async ({ where }: { where: { id: string; sekolahId: string } }) => {
      assert.equal(where.sekolahId, "school-id");
      return where.id === "class-a" ? { id: "class-a" } : null;
    } });
    Object.defineProperty(prisma.siswa, "groupBy", { configurable: true, value: async ({ where }: { where: { sekolahId: string; status: string; kelasId: { not: null } } }) => {
      assert.deepEqual(where, { sekolahId: "school-id", status: "Aktif", kelasId: { not: null } });
      return [{ kelasId: "class-a", _count: { _all: 2 } }];
    } });
    Object.defineProperty(prisma.siswa, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string; kelasId: string; status: string } }) => {
      assert.deepEqual(where, { sekolahId: "school-id", kelasId: "class-a", status: "Aktif" });
      return [
        { id: "s1", nama: "Siswa Satu", nisn: "0000000001", akun: { aktif: true, peran: "SISWA", sekolahId: "school-id", guruId: null } },
        { id: "s2", nama: "Siswa Dua", nisn: "0000000002", akun: null },
      ];
    } });
    const promotion = await request("GET", "/api/sekolah/kenaikan-kelas?kelasId=class-a", { cookie });
    assert.equal(promotion.status, 200);
    assert.deepEqual(await promotion.json(), { counts: [{ kelasId: "class-a", jumlah: 2 }], siswa: [
      { id: "s1", nama: "Siswa Satu", nisn: "0000000001", statusAkun: "Akun aktif" },
      { id: "s2", nama: "Siswa Dua", nisn: "0000000002", statusAkun: "Belum ada akun" },
    ] });
    assert.equal((await request("GET", "/api/sekolah/kenaikan-kelas?kelasId=other-class", { cookie })).status, 404);
    assert.equal((await request("GET", "/api/sekolah/kenaikan-kelas?kelasId=class-a", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    assert.equal((await request("GET", "/api/sekolah/kenaikan-kelas?kelasId=class-a")).status, 401);
    Object.defineProperty(prisma.kelas, "findMany", { configurable: true, value: async ({ where }: { where: { sekolahId: string } }) => {
      assert.equal(where.sekolahId, "school-id"); return [{ id: "class-a", nama: "Kelas 9", waliGuruId: null }];
    } });
    Object.defineProperty(prisma.guru, "findMany", { configurable: true, value: async () => [] });
    const classList = await request("GET", "/api/sekolah/kelas", { cookie });
    assert.equal(classList.status, 200);
    assert.equal((await classList.json()).kelas[0].jumlahSiswa, 2);
    Object.defineProperty(prisma.siswa, "findMany", { configurable: true, value: async ({ where, skip, take }: { where: { sekolahId: string; status?: string; kelasId?: null | { not: null }; OR?: { nama?: { contains: string }; nisn?: { contains: string } }[] }; skip: number; take: number }) => {
      assert.equal(where.sekolahId, "school-id");
      const entries = Array.from({ length: 28 }, (_, index) => ({ id: `s${index}`, nama: `Siswa ${index}`, nisn: String(index).padStart(10, "0"), kelasId: index % 2 ? "class-a" : null, status: index === 0 ? "Nonaktif" : "Aktif", akun: null }));
      return entries.filter((entry) => (!where.status || entry.status === where.status) && (where.kelasId === undefined || (where.kelasId === null ? entry.kelasId === null : entry.kelasId !== null)) && (!where.OR || entry.nama.toLowerCase().includes(where.OR[0].nama?.contains.toLowerCase() ?? "") || entry.nisn.includes(where.OR[1].nisn?.contains ?? ""))).slice(skip, skip + take);
    } });
    const filtered = await (await request("GET", "/api/sekolah/siswa?kelas=belum&aktif=1&q=siswa%202", { cookie })).json();
    assert.ok(filtered.rows.length > 0);
    assert.ok(filtered.rows.every((row: { status: string; kelasId: string | null; nama: string }) => row.status === "Aktif" && row.kelasId === null && row.nama.toLowerCase().includes("siswa 2")));
    const secondPage = await (await request("GET", "/api/sekolah/siswa?page=2", { cookie })).json();
    assert.equal(secondPage.rows.length, 3);
    assert.equal((await request("GET", "/api/sekolah/siswa?kelas=lain", { cookie })).status, 400);
    assert.equal((await request("GET", "/api/sekolah/siswa?aktif=0", { cookie })).status, 400);
    const transaction = prisma.$transaction;
    let updated = true;
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => fn({
      $queryRaw: async (_query: TemplateStringsArray, target: string, school: string) => {
        assert.equal(school, "school-id");
        return target === "class-b" ? [{ id: "class-b" }] : [];
      },
      siswa: { updateMany: async ({ where, data }: { where: object; data: object }) => {
        assert.deepEqual(where, { id: "s1", sekolahId: "school-id", status: "Aktif", kelasId: "class-a" });
        assert.deepEqual(data, { kelasId: "class-b" });
        return { count: updated ? 1 : 0 };
      } },
    }) });
    const moveStudent = (target: string, headers: Record<string, string> = {}) => fetch(base + "/api/sekolah/siswa/s1/kelas", {
      method: "PATCH",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, cookie, "content-type": "application/json", ...headers },
      body: JSON.stringify({ kelasId: target, expectedKelasId: "class-a" }),
    });
    assert.equal((await moveStudent("class-b")).status, 200);
    updated = false;
    assert.equal((await moveStudent("class-b")).status, 409);
    assert.equal((await moveStudent("other-class")).status, 400);
    assert.equal((await moveStudent("class-b", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id" })).status, 401);
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: transaction });
    const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, cookie, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    let standardCreated = false;
    let classNames = ["Kelas 9"];
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => {
      const stagedNames = [...classNames];
      let stagedCreated = standardCreated;
      const result = await fn({
        $queryRaw: async (_query: TemplateStringsArray, school: string) => { assert.equal(school, "school-id"); return [{ kelasStandarDibuat: stagedCreated }]; },
        kelas: {
          findMany: async ({ where }: { where: { sekolahId: string } }) => { assert.equal(where.sekolahId, "school-id"); return stagedNames.map((nama) => ({ nama })); },
          createMany: async ({ data }: { data: { nama: string; sekolahId: string; waliGuruId: null; kode: string }[] }) => {
            assert.ok(data.every((item) => item.sekolahId === "school-id" && item.waliGuruId === null && item.kode.length === 32));
            stagedNames.push(...data.map((item) => item.nama));
          },
        },
        sekolah: { update: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, "school-id"); stagedCreated = true; } },
      });
      classNames = stagedNames; standardCreated = stagedCreated;
      return result;
    } });
    assert.equal((await postJson("/api/sekolah/kelas-standar", {})).status, 200);
    assert.equal(classNames.length, 12);
    assert.ok(classNames.includes("Kelas 9"));
    assert.ok(classNames.includes("Paket A Kelas 6"));
    assert.ok(classNames.includes("Paket B Kelas 7"));
    assert.ok(classNames.includes("Paket C Kelas 12"));
    assert.equal((await postJson("/api/sekolah/kelas-standar", {})).status, 200);
    assert.equal(classNames.length, 12);
    standardCreated = false; classNames = ["Kelas 9", "Paket B Kelas 9"];
    assert.equal((await postJson("/api/sekolah/kelas-standar", {})).status, 409);
    assert.deepEqual(classNames, ["Kelas 9", "Paket B Kelas 9"]);
    assert.equal(standardCreated, false);
    assert.equal((await postJson("/api/sekolah/kelas-standar", {}, { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id" })).status, 401);

    let placements = new Map([["s1", "class-a"], ["s2", null as string | null]]);
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: async (fn: (tx: object) => Promise<unknown>) => {
      const staged = new Map(placements);
      const result = await fn({
        $queryRaw: async (_query: TemplateStringsArray, target: string, school: string) => { assert.equal(school, "school-id"); return target === "class-b" ? [{ id: target }] : []; },
        siswa: { updateMany: async ({ where, data }: { where: { id: string; sekolahId: string; status: string; kelasId: string | null }; data: { kelasId: string } }) => {
          assert.equal(where.sekolahId, "school-id"); assert.equal(where.status, "Aktif");
          if (!staged.has(where.id) || staged.get(where.id) !== where.kelasId) return { count: 0 };
          staged.set(where.id, data.kelasId); return { count: 1 };
        } },
      });
      placements = staged; return result;
    } });
    const move = { kelasId: "class-b", siswa: [{ id: "s1", expectedKelasId: "class-a" }, { id: "s2", expectedKelasId: null }] };
    assert.equal((await postJson("/api/sekolah/penempatan-massal", { ...move, siswa: [move.siswa[0], move.siswa[0]] })).status, 400);
    assert.equal((await postJson("/api/sekolah/penempatan-massal", { ...move, siswa: [] })).status, 400);
    assert.equal((await postJson("/api/sekolah/penempatan-massal", { ...move, kelasId: "other-class" })).status, 400);
    assert.equal((await postJson("/api/sekolah/penempatan-massal", { ...move, siswa: [move.siswa[0], { id: "s2", expectedKelasId: "wrong" }] })).status, 409);
    assert.deepEqual([...placements.values()], ["class-a", null]);
    const moved = await postJson("/api/sekolah/penempatan-massal", move);
    assert.equal(moved.status, 200);
    assert.deepEqual(await moved.json(), { updated: 2 });
    assert.deepEqual([...placements.values()], ["class-b", "class-b"]);
    assert.equal((await postJson("/api/sekolah/penempatan-massal", move, { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id" })).status, 401);
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: transaction });
    assert.equal((await request("GET", "/api/sekolah/siswa", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    assert.equal((await request("GET", "/api/auth/sekolah/session", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie })).status, 401);
    assert.equal((await request("POST", "/api/auth/sekolah/login", { "x-test-host": "rsch.my.id", origin: "https://rsch.my.id" })).status, 401);
    assert.equal((await request("GET", "/api/tenant/context", { "x-test-host": "tidakada.rsch.my.id" })).status, 404);
    schoolLookupFails = true;
    assert.equal((await request("GET", "/api/tenant/context")).status, 503);
    schoolLookupFails = false;
    const wrongSchool = await fetch(base + "/api/auth/sekolah/login", {
      method: "POST",
      headers: { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ email: account.email, password: "test-password" }),
    });
    assert.equal(wrongSchool.status, 401);
    assert.match((await wrongSchool.json()).error, /instansi/);
    assert.equal(sessions, 1);
    schoolStatus = "SUSPENDED";
    assert.equal((await login()).status, 404);
    assert.equal(sessions, 1);
    schoolStatus = "ACTIVE";
    loginAccount = { ...account, peran: "GURU", guruId: "teacher-id", siswaId: null, guru: { sekolahId: "school-id", status: "Aktif" }, siswa: null, wajibGantiPassword: true };
    const lmsLogin = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: account.email, password: "test-password", peran: "GURU" }),
    });
    assert.equal(lmsLogin.status, 200);
    assert.equal((await lmsLogin.json()).wajibGantiPassword, true);
    assert.equal(sessions, 2);
    const wrongTeacher = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: account.email, password: "test-password", peran: "GURU" }),
    });
    assert.equal(wrongTeacher.status, 401);
    assert.equal((await request("POST", "/api/auth/lms/login", { "x-test-host": "rsch.my.id", origin: "https://rsch.my.id" })).status, 401);
    const lmsCookie = (lmsLogin.headers.get("set-cookie") ?? "").split(";")[0];
    assert.equal((await request("GET", "/api/auth/lms/session", { cookie: lmsCookie })).status, 200);
    assert.equal((await request("GET", "/api/auth/lms/session", { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", cookie: lmsCookie })).status, 401);
    loginAccount = { ...account, peran: "SISWA", siswaId: "student-id", guruId: null, siswa: { sekolahId: "school-id", status: "Aktif" }, guru: null, wajibGantiPassword: true };
    const studentLogin = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { "x-test-host": schoolHost, origin: `https://${schoolHost}`, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: "1234567890", password: "test-password", peran: "SISWA" }),
    });
    assert.equal(studentLogin.status, 200);
    assert.equal((await studentLogin.json()).wajibGantiPassword, true);
    assert.equal(sessions, 3);
    const wrongStudent = await fetch(base + "/api/auth/lms/login", {
      method: "POST",
      headers: { "x-test-host": "lain.rsch.my.id", origin: "https://lain.rsch.my.id", "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" },
      body: JSON.stringify({ identitas: "1234567890", password: "test-password", peran: "SISWA" }),
    });
    assert.equal(wrongStudent.status, 401);
    assert.equal((await request("GET", "/api/ppdb/lain")).status, 404);
    assert.equal((await request("POST", "/api/ppdb/sekolahuji", { "x-vercel-forwarded-for": "" })).status, 503);
    for (let i = 0; i < 5; i++) assert.equal((await request("POST", "/api/ppdb/sekolahuji")).status, 400);
    const limited = await request("POST", "/api/ppdb/sekolahuji");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3600");
    limitFails = true;
    assert.equal((await request("POST", "/api/ppdb/sekolahuji")).status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
