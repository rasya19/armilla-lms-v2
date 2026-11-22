import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";

test("school module routes enforce exact BASIC, REGULER, and PRO plan access matrix while keeping themes global", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma } = await import("./db.js");
  const { schoolTierRoutes } = await import("./school-tier-routes.js");
  const { tahap2AcademicRoutes } = await import("./tahap2-academic-routes.js");
  const { tahap2CbtRoutes } = await import("./tahap2-cbt-routes.js");
  const { tahap2ProRoutes } = await import("./tahap2-pro-routes.js");
  const { tahap2CollabRoutes } = await import("./tahap2-collab-routes.js");

  let activePlan = "Basic";

  const stubDelegate = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "findMany" || prop === "groupBy") return async () => [];
        if (prop === "findUnique" || prop === "findFirst") return async () => null;
        if (prop === "count") return async () => 0;
        if (prop === "aggregate") return async () => ({ _avg: { nilai: null }, _count: { _all: 0 } });
        if (prop === "createMany") return async () => ({ count: 0 });
        return async () => null;
      },
    });

  Object.defineProperty(prisma, "sekolah", {
    configurable: true,
    value: stubDelegate({
      findUnique: async () => ({
        id: "sch-1",
        nama: "PKBM Uji Paket",
        slug: "uji-paket",
        plan: activePlan,
        npsn: "P1234567",
        alamatSekolah: "Jl. Pendidikan",
        kabupatenKota: "Bandung",
        namaKepalaSekolah: "Kepala Uji",
        themeKey: "ocean",
      }),
    }),
  });

  for (const delegate of [
    "kelas",
    "siswa",
    "presensi",
    "pengumpulanTugas",
    "nilai",
    "tugas",
    "ujian",
    "materiAjar",
    "mapel",
    "guru",
    "tahunAjaran",
    "modulKesetaraan",
    "agendaMengajar",
    "catatanRaport",
    "cbtPengaturan",
    "websiteSettings",
    "instrumenSnp",
    "tagihanSpp",
    "alumniTracer",
    "asetSarpras",
    "topikDiskusi",
  ]) {
    Object.defineProperty(prisma, delegate, {
      configurable: true,
      value: stubDelegate(
        delegate === "instrumenSnp"
          ? { findMany: async () => [{ id: "snp-1", standarKode: "SNP-1" }] }
          : {},
      ),
    });
  }

  const getSchoolSession = async () => ({
    sekolahId: "sch-1",
    nama: "Admin Uji",
    peran: "ADMIN" as const,
  });

  const app = express();
  app.use(express.json());
  app.use("/api/sekolah", schoolTierRoutes(async () => "sch-1"));
  app.use("/api/sekolah", tahap2AcademicRoutes(getSchoolSession));
  app.use("/api/sekolah", tahap2CbtRoutes(getSchoolSession));
  app.use("/api/sekolah", tahap2ProRoutes(getSchoolSession));
  app.use("/api/sekolah", tahap2CollabRoutes(getSchoolSession));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}`;

    async function callStatus(path: string, method = "GET", body?: object) {
      const res = await fetch(`${base}${path}`, {
        method,
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      return res.status;
    }

    // 1. PAKET BASIC
    activePlan = "Basic";
    assert.equal(await callStatus("/api/sekolah/modul-kesetaraan"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik?scope=presensi"), 200);
    assert.equal(await callStatus("/api/sekolah/diskusi"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik"), 403);
    assert.equal(await callStatus("/api/sekolah/cbt/ujian"), 403);
    assert.equal(await callStatus("/api/sekolah/raport"), 403);
    assert.equal(await callStatus("/api/sekolah/kartu-digital"), 403);
    assert.equal(await callStatus("/api/sekolah/keuangan"), 403);
    assert.equal(await callStatus("/api/sekolah/alumni"), 403);
    assert.equal(await callStatus("/api/sekolah/aset"), 403);
    assert.equal(await callStatus("/api/sekolah/akreditasi-snp"), 403);
    assert.equal(await callStatus("/api/sekolah/ai-assistant", "POST", { mode: "modul", topik: "Aljabar" }), 403);
    assert.equal(await callStatus("/api/sekolah/tema", "PATCH", { themeKey: "violet" }), 403);

    // 2. PAKET REGULER
    activePlan = "Reguler";
    assert.equal(await callStatus("/api/sekolah/modul-kesetaraan"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik?scope=presensi"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik"), 200);
    assert.equal(await callStatus("/api/sekolah/cbt/ujian"), 200);
    assert.equal(await callStatus("/api/sekolah/raport"), 200);
    assert.equal(await callStatus("/api/sekolah/kartu-digital"), 200);
    assert.equal(await callStatus("/api/sekolah/keuangan"), 403);
    assert.equal(await callStatus("/api/sekolah/alumni"), 403);
    assert.equal(await callStatus("/api/sekolah/aset"), 403);
    assert.equal(await callStatus("/api/sekolah/akreditasi-snp"), 403);
    assert.equal(await callStatus("/api/sekolah/ai-assistant", "POST", { mode: "modul", topik: "Aljabar" }), 403);
    assert.equal(await callStatus("/api/sekolah/tema", "PATCH", { themeKey: "violet" }), 403);

    // 3. PAKET PRO
    activePlan = "Pro";
    assert.equal(await callStatus("/api/sekolah/modul-kesetaraan"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik?scope=presensi"), 200);
    assert.equal(await callStatus("/api/sekolah/rekap-akademik"), 200);
    assert.equal(await callStatus("/api/sekolah/cbt/ujian"), 200);
    assert.equal(await callStatus("/api/sekolah/raport"), 200);
    assert.equal(await callStatus("/api/sekolah/kartu-digital"), 200);
    assert.equal(await callStatus("/api/sekolah/keuangan"), 200);
    assert.equal(await callStatus("/api/sekolah/alumni"), 200);
    assert.equal(await callStatus("/api/sekolah/aset"), 200);
    assert.equal(await callStatus("/api/sekolah/akreditasi-snp"), 200);
    assert.equal(await callStatus("/api/sekolah/ai-assistant", "POST", { mode: "modul", topik: "Aljabar" }), 200);
    // Display theme remains centrally controlled by Master Admin across all plans
    assert.equal(await callStatus("/api/sekolah/tema", "PATCH", { themeKey: "violet" }), 403);
  } finally {
    server.close();
    await once(server, "close");
  }
});
