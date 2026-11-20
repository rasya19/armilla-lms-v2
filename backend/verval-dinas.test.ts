import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import type { DinasContext } from "./dinas-routes.js";
import type { VervalContext } from "./verval-routes.js";

test("vervalRoutes enforces tenant isolation, unified Dapodik Excel import, 4 docs, reconciliation & export", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma } = await import("./db.js");
  const { vervalRoutes, computeVervalCompleteness } = await import("./verval-routes.js");

  const emptyCompleteness = computeVervalCompleteness({});
  assert.equal(emptyCompleteness.kelengkapanPersen, 0);
  assert.equal(emptyCompleteness.berkasCount, 0);
  assert.equal(emptyCompleteness.berkasLengkap, false);
  assert.equal(emptyCompleteness.tanpaBerkas, true);
  assert.equal(emptyCompleteness.totalFields, 15);

  const fullCompleteness = computeVervalCompleteness({
    nik: "3204123456780001",
    noKk: "3204123456789999",
    namaIbuKandung: "Siti Aminah",
    tempatLahir: "Bandung",
    tanggalLahir: new Date("2005-05-12T00:00:00Z"),
    jenisKelamin: "L",
    alamatLengkap: "Jl. Merdeka No. 10",
    desaKelurahan: "Cibeunying",
    kecamatan: "Cimenyan",
    sekolahAsal: "SMP Negeri 1 Bandung",
    nomorIjazahTerakhir: "DN-02/SMP/2021/00123",
    tanggalMasuk: new Date("2026-07-15T00:00:00Z"),
    urlKk: "https://example.com/kk.jpg",
    urlAktaKtp: "https://example.com/akta.jpg",
    urlIjazah: "https://example.com/ijazah.pdf",
    urlSuratPindah: "https://example.com/skp.pdf",
  });
  assert.equal(fullCompleteness.kelengkapanPersen, 100);
  assert.equal(fullCompleteness.berkasCount, 4);
  assert.equal(fullCompleteness.berkasLengkap, true);
  assert.equal(fullCompleteness.tanpaBerkas, false);
  assert.equal(fullCompleteness.missingFields.length, 0);

  const schoolRecords: Array<Record<string, unknown>> = [
    {
      id: "school-a",
      nama: "PKBM A",
      npsn: "P1111111",
      slug: "pkbm-a",
      kabupatenKota: "Kabupaten Bandung",
      izinVervalDinas: true,
      totalSiswaDapodik: 1,
    },
  ];

  const students: Array<Record<string, unknown>> = [
    {
      id: "siswa-a1",
      sekolahId: "school-a",
      nisn: "0123456789",
      nama: "Budi Santoso",
      kelasId: "kelas-a1",
      status: "Aktif",
      nik: "3204123456780001",
      noKk: "3204123456789999",
      tempatLahir: "Bandung",
      tanggalLahir: new Date("2005-05-12T00:00:00Z"),
      jenisKelamin: "L",
      jenjang: "Paket C",
      tanggalMasuk: new Date("2026-07-15T00:00:00Z"),
      namaIbu: "Siti Aminah",
      namaIbuKandung: "Siti Aminah",
      namaAyah: "Joko Santoso",
      alamatLengkap: "Jl. Merdeka No. 10",
      desaKelurahan: "Cibeunying",
      kecamatan: "Cimenyan",
      sekolahAsal: "SMPN 1",
      npsnAsal: "20219001",
      nomorIjazahTerakhir: "DN-01",
      sumberDapodik: true,
      urlKk: "https://example.com/kk.jpg",
      urlAktaKtp: null,
      urlIjazah: null,
      urlSuratPindah: null,
      statusVerval: "BELUM_LENGKAP",
      catatanVerval: null,
      statusVervalDinas: "MENUNGGU_DINAS",
      catatanDinas: null,
    },
    {
      id: "siswa-b1",
      sekolahId: "school-b",
      nisn: "0999999999",
      nama: "Siswa Sekolah B",
      kelasId: null,
      status: "Aktif",
      nik: null,
      noKk: null,
      tempatLahir: null,
      tanggalLahir: null,
      jenisKelamin: null,
      jenjang: "Paket B",
      tanggalMasuk: null,
      namaIbu: null,
      namaIbuKandung: null,
      namaAyah: null,
      alamatLengkap: null,
      desaKelurahan: null,
      kecamatan: null,
      sekolahAsal: null,
      npsnAsal: null,
      nomorIjazahTerakhir: null,
      sumberDapodik: false,
      urlKk: null,
      urlAktaKtp: null,
      urlIjazah: null,
      urlSuratPindah: null,
      statusVerval: "BELUM_LENGKAP",
      catatanVerval: null,
      statusVervalDinas: "MENUNGGU_DINAS",
      catatanDinas: null,
    },
  ];

  const filterRows = (where: Record<string, unknown>) => {
    return students.filter((s) => {
      if (where.sekolahId && s.sekolahId !== where.sekolahId) return false;
      if (where.NOT && typeof where.NOT === "object" && (where.NOT as { sekolahId?: string }).sekolahId === s.sekolahId) {
        return false;
      }
      if (where.nisn && typeof where.nisn === "object" && Array.isArray((where.nisn as { in?: string[] }).in)) {
        if (!(where.nisn as { in: string[] }).in.includes(String(s.nisn))) return false;
      }
      if (where.AND && Array.isArray(where.AND)) {
        if (s.urlKk || s.urlAktaKtp || s.urlIjazah || s.urlSuratPindah) return false;
      }
      return true;
    });
  };

  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  });
  Object.defineProperty(prisma.sekolah, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { id: string } }) =>
      schoolRecords.find((s) => s.id === where.id) ?? null,
  });
  Object.defineProperty(prisma.sekolah, "update", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const target = schoolRecords.find((s) => s.id === where.id);
      assert.ok(target);
      Object.assign(target, data);
      return target;
    },
  });
  Object.defineProperty(prisma.kelas, "findMany", {
    configurable: true,
    value: async () => [{ id: "kelas-a1", nama: "Paket C XI" }],
  });
  Object.defineProperty(prisma.siswa, "findMany", {
    configurable: true,
    value: async ({ where }: { where: Record<string, unknown> }) => filterRows(where),
  });
  Object.defineProperty(prisma.siswa, "count", {
    configurable: true,
    value: async ({ where }: { where: Record<string, unknown> }) => filterRows(where).length,
  });
  Object.defineProperty(prisma.siswa, "findFirst", {
    configurable: true,
    value: async ({ where }: { where: { id: string; sekolahId: string } }) =>
      students.find((s) => s.id === where.id && s.sekolahId === where.sekolahId) ?? null,
  });
  Object.defineProperty(prisma.siswa, "update", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const target = students.find((s) => s.id === where.id);
      assert.ok(target);
      Object.assign(target, data);
      return target;
    },
  });
  Object.defineProperty(prisma.siswa, "createMany", {
    configurable: true,
    value: async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const [i, item] of data.entries()) {
        students.push({
          id: `siswa-new-${i + 1}`,
          kelasId: null,
          urlKk: null,
          urlAktaKtp: null,
          urlIjazah: null,
          urlSuratPindah: null,
          catatanVerval: null,
          statusVervalDinas: "MENUNGGU_DINAS",
          catatanDinas: null,
          ...item,
        });
      }
      return { count: data.length };
    },
  });
  Object.defineProperty(prisma.siswa, "updateMany", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string; sekolahId: string }; data: Record<string, unknown> }) => {
      const target = students.find((s) => s.id === where.id && s.sekolahId === where.sekolahId);
      if (!target) return { count: 0 };
      Object.assign(target, data);
      return { count: 1 };
    },
  });

  const server = express()
    .use(express.json())
    .use(
      "/verval",
      vervalRoutes(async (req): Promise<VervalContext | null> => {
        const role = req.get("x-role");
        const sekolahId = req.get("x-school");
        if (!role || !sekolahId) return null;
        if (role === "ADMIN") return { sekolahId, role: "ADMIN" };
        if (role === "SISWA") return { sekolahId, role: "SISWA", siswaId: req.get("x-siswa") ?? null };
        return null;
      }),
    )
    .listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/verval`;

    assert.equal((await fetch(`${base}/siswa`)).status, 401);
    assert.equal(
      (await fetch(`${base}/siswa`, { headers: { "x-role": "SISWA", "x-school": "school-a", "x-siswa": "siswa-a1" } })).status,
      403,
    );

    // Import Dapodik: reject non-admin and cross-tenant NISN conflict
    assert.equal(
      (
        await fetch(`${base}/import-dapodik`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-role": "SISWA", "x-school": "school-a", "x-siswa": "siswa-a1" },
          body: JSON.stringify({ rows: [{ nisn: "0123456789", nama: "Budi Santoso" }] }),
        })
      ).status,
      403,
    );

    assert.equal(
      (
        await fetch(`${base}/import-dapodik`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-role": "ADMIN", "x-school": "school-a" },
          body: JSON.stringify({ rows: [{ nisn: "0999999999", nama: "Konflik Lintas Tenant" }] }),
        })
      ).status,
      409,
    );

    // Import Dapodik: upsert existing by NIK & create new without files
    const importRes = await fetch(`${base}/import-dapodik`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "ADMIN", "x-school": "school-a" },
      body: JSON.stringify({
        totalDapodikCount: 2,
        rows: [
          {
            nik: "3204123456780001",
            nisn: "0123456789",
            nama: "Budi Santoso",
            jenjang: "Paket C",
            namaIbuKandung: "Siti Aminah",
          },
          {
            nik: "3204123456780099",
            nisn: "0123456799",
            nama: "Rina Marlina",
            jenjang: "Paket B",
            namaIbuKandung: "Nani",
          },
        ],
      }),
    });
    assert.equal(importRes.status, 200);
    const importBody = (await importRes.json()) as { created: number; updated: number; totalSiswaDapodik: number };
    assert.equal(importBody.created, 1);
    assert.equal(importBody.updated, 1);
    assert.equal(importBody.totalSiswaDapodik, 2);
    // Existing uploaded KK is preserved on upsert
    assert.equal(students[0].urlKk, "https://example.com/kk.jpg");

    const listRes = await fetch(`${base}/siswa`, { headers: { "x-role": "ADMIN", "x-school": "school-a" } });
    assert.equal(listRes.status, 200);
    const listData = (await listRes.json()) as {
      rows: Array<{ id: string; kelengkapanPersen: number; berkasCount: number }>;
      summary: { total: number; totalDapodik: number; berkasLengkap: number; belumAdaBerkas: number; selisihTanpaBerkas: number };
    };
    assert.equal(listData.summary.total, 2);
    assert.equal(listData.summary.totalDapodik, 2);
    assert.equal(listData.summary.belumAdaBerkas, 1);
    assert.equal(listData.summary.selisihTanpaBerkas, 2);

    // Quick filter ?tanpaBerkas=true only returns Rina Marlina (0 files)
    const noFilesRes = await fetch(`${base}/siswa?tanpaBerkas=true`, {
      headers: { "x-role": "ADMIN", "x-school": "school-a" },
    });
    assert.equal(noFilesRes.status, 200);
    const noFilesBody = (await noFilesRes.json()) as { rows: Array<{ nama: string; tanpaBerkas: boolean }> };
    assert.equal(noFilesBody.rows.length, 1);
    assert.equal(noFilesBody.rows[0].nama, "Rina Marlina");
    assert.equal(noFilesBody.rows[0].tanpaBerkas, true);

    // Student cannot edit another student or force TERVERIFIKASI_PKBM
    assert.equal(
      (
        await fetch(`${base}/siswa/siswa-b1`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-role": "SISWA", "x-school": "school-a", "x-siswa": "siswa-a1" },
          body: JSON.stringify({ nik: "3204123456780002" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/siswa/siswa-a1`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-role": "SISWA", "x-school": "school-a", "x-siswa": "siswa-a1" },
          body: JSON.stringify({ statusVerval: "TERVERIFIKASI_PKBM" }),
        })
      ).status,
      403,
    );

    // Student can upload remaining docs including 4th doc urlSuratPindah & submit SIAP_VERVAL
    const studentSubmit = await fetch(`${base}/siswa/siswa-a1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-role": "SISWA", "x-school": "school-a", "x-siswa": "siswa-a1" },
      body: JSON.stringify({
        urlAktaKtp: "https://example.com/akta.jpg",
        urlIjazah: "https://example.com/ijazah.pdf",
        urlSuratPindah: "https://example.com/surat-pindah.pdf",
        ajukanVerifikasi: true,
      }),
    });
    assert.equal(studentSubmit.status, 200);
    const submittedPayload = (await studentSubmit.json()) as {
      siswa: { statusVerval: string; kelengkapanPersen: number; berkasCount: number; urlSuratPindah: string };
    };
    assert.equal(submittedPayload.siswa.statusVerval, "SIAP_VERVAL");
    assert.equal(submittedPayload.siswa.kelengkapanPersen, 100);
    assert.equal(submittedPayload.siswa.berkasCount, 4);
    assert.equal(submittedPayload.siswa.urlSuratPindah, "https://example.com/surat-pindah.pdf");

    // Admin from school-b cannot mutate siswa-a1
    assert.equal(
      (
        await fetch(`${base}/siswa/siswa-a1`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-role": "ADMIN", "x-school": "school-b" },
          body: JSON.stringify({ statusVerval: "TERVERIFIKASI_PKBM" }),
        })
      ).status,
      404,
    );

    // Export JSON and CSV
    const exportJson = await fetch(`${base}/export`, { headers: { "x-role": "ADMIN", "x-school": "school-a" } });
    assert.equal(exportJson.status, 200);
    const exportBody = (await exportJson.json()) as { columns: string[]; rows: Array<Record<string, string>> };
    assert.equal(exportBody.columns.length, 14);
    assert.equal(exportBody.rows[0]["Status Verval"], "SIAP_VERVAL");

    const exportCsv = await fetch(`${base}/export?format=csv`, { headers: { "x-role": "ADMIN", "x-school": "school-a" } });
    assert.equal(exportCsv.status, 200);
    const csvText = await exportCsv.text();
    assert.ok(csvText.includes("Budi Santoso"));
  } finally {
    server.close();
  }
});

test("dinasRoutes enforces regional kabupaten isolation, administrative-only data, and dinas review", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  const { prisma } = await import("./db.js");
  const { dinasRoutes, resolveActiveCutoffDate } = await import("./dinas-routes.js");

  const cutoff = resolveActiveCutoffDate(new Date("2026-09-10T00:00:00Z"));
  assert.equal(cutoff.cutoffLabel, "2026-08-31");

  const schools = [
    {
      id: "pkbm-bdg",
      nama: "PKBM Harapan Bandung",
      npsn: "P1000001",
      slug: "harapan-bdg",
      plan: "pro",
      status: "ACTIVE",
      kabupatenKota: "Kabupaten Bandung",
      izinVervalDinas: true,
      totalSiswaDapodik: 2,
    },
    {
      id: "pkbm-hidden",
      nama: "PKBM Privat Bandung",
      npsn: "P1000002",
      slug: "privat-bdg",
      plan: "basic",
      status: "ACTIVE",
      kabupatenKota: "Kabupaten Bandung",
      izinVervalDinas: false,
      totalSiswaDapodik: 0,
    },
    {
      id: "pkbm-grt",
      nama: "PKBM Garut Jaya",
      npsn: "P2000001",
      slug: "garut-jaya",
      plan: "reguler",
      status: "ACTIVE",
      kabupatenKota: "Kabupaten Garut",
      izinVervalDinas: true,
      totalSiswaDapodik: 1,
    },
  ];

  const students = [
    {
      id: "s-bdg-1",
      sekolahId: "pkbm-bdg",
      nisn: "0111111111",
      nama: "Andi Bandung",
      kelasId: "k-c",
      jenjang: "Paket C",
      tanggalMasuk: new Date("2026-07-10T00:00:00Z"),
      status: "Aktif",
      sumberDapodik: true,
      statusVerval: "TERVERIFIKASI_PKBM",
      statusVervalDinas: "MENUNGGU_DINAS",
      catatanDinas: null as string | null,
      nik: "3204000000000001",
      noKk: "3204000000000002",
      namaIbu: "Ibu Andi",
      namaIbuKandung: "Ibu Andi",
      tempatLahir: "Bandung",
      tanggalLahir: new Date("2004-01-01T00:00:00Z"),
      jenisKelamin: "L",
      alamatLengkap: "Alamat",
      desaKelurahan: "Desa",
      kecamatan: "Kec",
      sekolahAsal: "SMP",
      npsnAsal: "12345678",
      nomorIjazahTerakhir: "IJZ-1",
      urlKk: "https://example.com/kk.png",
      urlAktaKtp: "https://example.com/akta.png",
      urlIjazah: "https://example.com/ijz.png",
      urlSuratPindah: "https://example.com/skp.png",
      catatanVerval: null,
    },
    {
      id: "s-grt-1",
      sekolahId: "pkbm-grt",
      nisn: "0222222222",
      nama: "Sari Garut",
      kelasId: null,
      jenjang: "Paket B",
      tanggalMasuk: new Date("2026-09-20T00:00:00Z"),
      status: "Aktif",
      sumberDapodik: false,
      statusVerval: "BELUM_LENGKAP",
      statusVervalDinas: "MENUNGGU_DINAS",
      catatanDinas: null as string | null,
    },
  ];

  Object.defineProperty(prisma.sekolah, "findMany", {
    configurable: true,
    value: async ({ where }: { where?: { izinVervalDinas?: boolean } }) =>
      schools.filter((s) => s.status === "ACTIVE" && (where?.izinVervalDinas ? s.izinVervalDinas : true)),
  });
  Object.defineProperty(prisma.sekolah, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { id: string } }) => schools.find((s) => s.id === where.id) ?? null,
  });
  Object.defineProperty(prisma.siswa, "findMany", {
    configurable: true,
    value: async ({ where }: { where: { sekolahId: string | { in: string[] } } }) => {
      const ids = typeof where.sekolahId === "string" ? [where.sekolahId] : where.sekolahId.in;
      return students.filter((s) => ids.includes(s.sekolahId));
    },
  });
  Object.defineProperty(prisma.kelas, "findMany", {
    configurable: true,
    value: async () => [{ id: "k-c", nama: "Paket C XII" }],
  });
  Object.defineProperty(prisma.siswa, "findUnique", {
    configurable: true,
    value: async ({ where }: { where: { id: string } }) => {
      const st = students.find((s) => s.id === where.id);
      if (!st) return null;
      const sc = schools.find((s) => s.id === st.sekolahId) ?? null;
      return { ...st, sekolah: sc };
    },
  });
  Object.defineProperty(prisma.siswa, "update", {
    configurable: true,
    value: async ({ where, data }: { where: { id: string }; data: { statusVervalDinas: string; catatanDinas: string | null } }) => {
      const st = students.find((s) => s.id === where.id);
      assert.ok(st);
      st.statusVervalDinas = data.statusVervalDinas;
      st.catatanDinas = data.catatanDinas;
      return st;
    },
  });

  const server = express()
    .use(express.json())
    .use(
      "/dinas",
      dinasRoutes(async (req): Promise<DinasContext | null> => {
        const mode = req.get("x-dinas");
        if (!mode) return null;
        if (mode === "bandung") {
          return {
            akunId: "dinas-bdg",
            nama: "Petugas Disdik Bandung",
            email: "disdik.bandung@example.id",
            peran: "DINAS",
            wilayahKabupaten: "Kabupaten Bandung",
            isSuperAdmin: false,
          };
        }
        return {
          akunId: "master-1",
          nama: "Master Admin",
          email: "ismantoj88@gmail.com",
          peran: "MASTER_ADMIN",
          wilayahKabupaten: null,
          isSuperAdmin: true,
        };
      }),
    )
    .listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/dinas`;

    assert.equal((await fetch(`${base}/ringkasan`)).status, 401);

    const bdgRes = await fetch(`${base}/ringkasan`, { headers: { "x-dinas": "bandung" } });
    assert.equal(bdgRes.status, 200);
    const bdgBody = (await bdgRes.json()) as {
      kpi: { totalPkbm: number; totalWargaBelajar: number; totalPaketC: number; totalCutoff: number; totalDapodikTarik: number; totalBerkasLengkap: number };
      pkbm: Array<{ id: string; totalSiswaDapodik: number; berkasLengkapCount: number }>;
    };
    assert.equal(bdgBody.kpi.totalPkbm, 1);
    assert.equal(bdgBody.pkbm[0].id, "pkbm-bdg");
    assert.equal(bdgBody.pkbm[0].totalSiswaDapodik, 2);
    assert.equal(bdgBody.pkbm[0].berkasLengkapCount, 1);
    assert.equal(bdgBody.kpi.totalPaketC, 1);
    assert.equal(bdgBody.kpi.totalCutoff, 1);

    // Dinas student endpoint exposes administrative docs only (no attendance/grades)
    const pkbmSiswaRes = await fetch(`${base}/pkbm/pkbm-bdg/siswa`, { headers: { "x-dinas": "bandung" } });
    assert.equal(pkbmSiswaRes.status, 200);
    const pkbmSiswaBody = (await pkbmSiswaRes.json()) as { siswa: Array<Record<string, unknown>> };
    assert.equal(pkbmSiswaBody.siswa[0].urlSuratPindah, "https://example.com/skp.png");
    assert.equal("kehadiran" in pkbmSiswaBody.siswa[0], false);
    assert.equal("nilaiAkhir" in pkbmSiswaBody.siswa[0], false);

    // Dinas Bandung cannot access Garut or opted-out PKBM
    assert.equal((await fetch(`${base}/pkbm/pkbm-grt/siswa`, { headers: { "x-dinas": "bandung" } })).status, 403);
    assert.equal((await fetch(`${base}/pkbm/pkbm-hidden/siswa`, { headers: { "x-dinas": "bandung" } })).status, 404);

    // PERLU_PERBAIKAN requires note
    assert.equal(
      (
        await fetch(`${base}/siswa/s-bdg-1/verval`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-dinas": "bandung" },
          body: JSON.stringify({ statusVervalDinas: "PERLU_PERBAIKAN", catatanDinas: "" }),
        })
      ).status,
      400,
    );

    // Cross-region student mutation is rejected
    assert.equal(
      (
        await fetch(`${base}/siswa/s-grt-1/verval`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-dinas": "bandung" },
          body: JSON.stringify({ statusVervalDinas: "LOLOS_VERVAL" }),
        })
      ).status,
      403,
    );

    // Approve in-region student
    const approveRes = await fetch(`${base}/siswa/s-bdg-1/verval`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-dinas": "bandung" },
      body: JSON.stringify({ statusVervalDinas: "LOLOS_VERVAL", catatanDinas: "Berkas lengkap & sesuai KK." }),
    });
    assert.equal(approveRes.status, 200);
    assert.equal(students[0].statusVervalDinas, "LOLOS_VERVAL");
  } finally {
    server.close();
  }
});
