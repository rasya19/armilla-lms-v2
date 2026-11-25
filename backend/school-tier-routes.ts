import { Router } from "express";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { hasPlanAccess, normalizeTenantPlan, type TenantPlan } from "./plan-utils.js";
import { getGlobalTheme } from "./global-theme.js";
import { readSchoolKopSurat, saveSchoolKopSurat } from "./kop-surat-helper.js";
import { getSchoolAiQuotaSummary, saveSchoolFallbackGeminiKey } from "./ai-quota.js";

import { MAX_IMAGE_BYTES, validateImageAttachment } from "./upload-validation.js";

function isSafeLogoUrl(value: string): boolean {
  if (!value) return true;
  return validateImageAttachment(value, { maxBytes: MAX_IMAGE_BYTES, allowRelative: true }).ok;
}

export function schoolTierRoutes(schoolForRequest: (req: Request) => Promise<string | null>) {
  const router = Router();

  async function resolveSchoolContext(req: Request): Promise<{ sekolahId: string; plan: TenantPlan } | null> {
    const sekolahId = await schoolForRequest(req);
    if (!sekolahId) return null;
    const school = await prisma.sekolah.findUnique({
      where: { id: sekolahId },
      select: { plan: true },
    });
    return {
      sekolahId,
      plan: normalizeTenantPlan(school?.plan),
    };
  }

  async function requireSchoolSession(req: Request): Promise<{ ok: true; sekolahId: string; plan: TenantPlan } | { ok: false; status: number; error: string }> {
    const ctx = await resolveSchoolContext(req);
    if (!ctx) return { ok: false, status: 401, error: "Sesi tidak valid." };
    return { ok: true, ...ctx };
  }

  async function requirePlan(req: Request, required: TenantPlan): Promise<{ ok: true; sekolahId: string; plan: TenantPlan } | { ok: false; status: number; error: string }> {
    const ctx = await resolveSchoolContext(req);
    if (!ctx) return { ok: false, status: 401, error: "Sesi tidak valid." };
    if (!hasPlanAccess(ctx.plan, required)) {
      const label = required === "pro" ? "Paket Pro" : "Paket Reguler";
      return { ok: false, status: 403, error: `Fitur ini membutuhkan ${label}. Hubungi pengelola untuk upgrade paket.` };
    }
    return { ok: true, ...ctx };
  }

  router.get("/rekap-akademik", async (req, res) => {
    try {
      const scope = typeof req.query.scope === "string" ? req.query.scope.trim().toLowerCase() : "";
      const gate = await requirePlan(req, scope === "presensi" ? "basic" : "reguler");
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const { sekolahId } = gate;

      const [kelasList, siswaCounts, presensiGroups, tugasAgg, nilaiEntries, totalTugas, totalUjian, totalMateri] = await Promise.all([
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 500 }),
        prisma.siswa.groupBy({ by: ["kelasId"], where: { sekolahId, status: "Aktif", kelasId: { not: null } }, _count: { _all: true } }),
        prisma.presensi.groupBy({ by: ["kelasId", "status"], where: { sekolahId }, _count: { _all: true } }),
        prisma.pengumpulanTugas.aggregate({ where: { tugas: { sekolahId }, nilai: { not: null } }, _avg: { nilai: true }, _count: { _all: true } }),
        prisma.nilai.findMany({ where: { sekolahId }, select: { id: true, siswaId: true, mapelId: true, nilaiMandiri: true, nilaiSimulasi: true, nilaiAkhir: true, tanggalSimulasi: true }, orderBy: [{ tanggalSimulasi: "desc" }], take: 25 }),
        prisma.tugas.count({ where: { sekolahId } }),
        prisma.ujian.count({ where: { sekolahId } }),
        prisma.materiAjar.count({ where: { sekolahId } }),
      ]);

      const siswaMap = new Map<string, string>();
      const mapelMap = new Map<string, string>();
      if (nilaiEntries.length > 0) {
        const siswaIds = [...new Set(nilaiEntries.map((item) => item.siswaId))];
        const mapelIds = [...new Set(nilaiEntries.map((item) => item.mapelId))];
        const [siswas, mapels] = await Promise.all([
          prisma.siswa.findMany({ where: { sekolahId, id: { in: siswaIds } }, select: { id: true, nama: true } }),
          prisma.mapel.findMany({ where: { sekolahId, id: { in: mapelIds } }, select: { id: true, nama: true } }),
        ]);
        for (const s of siswas) siswaMap.set(s.id, s.nama);
        for (const m of mapels) mapelMap.set(m.id, m.nama);
      }

      const siswaCountByKelas = new Map(siswaCounts.map((item) => [item.kelasId, item._count._all]));
      const presensiTotals = { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
      const presensiByKelas = new Map<string, { hadir: number; sakit: number; izin: number; alpa: number; total: number }>();

      for (const row of presensiGroups) {
        const count = row._count._all;
        const current = presensiByKelas.get(row.kelasId) ?? { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
        if (row.status === "HADIR") {
          current.hadir += count;
          presensiTotals.hadir += count;
        } else if (row.status === "SAKIT") {
          current.sakit += count;
          presensiTotals.sakit += count;
        } else if (row.status === "IZIN") {
          current.izin += count;
          presensiTotals.izin += count;
        } else if (row.status === "ALPA") {
          current.alpa += count;
          presensiTotals.alpa += count;
        }
        current.total += count;
        presensiTotals.total += count;
        presensiByKelas.set(row.kelasId, current);
      }

      const avgNilaiAkhir = nilaiEntries.length
        ? Math.round((nilaiEntries.reduce((sum, item) => sum + item.nilaiAkhir, 0) / nilaiEntries.length) * 10) / 10
        : null;

      return res.json({
        summary: {
          rataRataTugas: tugasAgg._avg.nilai !== null ? Math.round(tugasAgg._avg.nilai * 10) / 10 : null,
          totalNilaiTugas: tugasAgg._count._all,
          rataRataNilaiAkhir: avgNilaiAkhir,
          totalEntriNilai: nilaiEntries.length,
          totalTugas,
          totalUjian,
          totalMateri,
          presensi: presensiTotals,
        },
        perKelas: kelasList.map((kelas) => {
          const p = presensiByKelas.get(kelas.id) ?? { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
          return {
            id: kelas.id,
            nama: kelas.nama,
            jumlahSiswa: siswaCountByKelas.get(kelas.id) ?? 0,
            hadir: p.hadir,
            sakit: p.sakit,
            izin: p.izin,
            alpa: p.alpa,
            totalPresensi: p.total,
          };
        }),
        nilaiTerbaru: nilaiEntries.map((item) => ({
          id: item.id,
          siswaNama: siswaMap.get(item.siswaId) ?? "Siswa",
          mapelNama: mapelMap.get(item.mapelId) ?? "Mata Pelajaran",
          nilaiMandiri: item.nilaiMandiri,
          nilaiSimulasi: item.nilaiSimulasi,
          nilaiAkhir: item.nilaiAkhir,
          tanggalSimulasi: item.tanggalSimulasi,
        })),
      });
    } catch (error) {
      console.error("Gagal memuat rekap akademik:", error);
      return res.status(503).json({ error: "Rekap akademik belum dapat dimuat." });
    }
  });

  router.patch("/tema", async (req, res) => {
    const auth = await requireSchoolSession(req);
    if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
    return res.status(403).json({
      error: "Tema tampilan platform dikelola secara terpusat oleh Master Admin agar seragam di seluruh paket.",
    });
  });

  router.get("/identitas", async (req, res) => {
    try {
      const gate = await requireSchoolSession(req);
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const school = await prisma.sekolah.findUnique({
        where: { id: gate.sekolahId },
        select: { nama: true, slug: true, npsn: true, themeKey: true },
      });
      if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
      const resolvedTheme = await getGlobalTheme(prisma, school.themeKey);

      let settings: {
        primary_color: string;
        logo_url: string | null;
        hero_title: string | null;
        hero_subtitle: string | null;
        show_gallery: boolean;
        show_news: boolean;
        footer_text: string | null;
      } | null = null;
      try {
        settings = await prisma.websiteSettings.findUnique({
          where: { school_id: gate.sekolahId },
          select: {
            primary_color: true,
            logo_url: true,
            hero_title: true,
            hero_subtitle: true,
            show_gallery: true,
            show_news: true,
            footer_text: true,
          },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022"))) {
          throw err;
        }
      }

      const kopSurat = await readSchoolKopSurat(gate.sekolahId);

      return res.json({
        sekolah: {
          ...school,
          themeKey: resolvedTheme,
        },
        kopSurat,
        settings: settings ?? {
          primary_color: "#4f46e5",
          logo_url: null,
          hero_title: `Portal Belajar ${school.nama}`,
          hero_subtitle: "Pembelajaran kesetaraan fleksibel dan terstruktur.",
          show_gallery: true,
          show_news: true,
          footer_text: `© ${new Date().getFullYear()} ${school.nama}`,
        },
      });
    } catch (error) {
      console.error("Gagal memuat identitas sekolah:", error);
      return res.status(503).json({ error: "Identitas sekolah belum dapat dimuat." });
    }
  });

  router.get("/kop-surat", async (req, res) => {
    try {
      const gate = await requireSchoolSession(req);
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const kopSurat = await readSchoolKopSurat(gate.sekolahId);
      return res.json({ kopSurat });
    } catch (error) {
      console.error("Gagal memuat kop surat lembaga:", error);
      return res.status(503).json({ error: "Kop surat lembaga belum dapat dimuat." });
    }
  });

  router.put("/kop-surat", async (req, res) => {
    try {
      const gate = await requireSchoolSession(req);
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Payload kop surat tidak valid." });
      }
      const result = await saveSchoolKopSurat(gate.sekolahId, body as Record<string, unknown>);
      if (result.ok === false) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.json({
        kopSurat: result.kopSurat,
        message: "Konfigurasi Kop Surat & Profil Lembaga berhasil disimpan.",
      });
    } catch (error) {
      console.error("Gagal menyimpan kop surat lembaga:", error);
      return res.status(503).json({ error: "Kop surat lembaga belum dapat disimpan." });
    }
  });

  // PUT /api/sekolah/ai-fallback-key — Simpan/hapus API Key Gemini mandiri lembaga (opsional, hanya fallback saat kuota vendor habis)
  router.put("/ai-fallback-key", async (req, res) => {
    try {
      const gate = await requireSchoolSession(req);
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const rawKey = typeof req.body?.geminiApiKey === "string" ? req.body.geminiApiKey : "";
      const saved = await saveSchoolFallbackGeminiKey(gate.sekolahId, rawKey);
      if (saved.ok === false) {
        return res.status(saved.status).json({ error: saved.error });
      }
      const quota = await getSchoolAiQuotaSummary(gate.sekolahId, gate.plan);
      return res.json({
        hasFallbackKey: saved.hasFallbackKey,
        maskedFallbackKey: saved.maskedFallbackKey,
        quota,
        message: saved.hasFallbackKey
          ? "API Key Gemini mandiri lembaga disimpan. Hanya dipakai otomatis sebagai cadangan jika kuota bulanan vendor habis."
          : "API Key Gemini mandiri lembaga telah dihapus.",
      });
    } catch (error) {
      console.error("Gagal menyimpan API Key Gemini fallback lembaga:", error);
      return res.status(503).json({ error: "Pengaturan API Key Gemini lembaga belum dapat disimpan." });
    }
  });

  router.patch("/identitas", async (req, res) => {
    try {
      const gate = await requireSchoolSession(req);
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Payload identitas tidak valid." });
      }
      const primaryColor = typeof body.primary_color === "string" ? body.primary_color.trim() : "#4f46e5";
      const logoUrl = typeof body.logo_url === "string" ? body.logo_url.trim() : "";
      const heroTitle = typeof body.hero_title === "string" ? body.hero_title.trim() : "";
      const heroSubtitle = typeof body.hero_subtitle === "string" ? body.hero_subtitle.trim() : "";
      const footerText = typeof body.footer_text === "string" ? body.footer_text.trim() : "";
      const showGallery = typeof body.show_gallery === "boolean" ? body.show_gallery : true;
      const showNews = typeof body.show_news === "boolean" ? body.show_news : true;

      if (!/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
        return res.status(400).json({ error: "Format warna utama harus hex 6 digit (contoh: #4f46e5)." });
      }
      if (logoUrl.length > 500 || !isSafeLogoUrl(logoUrl)) {
        return res.status(400).json({ error: "URL logo harus menggunakan http://, https://, atau path relatif yang valid." });
      }
      if (heroTitle.length > 150 || heroSubtitle.length > 400 || footerText.length > 300) {
        return res.status(400).json({ error: "Panjang teks judul, subjudul, atau footer melebihi batas." });
      }

      const saved = await prisma.websiteSettings.upsert({
        where: { school_id: gate.sekolahId },
        create: {
          school_id: gate.sekolahId,
          primary_color: primaryColor,
          logo_url: logoUrl || null,
          hero_title: heroTitle || null,
          hero_subtitle: heroSubtitle || null,
          show_gallery: showGallery,
          show_news: showNews,
          footer_text: footerText || null,
        },
        update: {
          primary_color: primaryColor,
          logo_url: logoUrl || null,
          hero_title: heroTitle || null,
          hero_subtitle: heroSubtitle || null,
          show_gallery: showGallery,
          show_news: showNews,
          footer_text: footerText || null,
        },
        select: {
          primary_color: true,
          logo_url: true,
          hero_title: true,
          hero_subtitle: true,
          show_gallery: true,
          show_news: true,
          footer_text: true,
        },
      });

      return res.json({ settings: saved, message: "Identitas dan tampilan sekolah berhasil disimpan." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
        return res.status(503).json({ error: "Tabel pengaturan website belum dimigrasi pada database ini." });
      }
      console.error("Gagal menyimpan identitas sekolah:", error);
      return res.status(503).json({ error: "Identitas sekolah belum dapat disimpan." });
    }
  });

  router.get("/pengaturan", async (req, res) => {
    try {
      const gate = await requirePlan(req, "pro");
      if ("error" in gate) return res.status(gate.status).json({ error: gate.error });
      const { sekolahId } = gate;

      const [school, siswaAktif, siswaDenganAkun, guruAktif, guruDenganAkun, kelasTotal, mapelTotal, tahunAjaranTotal] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: {
            id: true,
            nama: true,
            slug: true,
            npsn: true,
            status: true,
            plan: true,
            themeKey: true,
            expiresAt: true,
            adminPhone: true,
            kelasStandarDibuat: true,
            createdAt: true,
          },
        }),
        prisma.siswa.count({ where: { sekolahId, status: "Aktif" } }),
        prisma.siswa.count({ where: { sekolahId, status: "Aktif", akun: { isNot: null } } }),
        prisma.guru.count({ where: { sekolahId, status: "Aktif" } }),
        prisma.guru.count({ where: { sekolahId, status: "Aktif", akun: { isNot: null } } }),
        prisma.kelas.count({ where: { sekolahId } }),
        prisma.mapel.count({ where: { sekolahId } }),
        prisma.tahunAjaran.count({ where: { sekolahId } }),
      ]);
      if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });
      const resolvedTheme = await getGlobalTheme(prisma, school.themeKey);

      return res.json({
        sekolah: {
          ...school,
          themeKey: resolvedTheme,
          normalizedPlan: normalizeTenantPlan(school.plan),
        },
        statistik: {
          siswaAktif,
          siswaDenganAkun,
          guruAktif,
          guruDenganAkun,
          kelasTotal,
          mapelTotal,
          tahunAjaranTotal,
        },
      });
    } catch (error) {
      console.error("Gagal memuat pengaturan lanjutan:", error);
      return res.status(503).json({ error: "Pengaturan lanjutan belum dapat dimuat." });
    }
  });

  return router;
}
