import { Router } from "express";
import { randomBytes } from "crypto";
import { prisma } from "./db.js";
import { readSchoolKopSurat } from "./kop-surat-helper.js";
import {
  computeTranscriptScore,
  isUpkExam,
  RAPORT_WEIGHT,
  round2,
  transcriptPredikat,
  UPK_OVERRIDE_MARKER,
  UPK_WEIGHT,
} from "./transcript-calc.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  resolveAuthorizedSchool,
  resolveTeacherScope,
  type SchoolContextResolver,
} from "./school-modules-shared.js";

const VALID_JENJANG = new Set(["PAKET_A", "PAKET_B", "PAKET_C"]);
const VALID_KELOMPOK = new Set(["UMUM", "PEMBERDAYAAN", "KETERAMPILAN"]);
const VALID_METODE = new Set(["TATAP_MUKA", "TUTORIAL", "MANDIRI"]);
const VALID_STATUS_KENAIKAN = new Set(["PROSES", "NAIK_KELAS", "LULUS", "TINGGAL_KELAS"]);

const DEFAULT_KESETARAAN_TEMPLATES = [
  { jenjang: "PAKET_A", tingkatan: "Kelas 1-6", kelompok: "UMUM", kodeModul: "PA-BIND-01", judulModul: "Bahasa Indonesia Dasar & Literasi", skkTatapMuka: 2, skkTutorial: 1, skkMandiri: 1, deskripsi: "Kompetensi membaca, menulis, dan menyimak setara SD." },
  { jenjang: "PAKET_A", tingkatan: "Kelas 1-6", kelompok: "UMUM", kodeModul: "PA-MTK-01", judulModul: "Matematika Numerasi Kontekstual", skkTatapMuka: 2, skkTutorial: 1, skkMandiri: 1, deskripsi: "Operasi hitung dasar, pengukuran, dan pemecahan masalah harian." },
  { jenjang: "PAKET_A", tingkatan: "Kelas 1-6", kelompok: "PEMBERDAYAAN", kodeModul: "PA-PMB-01", judulModul: "Kemandirian & Etika Sosial", skkTatapMuka: 1, skkTutorial: 1, skkMandiri: 1, deskripsi: "Penguatan karakter, komunikasi keluarga, dan partisipasi warga." },
  { jenjang: "PAKET_B", tingkatan: "Kelas 7-9", kelompok: "UMUM", kodeModul: "PB-BIND-01", judulModul: "Bahasa Indonesia Teks & Fungsional", skkTatapMuka: 2, skkTutorial: 1, skkMandiri: 1, deskripsi: "Pemahaman teks eksposisi, laporan, dan korespondensi setara SMP." },
  { jenjang: "PAKET_B", tingkatan: "Kelas 7-9", kelompok: "UMUM", kodeModul: "PB-MTK-01", judulModul: "Aljabar, Geometri & Statistika SMP", skkTatapMuka: 2, skkTutorial: 1, skkMandiri: 1, deskripsi: "Persamaan linear, bangun ruang, dan pengolahan data." },
  { jenjang: "PAKET_B", tingkatan: "Kelas 7-9", kelompok: "KETERAMPILAN", kodeModul: "PB-KTR-01", judulModul: "Keterampilan Tata Boga / Kerajinan UMKM", skkTatapMuka: 1, skkTutorial: 2, skkMandiri: 1, deskripsi: "Praktik produksi kreatif siap usaha tingkat menengah." },
  { jenjang: "PAKET_C", tingkatan: "Kelas 10-12", kelompok: "UMUM", kodeModul: "PC-BING-01", judulModul: "Bahasa Inggris Akademik & Dunia Kerja", skkTatapMuka: 2, skkTutorial: 1, skkMandiri: 1, deskripsi: "Keterampilan berbahasa Inggris setara SMA untuk karier dan lanjut studi." },
  { jenjang: "PAKET_C", tingkatan: "Kelas 10-12", kelompok: "PEMBERDAYAAN", kodeModul: "PC-PMB-01", judulModul: "Kewirausahaan Sosial & Manajemen Proyek", skkTatapMuka: 1, skkTutorial: 1, skkMandiri: 1, deskripsi: "Perancangan rencana usaha, pemasaran digital, dan tata kelola komunitas." },
  { jenjang: "PAKET_C", tingkatan: "Kelas 10-12", kelompok: "KETERAMPILAN", kodeModul: "PC-KTR-01", judulModul: "Aplikasi Perkantoran & Desain Grafis", skkTatapMuka: 1, skkTutorial: 2, skkMandiri: 2, deskripsi: "Penguasaan spreadsheet, pengolah dokumen, dan media publikasi." },
] as const;

export function tahap2AcademicRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  // ==========================================
  // 1. MODUL KESETARAAN & SKK (BASIC+)
  // ==========================================
  router.get("/modul-kesetaraan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [modules, mapels] = await Promise.all([
        prisma.modulKesetaraan.findMany({
          where: { sekolahId },
          orderBy: [{ jenjang: "asc" }, { kelompok: "asc" }, { kodeModul: "asc" }],
          take: 500,
        }),
        prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true, kkm: true },
          orderBy: [{ nama: "asc" }],
          take: 500,
        }),
      ]);

      return res.json({ modules, mapels });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Modul Kesetaraan belum dimigrasi pada database." });
      }
      console.error("Gagal memuat modul kesetaraan:", error);
      return res.status(503).json({ error: "Data modul kesetaraan belum dapat dimuat." });
    }
  });

  router.post("/modul-kesetaraan/seed", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const existingCount = await prisma.modulKesetaraan.count({ where: { sekolahId } });
      if (existingCount > 0) {
        return res.json({ message: "Struktur modul kesetaraan sudah tersedia.", seeded: 0 });
      }

      const mapels = await prisma.mapel.findMany({
        where: { sekolahId },
        select: { id: true, nama: true },
        take: 100,
      });

      await prisma.modulKesetaraan.createMany({
        data: DEFAULT_KESETARAAN_TEMPLATES.map((tpl) => {
          const matchedMapel = mapels.find((m) =>
            tpl.judulModul.toLowerCase().includes(m.nama.toLowerCase()),
          );
          return {
            sekolahId,
            mapelId: matchedMapel?.id ?? null,
            jenjang: tpl.jenjang,
            tingkatan: tpl.tingkatan,
            kelompok: tpl.kelompok,
            kodeModul: tpl.kodeModul,
            judulModul: tpl.judulModul,
            skkTatapMuka: tpl.skkTatapMuka,
            skkTutorial: tpl.skkTutorial,
            skkMandiri: tpl.skkMandiri,
            skkTotal: tpl.skkTatapMuka + tpl.skkTutorial + tpl.skkMandiri,
            deskripsi: tpl.deskripsi,
          };
        }),
      });

      return res.status(201).json({
        message: "Katalog standar modul kesetaraan & bobot SKK berhasil dimuat.",
        seeded: DEFAULT_KESETARAAN_TEMPLATES.length,
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Modul Kesetaraan belum dimigrasi pada database." });
      }
      console.error("Gagal membuat template modul kesetaraan:", error);
      return res.status(503).json({ error: "Template modul belum dapat dibuat." });
    }
  });

  router.post("/modul-kesetaraan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const jenjang = cleanText(req.body?.jenjang, 20);
      const kelompok = cleanText(req.body?.kelompok, 30);
      const tingkatan = cleanText(req.body?.tingkatan, 60);
      const kodeModul = cleanText(req.body?.kodeModul, 40).toUpperCase();
      const judulModul = cleanText(req.body?.judulModul, 180);
      const deskripsi = cleanText(req.body?.deskripsi, 600);
      const mapelId = cleanText(req.body?.mapelId, 80) || null;
      const skkTatapMuka = cleanInt(req.body?.skkTatapMuka, 0, 20, 2);
      const skkTutorial = cleanInt(req.body?.skkTutorial, 0, 20, 1);
      const skkMandiri = cleanInt(req.body?.skkMandiri, 0, 20, 1);
      const skkTotal = skkTatapMuka + skkTutorial + skkMandiri;

      if (!VALID_JENJANG.has(jenjang) || !VALID_KELOMPOK.has(kelompok) || !tingkatan || !kodeModul || !judulModul) {
        return res.status(400).json({ error: "Lengkapi jenjang, tingkatan, kelompok, kode modul, dan judul modul." });
      }
      if (mapelId) {
        const ownedMapel = await prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } });
        if (!ownedMapel) return res.status(400).json({ error: "Mata pelajaran tidak ditemukan di sekolah ini." });
      }

      const created = await prisma.modulKesetaraan.create({
        data: {
          sekolahId,
          mapelId,
          jenjang,
          tingkatan,
          kelompok,
          kodeModul,
          judulModul,
          skkTatapMuka,
          skkTutorial,
          skkMandiri,
          skkTotal,
          deskripsi: deskripsi || null,
        },
      });
      return res.status(201).json({ modul: created, message: "Modul kesetaraan & bobot SKK disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan modul kesetaraan:", error);
      return res.status(503).json({ error: "Modul kesetaraan belum dapat disimpan." });
    }
  });

  router.patch("/modul-kesetaraan/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const jenjang = cleanText(req.body?.jenjang, 20);
      const kelompok = cleanText(req.body?.kelompok, 30);
      const tingkatan = cleanText(req.body?.tingkatan, 60);
      const kodeModul = cleanText(req.body?.kodeModul, 40).toUpperCase();
      const judulModul = cleanText(req.body?.judulModul, 180);
      const deskripsi = cleanText(req.body?.deskripsi, 600);
      const mapelId = cleanText(req.body?.mapelId, 80) || null;
      const skkTatapMuka = cleanInt(req.body?.skkTatapMuka, 0, 20, 2);
      const skkTutorial = cleanInt(req.body?.skkTutorial, 0, 20, 1);
      const skkMandiri = cleanInt(req.body?.skkMandiri, 0, 20, 1);
      const skkTotal = skkTatapMuka + skkTutorial + skkMandiri;

      if (!VALID_JENJANG.has(jenjang) || !VALID_KELOMPOK.has(kelompok) || !tingkatan || !kodeModul || !judulModul) {
        return res.status(400).json({ error: "Periksa jenjang, tingkatan, kelompok, kode, dan judul modul." });
      }
      if (mapelId) {
        const ownedMapel = await prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } });
        if (!ownedMapel) return res.status(400).json({ error: "Mata pelajaran tidak ditemukan di sekolah ini." });
      }

      const updated = await prisma.modulKesetaraan.updateMany({
        where: { id: req.params.id, sekolahId },
        data: {
          mapelId,
          jenjang,
          tingkatan,
          kelompok,
          kodeModul,
          judulModul,
          skkTatapMuka,
          skkTutorial,
          skkMandiri,
          skkTotal,
          deskripsi: deskripsi || null,
        },
      });
      if (!updated.count) return res.status(404).json({ error: "Modul tidak ditemukan." });
      return res.json({ message: "Bobot SKK & modul diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui modul kesetaraan:", error);
      return res.status(503).json({ error: "Modul kesetaraan belum dapat diperbarui." });
    }
  });

  router.delete("/modul-kesetaraan/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const deleted = await prisma.modulKesetaraan.deleteMany({
        where: { id: req.params.id, sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Modul tidak ditemukan." });
      return res.json({ message: "Modul kesetaraan dihapus." });
    } catch (error) {
      console.error("Gagal menghapus modul kesetaraan:", error);
      return res.status(503).json({ error: "Modul kesetaraan belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2. AGENDA & JURNAL MENGAJAR (BASIC+)
  // ==========================================
  router.get("/agenda-mengajar", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [agenda, kelas, mapel, guru, tahunAjaran] = await Promise.all([
        prisma.agendaMengajar.findMany({
          where: { sekolahId },
          include: {
            kelas: { select: { id: true, nama: true } },
            mapel: { select: { id: true, nama: true } },
            guru: { select: { id: true, nama: true } },
            tahunAjaran: { select: { id: true, nama: true, semester: true } },
          },
          orderBy: [{ tanggal: "desc" }, { id: "desc" }],
          take: 250,
        }),
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: { nama: "asc" }, take: 500 }),
        prisma.mapel.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: { nama: "asc" }, take: 500 }),
        prisma.guru.findMany({ where: { sekolahId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: { nama: "asc" }, take: 500 }),
        prisma.tahunAjaran.findMany({ where: { sekolahId }, select: { id: true, nama: true, semester: true }, orderBy: { mulai: "desc" }, take: 100 }),
      ]);

      return res.json({ agenda, kelas, mapel, guru, tahunAjaran });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Skema Agenda Mengajar belum dimigrasi pada database." });
      }
      console.error("Gagal memuat agenda mengajar:", error);
      return res.status(503).json({ error: "Agenda mengajar belum dapat dimuat." });
    }
  });

  router.post("/agenda-mengajar", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const kelasId = cleanText(req.body?.kelasId, 100);
      const mapelId = cleanText(req.body?.mapelId, 100);
      const guruId = cleanText(req.body?.guruId, 100);
      let tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const tanggalRaw = cleanText(req.body?.tanggal, 30);
      const jamKe = cleanText(req.body?.jamKe, 40) || "1-2";
      const metode = cleanText(req.body?.metode, 30) || "TATAP_MUKA";
      const materiPokok = cleanText(req.body?.materiPokok, 500);
      const catatanGuru = cleanText(req.body?.catatanGuru, 1000);
      const hadirCount = cleanInt(req.body?.hadirCount, 0, 500, 0);
      const tidakHadirCount = cleanInt(req.body?.tidakHadirCount, 0, 500, 0);

      if (!kelasId || !mapelId || !guruId || !tanggalRaw || !materiPokok || !VALID_METODE.has(metode)) {
        return res.status(400).json({ error: "Lengkapi tanggal, kelas, mapel, tutor, metode, dan materi pokok." });
      }
      const parsedDate = new Date(`${tanggalRaw.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Format tanggal tidak valid." });
      }

      if (!tahunAjaranId) {
        const latestYear = await prisma.tahunAjaran.findFirst({
          where: { sekolahId },
          orderBy: { mulai: "desc" },
          select: { id: true },
        });
        if (latestYear) {
          tahunAjaranId = latestYear.id;
        } else {
          const yearNow = new Date().getUTCFullYear();
          const createdYear = await prisma.tahunAjaran.create({
            data: {
              sekolahId,
              nama: `${yearNow}/${yearNow + 1}`,
              semester: "Ganjil",
              mulai: new Date(`${yearNow}-07-01T00:00:00.000Z`),
              selesai: new Date(`${yearNow + 1}-06-30T00:00:00.000Z`),
            },
            select: { id: true },
          });
          tahunAjaranId = createdYear.id;
        }
      }

      const [kelas, mapel, guru, year] = await Promise.all([
        prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } }),
        prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } }),
        prisma.guru.findFirst({ where: { id: guruId, sekolahId }, select: { id: true } }),
        prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } }),
      ]);
      if (!kelas || !mapel || !guru || !year) {
        return res.status(400).json({ error: "Referensi kelas, mapel, tutor, atau tahun ajaran tidak valid." });
      }

      const created = await prisma.agendaMengajar.create({
        data: {
          sekolahId,
          tahunAjaranId,
          kelasId,
          mapelId,
          guruId,
          tanggal: parsedDate,
          jamKe,
          metode,
          materiPokok,
          hadirCount,
          tidakHadirCount,
          catatanGuru: catatanGuru || null,
        },
      });
      return res.status(201).json({ agenda: created, message: "Jurnal mengajar berhasil dicatat." });
    } catch (error) {
      console.error("Gagal menyimpan agenda mengajar:", error);
      return res.status(503).json({ error: "Jurnal mengajar belum dapat disimpan." });
    }
  });

  router.delete("/agenda-mengajar/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const deleted = await prisma.agendaMengajar.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Jurnal mengajar tidak ditemukan." });
      return res.json({ message: "Jurnal mengajar dihapus." });
    } catch (error) {
      console.error("Gagal menghapus agenda mengajar:", error);
      return res.status(503).json({ error: "Jurnal mengajar belum dapat dihapus." });
    }
  });

  // ==========================================
  // 3. CEK & CETAK E-RAPORT (REGULER+)
  // ==========================================
  router.get("/raport", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;
      const teacherScope = peran === "GURU" && sessionGuruId ? await resolveTeacherScope(sekolahId, sessionGuruId) : null;
      const restrictToAssigned = Boolean(teacherScope && !teacherScope.isWaliKelas);

      const requestedKelasId = typeof req.query.kelasId === "string" ? req.query.kelasId.trim() : "";
      const requestedTahunId = typeof req.query.tahunAjaranId === "string" ? req.query.tahunAjaranId.trim() : "";

      const [school, settings, kelasList, tahunList, mapelList, modulList] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, npsn: true, alamatSekolah: true, namaKepalaSekolah: true, kabupatenKota: true },
        }),
        prisma.websiteSettings.findUnique({
          where: { school_id: sekolahId },
          select: { logo_url: true },
        }).catch(() => null),
        prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedKelasIds } } : {}),
          },
          select: { id: true, nama: true, waliGuruId: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.tahunAjaran.findMany({
          where: { sekolahId },
          select: { id: true, nama: true, semester: true },
          orderBy: { mulai: "desc" },
          take: 100,
        }),
        prisma.mapel.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedMapelIds } } : {}),
          },
          select: { id: true, nama: true, kkm: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.modulKesetaraan.findMany({
          where: { sekolahId },
          select: { mapelId: true, skkTotal: true, kelompok: true, jenjang: true },
          take: 500,
        }).catch(() => []),
      ]);

      const activeKelas = kelasList.find((k) => k.id === requestedKelasId) ?? kelasList[0] ?? null;
      const activeTahun = tahunList.find((t) => t.id === requestedTahunId) ?? tahunList[0] ?? null;

      let waliNama: string | null = null;
      if (activeKelas?.waliGuruId) {
        const wali = await prisma.guru.findFirst({
          where: { id: activeKelas.waliGuruId, sekolahId },
          select: { nama: true },
        });
        waliNama = wali?.nama ?? null;
      }

      const siswaList = activeKelas
        ? await prisma.siswa.findMany({
            where: { sekolahId, kelasId: activeKelas.id, status: "Aktif" },
            select: { id: true, nama: true, nisn: true, jenjang: true },
            orderBy: { nama: "asc" },
            take: 500,
          })
        : [];

      const siswaIds = siswaList.map((s) => s.id);
      const [nilaiRows, catatanRows] = siswaIds.length
        ? await Promise.all([
            prisma.nilai.findMany({
              where: {
                sekolahId,
                siswaId: { in: siswaIds },
                ...(activeTahun ? { OR: [{ tahunAjaranId: activeTahun.id }, { tahunAjaranId: null }] } : {}),
                NOT: { catatanKompetensi: UPK_OVERRIDE_MARKER },
              },
              orderBy: { tanggalSimulasi: "desc" },
            }),
            activeTahun
              ? prisma.catatanRaport.findMany({
                  where: { sekolahId, tahunAjaranId: activeTahun.id, siswaId: { in: siswaIds } },
                }).catch(() => [])
              : Promise.resolve([]),
          ])
        : [[], []];

      const skkByMapel = new Map<string, number>();
      for (const m of modulList) {
        if (m.mapelId && !skkByMapel.has(m.mapelId)) {
          skkByMapel.set(m.mapelId, m.skkTotal);
        }
      }

      const kopSurat = await readSchoolKopSurat(sekolahId);

      return res.json({
        sekolah: {
          nama: school?.nama ?? "PKBM",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
          logoUrl: settings?.logo_url ?? null,
        },
        kopSurat,
        kelasList,
        tahunList,
        selectedKelasId: activeKelas?.id ?? "",
        selectedTahunId: activeTahun?.id ?? "",
        waliKelasNama: waliNama,
        mapel: mapelList.map((m) => ({
          ...m,
          skk: skkByMapel.get(m.id) ?? 4,
        })),
        siswa: siswaList,
        nilai: nilaiRows,
        catatan: catatanRows,
      });
    } catch (error) {
      console.error("Gagal memuat E-Raport:", error);
      return res.status(503).json({ error: "Data E-Raport belum dapat dimuat." });
    }
  });

  router.post("/raport/nilai", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const mapelId = cleanText(req.body?.mapelId, 100);
      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100) || null;
      const nilaiMandiri = Math.max(0, Math.min(100, Number(req.body?.nilaiMandiri ?? 0)));
      const nilaiSimulasi = Math.max(0, Math.min(100, Number(req.body?.nilaiSimulasi ?? 0)));
      const rawAkhir = req.body?.nilaiAkhir;
      const nilaiAkhir =
        rawAkhir !== undefined && Number.isFinite(Number(rawAkhir))
          ? Math.max(0, Math.min(100, Number(rawAkhir)))
          : Math.round(((nilaiMandiri + nilaiSimulasi) / 2) * 10) / 10;
      const catatanKompetensi = cleanText(req.body?.catatanKompetensi, 500) || null;

      if (!siswaId || !mapelId || Number.isNaN(nilaiMandiri) || Number.isNaN(nilaiSimulasi)) {
        return res.status(400).json({ error: "Siswa, mata pelajaran, dan nilai (0-100) wajib valid." });
      }

      const [siswa, mapel, tahunAjaran] = await Promise.all([
        prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true, kelasId: true } }),
        prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } }),
        tahunAjaranId
          ? prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } })
          : Promise.resolve({ id: "" }),
      ]);
      if (!siswa || !mapel || (tahunAjaranId && !tahunAjaran)) {
        return res.status(404).json({ error: "Siswa, mata pelajaran, atau tahun ajaran tidak ditemukan." });
      }
      if (auth.session.peran === "GURU" && auth.session.guruId) {
        const scope = await resolveTeacherScope(sekolahId, auth.session.guruId);
        if (!scope.isWaliKelas && (!scope.assignedMapelIds.includes(mapelId) || !siswa.kelasId || !scope.assignedKelasIds.includes(siswa.kelasId))) {
          return res.status(403).json({ error: "Anda hanya dapat menginput nilai untuk kelas dan mapel yang Anda ampu." });
        }
      }

      const existing = await prisma.nilai.findFirst({
        where: {
          sekolahId,
          siswaId,
          mapelId,
          ...(tahunAjaranId ? { tahunAjaranId } : {}),
        },
        select: { id: true },
      });

      const saved = existing
        ? await prisma.nilai.update({
            where: { id: existing.id },
            data: { nilaiMandiri, nilaiSimulasi, nilaiAkhir, catatanKompetensi, tanggalSimulasi: new Date() },
          })
        : await prisma.nilai.create({
            data: {
              id: randomBytes(16).toString("hex"),
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId,
              nilaiMandiri,
              nilaiSimulasi,
              nilaiAkhir,
              catatanKompetensi,
            },
          });

      return res.json({ nilai: saved, message: "Nilai rapor warga belajar disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan nilai raport:", error);
      return res.status(503).json({ error: "Nilai raport belum dapat disimpan." });
    }
  });

  router.put("/raport/catatan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const kelasId = cleanText(req.body?.kelasId, 100);
      const siswaId = cleanText(req.body?.siswaId, 100);
      const catatanWali = cleanText(req.body?.catatanWali, 1500) || null;
      const statusKenaikan = cleanText(req.body?.statusKenaikan, 30) || "PROSES";

      if (!tahunAjaranId || !kelasId || !siswaId || !VALID_STATUS_KENAIKAN.has(statusKenaikan)) {
        return res.status(400).json({ error: "Parameter tahun ajaran, kelas, siswa, dan status kenaikan wajib valid." });
      }

      const [year, kelas, siswa] = await Promise.all([
        prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } }),
        prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true, waliGuruId: true } }),
        prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true } }),
      ]);
      if (!year || !kelas || !siswa) {
        return res.status(404).json({ error: "Tahun ajaran, kelas, atau siswa tidak ditemukan." });
      }
      if (auth.session.peran === "GURU" && auth.session.guruId) {
        const scope = await resolveTeacherScope(sekolahId, auth.session.guruId);
        if (!scope.isWaliKelas && kelas.waliGuruId !== auth.session.guruId && !scope.assignedKelasIds.includes(kelas.id)) {
          return res.status(403).json({ error: "Anda tidak memiliki akses catatan wali kelas untuk rombel ini." });
        }
      }

      const existing = await prisma.catatanRaport.findUnique({
        where: { sekolahId_tahunAjaranId_siswaId: { sekolahId, tahunAjaranId, siswaId } },
        select: { id: true },
      });

      const saved = existing
        ? await prisma.catatanRaport.update({
            where: { id: existing.id },
            data: { kelasId, catatanWali, statusKenaikan, tanggalRapor: new Date() },
          })
        : await prisma.catatanRaport.create({
            data: {
              sekolahId,
              tahunAjaranId,
              kelasId,
              siswaId,
              catatanWali,
              statusKenaikan,
              tanggalRapor: new Date(),
            },
          });

      return res.json({ catatan: saved, message: "Catatan wali kelas & keputusan rapor disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan catatan raport:", error);
      return res.status(503).json({ error: "Catatan raport belum dapat disimpan." });
    }
  });

  async function ensureSixSemesters(sekolahId: string) {
    let tahunList = await prisma.tahunAjaran.findMany({
      where: { sekolahId },
      select: { id: true, nama: true, semester: true, mulai: true },
      orderBy: [{ mulai: "asc" }, { nama: "asc" }],
      take: 40,
    });

    if (tahunList.length < 6) {
      const existingKeys = new Set(tahunList.map((t) => `${t.nama}::${t.semester}`));
      const nowYear = new Date().getUTCFullYear();
      const candidateSlots: Array<{ nama: string; semester: string; mulai: Date; selesai: Date }> = [];
      for (let offset = 3; offset >= 0; offset--) {
        const startYear = nowYear - offset;
        const nama = `${startYear}/${startYear + 1}`;
        candidateSlots.push(
          {
            nama,
            semester: "Ganjil",
            mulai: new Date(`${startYear}-07-01T00:00:00.000Z`),
            selesai: new Date(`${startYear}-12-31T23:59:59.000Z`),
          },
          {
            nama,
            semester: "Genap",
            mulai: new Date(`${startYear + 1}-01-01T00:00:00.000Z`),
            selesai: new Date(`${startYear + 1}-06-30T23:59:59.000Z`),
          },
        );
      }

      const needed = 6 - tahunList.length;
      const toCreate = candidateSlots.filter((s) => !existingKeys.has(`${s.nama}::${s.semester}`)).slice(-needed);
      for (const slot of toCreate) {
        await prisma.tahunAjaran
          .create({
            data: {
              sekolahId,
              nama: slot.nama,
              semester: slot.semester,
              mulai: slot.mulai,
              selesai: slot.selesai,
            },
          })
          .catch(() => null);
      }

      tahunList = await prisma.tahunAjaran.findMany({
        where: { sekolahId },
        select: { id: true, nama: true, semester: true, mulai: true },
        orderBy: [{ mulai: "asc" }, { nama: "asc" }],
        take: 40,
      });
    }

    return tahunList.slice(-6).map((t, idx) => ({
      id: t.id,
      label: `Sem ${idx + 1}`,
      nama: `${t.nama} (${t.semester})`,
    }));
  }

  // ==========================================
  // 4. TRANSKRIP NILAI KELULUSAN (60% RAPORT 6 SEMESTER + 40% UPK)
  // ==========================================
  router.get("/raport/transkrip", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const requestedKelasId = cleanText(req.query.kelasId, 100);
      const teacherScope = peran === "GURU" && guruId ? await resolveTeacherScope(sekolahId, guruId) : null;
      const restrictToAssigned = Boolean(teacherScope && !teacherScope.isWaliKelas);

      const [school, settings, kelasList, tahunList, mapelList, modulList] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, npsn: true, alamatSekolah: true, kabupatenKota: true, namaKepalaSekolah: true },
        }),
        prisma.websiteSettings.findUnique({ where: { school_id: sekolahId }, select: { logo_url: true } }).catch(() => null),
        prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedKelasIds } } : {}),
          },
          select: { id: true, nama: true, waliGuruId: true },
          orderBy: { nama: "asc" },
          take: 200,
        }),
        prisma.tahunAjaran.findMany({
          where: { sekolahId },
          select: { id: true, nama: true, semester: true, mulai: true },
          orderBy: { mulai: "asc" },
          take: 50,
        }),
        prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true, kkm: true },
          orderBy: { nama: "asc" },
          take: 300,
        }),
        prisma.modulKesetaraan.findMany({
          where: { sekolahId },
          select: { mapelId: true, skkTotal: true },
          take: 500,
        }).catch(() => []),
      ]);

      // Default to final-grade class (Kelas 6 / 9 / 12) when not specified
      const finalClassFallback = kelasList.find((k) => /\b(kelas\s*)?(6|9|12|vi|ix|xii)\b/i.test(k.nama));
      const activeKelas = kelasList.find((k) => k.id === requestedKelasId) ?? finalClassFallback ?? kelasList[0] ?? null;

      // Keep up to 6 latest semesters in chronological order (Semester 1..6)
      const sixSemesters = tahunList.slice(-6).map((t, idx) => ({
        id: t.id,
        label: `Sem ${idx + 1}`,
        nama: `${t.nama} (${t.semester})`,
      }));
      const sixSemesterIds = new Set(sixSemesters.map((s) => s.id));

      const siswaList = activeKelas
        ? await prisma.siswa.findMany({
            where: { sekolahId, kelasId: activeKelas.id, status: "Aktif" },
            select: { id: true, nama: true, nisn: true, jenjang: true, tempatLahir: true, tanggalLahir: true },
            orderBy: { nama: "asc" },
            take: 500,
          })
        : [];

      const siswaIds = siswaList.map((s) => s.id);
      const [allNilai, upkAttempts] = siswaIds.length
        ? await Promise.all([
            prisma.nilai.findMany({
              where: { sekolahId, siswaId: { in: siswaIds } },
              select: {
                siswaId: true,
                mapelId: true,
                tahunAjaranId: true,
                nilaiAkhir: true,
                catatanKompetensi: true,
                tanggalSimulasi: true,
              },
              orderBy: { tanggalSimulasi: "desc" },
            }),
            prisma.percobaanUjian.findMany({
              where: {
                siswaId: { in: siswaIds },
                ujian: { sekolahId },
              },
              select: {
                siswaId: true,
                nilai: true,
                nilaiOverride: true,
                dikumpulkanPada: true,
                ujian: { select: { kode: true, judul: true, mapelId: true } },
              },
              orderBy: { dikumpulkanPada: "desc" },
            }),
          ])
        : [[], []];

      const skkByMapel = new Map<string, number>();
      for (const m of modulList) {
        if (m.mapelId && !skkByMapel.has(m.mapelId)) {
          skkByMapel.set(m.mapelId, m.skkTotal);
        }
      }

      // Index manual UPK overrides and semester raport values per (siswaId, mapelId)
      const manualUpkMap = new Map<string, number>();
      const semesterScoreMap = new Map<string, Map<string, number>>();
      const unlinkedRaportMap = new Map<string, number[]>();

      for (const row of allNilai) {
        const key = `${row.siswaId}::${row.mapelId}`;
        if (row.catatanKompetensi === UPK_OVERRIDE_MARKER) {
          if (!manualUpkMap.has(key)) manualUpkMap.set(key, row.nilaiAkhir);
          continue;
        }
        if (row.tahunAjaranId && sixSemesterIds.has(row.tahunAjaranId)) {
          let bySem = semesterScoreMap.get(key);
          if (!bySem) {
            bySem = new Map();
            semesterScoreMap.set(key, bySem);
          }
          if (!bySem.has(row.tahunAjaranId)) {
            bySem.set(row.tahunAjaranId, row.nilaiAkhir);
          }
        } else {
          const list = unlinkedRaportMap.get(key) ?? [];
          if (list.length < 6) list.push(row.nilaiAkhir);
          unlinkedRaportMap.set(key, list);
        }
      }

      // Index CBT UPK exam scores per (siswaId, mapelId)
      const cbtUpkMap = new Map<string, number>();
      for (const att of upkAttempts) {
        if (!isUpkExam(att.ujian.kode, att.ujian.judul)) continue;
        const score = att.nilaiOverride ?? att.nilai;
        if (typeof score !== "number" || !Number.isFinite(score)) continue;
        const key = `${att.siswaId}::${att.ujian.mapelId}`;
        if (!cbtUpkMap.has(key)) {
          cbtUpkMap.set(key, score);
        }
      }

      const mapelPayload = mapelList.map((m) => ({
        ...m,
        skk: skkByMapel.get(m.id) ?? 4,
      }));

      const studentsTranscript = siswaList.map((st) => {
        const subjects = mapelPayload.map((m) => {
          const key = `${st.id}::${m.id}`;
          const bySem = semesterScoreMap.get(key);
          const semesterBreakdown = sixSemesters.map((sem) => ({
            tahunAjaranId: sem.id,
            label: sem.label,
            nilai: bySem?.get(sem.id) ?? null,
          }));

          const semesterValues = semesterBreakdown
            .map((b) => b.nilai)
            .filter((v): v is number => v !== null);
          const effectiveSemValues =
            semesterValues.length > 0 ? semesterValues : (unlinkedRaportMap.get(key) ?? []);

          const hasManualUpk = manualUpkMap.has(key);
          const hasCbtUpk = cbtUpkMap.has(key);
          const resolvedUpk = hasManualUpk
            ? manualUpkMap.get(key)!
            : hasCbtUpk
              ? cbtUpkMap.get(key)!
              : null;
          const upkSource: "manual" | "cbt" | "none" = hasManualUpk ? "manual" : hasCbtUpk ? "cbt" : "none";

          const calc = computeTranscriptScore(effectiveSemValues, resolvedUpk);
          return {
            mapelId: m.id,
            mapelNama: m.nama,
            kkm: m.kkm,
            skk: m.skk,
            semesterBreakdown,
            upkSource,
            ...calc,
          };
        });

        const completedTranscript = subjects.filter((s) => s.nilaiTranskrip !== null);
        const rataTranskrip =
          completedTranscript.length > 0
            ? round2(
                completedTranscript.reduce((sum, s) => sum + (s.nilaiTranskrip ?? 0), 0) /
                  completedTranscript.length,
              )
            : null;
        const completedRaport = subjects.filter((s) => s.rataRaport !== null);
        const rataRaportKeseluruhan =
          completedRaport.length > 0
            ? round2(
                completedRaport.reduce((sum, s) => sum + (s.rataRaport ?? 0), 0) /
                  completedRaport.length,
              )
            : null;
        const completedUpk = subjects.filter((s) => s.nilaiUpk !== null);
        const rataUpkKeseluruhan =
          completedUpk.length > 0
            ? round2(
                completedUpk.reduce((sum, s) => sum + (s.nilaiUpk ?? 0), 0) /
                  completedUpk.length,
              )
            : null;

        const lulus =
          completedTranscript.length > 0 &&
          completedTranscript.every((s) => (s.nilaiTranskrip ?? 0) >= s.kkm);

        return {
          siswa: st,
          subjects,
          rataRaportKeseluruhan,
          rataUpkKeseluruhan,
          rataTranskrip,
          predikatKeseluruhan: transcriptPredikat(rataTranskrip),
          mapelLengkapCount: completedTranscript.length,
          totalMapelCount: subjects.length,
          statusKelulusan: completedTranscript.length === 0 ? "BELUM_LENGKAP" : lulus ? "LULUS" : "PERLU_PERBAIKAN",
        };
      });

      const kopSurat = await readSchoolKopSurat(sekolahId);

      return res.json({
        bobot: { raport: RAPORT_WEIGHT * 100, upk: UPK_WEIGHT * 100 },
        sekolah: {
          nama: school?.nama ?? "PKBM",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
          logoUrl: settings?.logo_url ?? null,
        },
        kopSurat,
        kelasList,
        selectedKelasId: activeKelas?.id ?? "",
        selectedKelasNama: activeKelas?.nama ?? "",
        semesters: sixSemesters,
        mapel: mapelPayload,
        rows: studentsTranscript,
      });
    } catch (error) {
      console.error("Gagal memuat Transkrip Nilai Kelulusan:", error);
      return res.status(503).json({ error: "Transkrip nilai belum dapat dimuat." });
    }
  });

  router.post("/raport/upk-nilai", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const mapelId = cleanText(req.body?.mapelId, 100);
      const nilaiUpk = Number(req.body?.nilaiUpk);

      if (!siswaId || !mapelId || !Number.isFinite(nilaiUpk) || nilaiUpk < 0 || nilaiUpk > 100) {
        return res.status(400).json({ error: "Siswa, mata pelajaran, dan nilai UPK (0–100) wajib valid." });
      }

      const [siswa, mapel] = await Promise.all([
        prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true, kelasId: true } }),
        prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } }),
      ]);
      if (!siswa || !mapel) {
        return res.status(404).json({ error: "Siswa atau mata pelajaran tidak ditemukan." });
      }

      if (auth.session.peran === "GURU" && auth.session.guruId) {
        const scope = await resolveTeacherScope(sekolahId, auth.session.guruId);
        if (!scope.isWaliKelas && (!scope.assignedMapelIds.includes(mapelId) || !siswa.kelasId || !scope.assignedKelasIds.includes(siswa.kelasId))) {
          return res.status(403).json({ error: "Anda hanya dapat menginput nilai UPK untuk kelas dan mapel yang Anda ampu." });
        }
      }

      const rounded = round2(nilaiUpk);
      const existing = await prisma.nilai.findFirst({
        where: {
          sekolahId,
          siswaId,
          mapelId,
          tahunAjaranId: null,
          catatanKompetensi: UPK_OVERRIDE_MARKER,
        },
        select: { id: true },
      });

      const saved = existing
        ? await prisma.nilai.update({
            where: { id: existing.id },
            data: { nilaiMandiri: rounded, nilaiSimulasi: rounded, nilaiAkhir: rounded, tanggalSimulasi: new Date() },
          })
        : await prisma.nilai.create({
            data: {
              id: randomBytes(16).toString("hex"),
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId: null,
              nilaiMandiri: rounded,
              nilaiSimulasi: rounded,
              nilaiAkhir: rounded,
              catatanKompetensi: UPK_OVERRIDE_MARKER,
            },
          });

      return res.json({ nilai: saved, message: "Nilai UPK berhasil disimpan untuk perhitungan Transkrip Ijazah." });
    } catch (error) {
      console.error("Gagal menyimpan nilai UPK:", error);
      return res.status(503).json({ error: "Nilai UPK belum dapat disimpan." });
    }
  });

  // POST /api/sekolah/raport/leger-semester — Batch input nilai Leger Raport Semester 1-6 (+ opsional UPK)
  router.post("/raport/leger-semester", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (!siswaId || rawEntries.length === 0) {
        return res.status(400).json({ error: "Pilih warga belajar dan isi minimal satu mata pelajaran." });
      }

      const siswa = await prisma.siswa.findFirst({
        where: { id: siswaId, sekolahId },
        select: { id: true, kelasId: true },
      });
      if (!siswa) {
        return res.status(404).json({ error: "Warga belajar tidak ditemukan di lembaga ini." });
      }

      if (peran === "GURU" && guruId) {
        const teacherScope = await resolveTeacherScope(sekolahId, guruId);
        if (!teacherScope.isWaliKelas && siswa.kelasId && !teacherScope.assignedKelasIds.includes(siswa.kelasId)) {
          return res.status(403).json({ error: "Anda tidak memiliki akses ke kelas siswa ini." });
        }
      }

      const validMapels = await prisma.mapel.findMany({
        where: { sekolahId },
        select: { id: true },
      });
      const validMapelIds = new Set(validMapels.map((m) => m.id));
      const sixSemesters = await ensureSixSemesters(sekolahId);

      let savedCells = 0;
      const semKeys = ["sem1", "sem2", "sem3", "sem4", "sem5", "sem6"] as const;

      for (const rawItem of rawEntries.slice(0, 100)) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
        const entry = rawItem as Record<string, unknown>;
        const mapelId = cleanText(entry.mapelId, 100);
        if (!mapelId || !validMapelIds.has(mapelId)) continue;

        for (let i = 0; i < Math.min(semKeys.length, sixSemesters.length); i++) {
          const valRaw = entry[semKeys[i]];
          if (valRaw === null || valRaw === undefined || valRaw === "") continue;
          const num = Number(valRaw);
          if (!Number.isFinite(num) || num < 0 || num > 100) continue;
          const rounded = round2(num);
          const tahunAjaranId = sixSemesters[i].id;

          const existing = await prisma.nilai.findFirst({
            where: {
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId,
              NOT: { catatanKompetensi: UPK_OVERRIDE_MARKER },
            },
            select: { id: true },
          });

          if (existing) {
            await prisma.nilai.update({
              where: { id: existing.id },
              data: {
                nilaiMandiri: rounded,
                nilaiSimulasi: rounded,
                nilaiAkhir: rounded,
                tanggalSimulasi: new Date(),
              },
            });
          } else {
            await prisma.nilai.create({
              data: {
                id: randomBytes(16).toString("hex"),
                sekolahId,
                siswaId,
                mapelId,
                tahunAjaranId,
                nilaiMandiri: rounded,
                nilaiSimulasi: rounded,
                nilaiAkhir: rounded,
                catatanKompetensi: null,
              },
            });
          }
          savedCells += 1;
        }

        const upkRaw = entry.nilaiUpk;
        if (upkRaw !== null && upkRaw !== undefined && upkRaw !== "") {
          const upkNum = Number(upkRaw);
          if (Number.isFinite(upkNum) && upkNum >= 0 && upkNum <= 100) {
            const roundedUpk = round2(upkNum);
            const existingUpk = await prisma.nilai.findFirst({
              where: { sekolahId, siswaId, mapelId, catatanKompetensi: UPK_OVERRIDE_MARKER },
              select: { id: true },
            });
            if (existingUpk) {
              await prisma.nilai.update({
                where: { id: existingUpk.id },
                data: {
                  nilaiMandiri: roundedUpk,
                  nilaiSimulasi: roundedUpk,
                  nilaiAkhir: roundedUpk,
                  tanggalSimulasi: new Date(),
                },
              });
            } else {
              await prisma.nilai.create({
                data: {
                  id: randomBytes(16).toString("hex"),
                  sekolahId,
                  siswaId,
                  mapelId,
                  tahunAjaranId: null,
                  nilaiMandiri: roundedUpk,
                  nilaiSimulasi: roundedUpk,
                  nilaiAkhir: roundedUpk,
                  catatanKompetensi: UPK_OVERRIDE_MARKER,
                },
              });
            }
            savedCells += 1;
          }
        }
      }

      return res.json({
        savedCells,
        semesters: sixSemesters,
        message: `Leger Raport Semester 1–6 berhasil disimpan (${savedCells} entri nilai diperbarui) dan siap ditarik ke Transkrip Nilai.`,
      });
    } catch (error) {
      console.error("Gagal menyimpan leger raport semester 1-6:", error);
      return res.status(503).json({ error: "Leger raport semester 1–6 belum dapat disimpan." });
    }
  });

  // ==========================================
  // 5. SINKRONISASI OTOMATIS NILAI TUGAS + CBT -> E-RAPORT
  // ==========================================
  router.post("/raport/sinkron-otomatis", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const kelasId = cleanText(req.body?.kelasId, 100);
      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      if (!kelasId || !tahunAjaranId) {
        return res.status(400).json({ error: "Pilih kelas dan tahun ajaran terlebih dahulu." });
      }

      const [kelas, year] = await Promise.all([
        prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true, nama: true } }),
        prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } }),
      ]);
      if (!kelas || !year) {
        return res.status(404).json({ error: "Kelas atau tahun ajaran tidak ditemukan." });
      }

      let allowedMapelIds: Set<string> | null = null;
      if (peran === "GURU" && guruId) {
        const scope = await resolveTeacherScope(sekolahId, guruId);
        if (!scope.isWaliKelas) {
          if (!scope.assignedKelasIds.includes(kelasId)) {
            return res.status(403).json({ error: "Anda tidak memiliki akses sinkronisasi nilai untuk kelas ini." });
          }
          allowedMapelIds = new Set(scope.assignedMapelIds);
        }
      }

      const siswaList = await prisma.siswa.findMany({
        where: { sekolahId, kelasId, status: "Aktif" },
        select: { id: true },
        take: 500,
      });
      const siswaIds = siswaList.map((s) => s.id);
      if (siswaIds.length === 0) {
        return res.json({ syncedCount: 0, studentsCount: 0, message: "Belum ada siswa aktif pada kelas ini." });
      }

      const [taskSubmissions, cbtAttempts, existingGrades] = await Promise.all([
        prisma.pengumpulanTugas.findMany({
          where: {
            siswaId: { in: siswaIds },
            nilai: { not: null },
            tugas: { sekolahId, kelasId, tahunAjaranId },
          },
          select: {
            siswaId: true,
            nilai: true,
            tugas: { select: { mapelId: true } },
          },
        }),
        prisma.percobaanUjian.findMany({
          where: {
            siswaId: { in: siswaIds },
            dikumpulkanPada: { not: null },
            ujian: { sekolahId, kelasId, tahunAjaranId },
          },
          select: {
            siswaId: true,
            nilai: true,
            nilaiOverride: true,
            ujian: { select: { mapelId: true, kode: true, judul: true } },
          },
        }),
        prisma.nilai.findMany({
          where: {
            sekolahId,
            siswaId: { in: siswaIds },
            tahunAjaranId,
            NOT: { catatanKompetensi: UPK_OVERRIDE_MARKER },
          },
          select: { id: true, siswaId: true, mapelId: true, nilaiMandiri: true, nilaiSimulasi: true },
        }),
      ]);

      const taskMap = new Map<string, number[]>();
      for (const sub of taskSubmissions) {
        if (typeof sub.nilai !== "number" || !Number.isFinite(sub.nilai)) continue;
        if (allowedMapelIds && !allowedMapelIds.has(sub.tugas.mapelId)) continue;
        const key = `${sub.siswaId}::${sub.tugas.mapelId}`;
        const list = taskMap.get(key) ?? [];
        list.push(sub.nilai);
        taskMap.set(key, list);
      }

      const cbtMap = new Map<string, number[]>();
      for (const att of cbtAttempts) {
        // Keep UPK exams exclusively for 40% Transkrip Ijazah, not regular semester CBT average
        if (isUpkExam(att.ujian.kode, att.ujian.judul)) continue;
        const score = att.nilaiOverride ?? att.nilai;
        if (typeof score !== "number" || !Number.isFinite(score)) continue;
        if (allowedMapelIds && !allowedMapelIds.has(att.ujian.mapelId)) continue;
        const key = `${att.siswaId}::${att.ujian.mapelId}`;
        const list = cbtMap.get(key) ?? [];
        list.push(score);
        cbtMap.set(key, list);
      }

      const existingMap = new Map(existingGrades.map((g) => [`${g.siswaId}::${g.mapelId}`, g]));
      const allKeys = new Set<string>([...taskMap.keys(), ...cbtMap.keys()]);

      let syncedCount = 0;
      for (const key of allKeys) {
        const [siswaId, mapelId] = key.split("::");
        const taskScores = taskMap.get(key) ?? [];
        const cbtScores = cbtMap.get(key) ?? [];
        const existing = existingMap.get(key);

        const avgTask = taskScores.length > 0
          ? round2(taskScores.reduce((a, b) => a + b, 0) / taskScores.length)
          : null;
        const avgCbt = cbtScores.length > 0
          ? round2(cbtScores.reduce((a, b) => a + b, 0) / cbtScores.length)
          : null;

        const nilaiMandiri = avgTask ?? existing?.nilaiMandiri ?? avgCbt ?? 0;
        const nilaiSimulasi = avgCbt ?? existing?.nilaiSimulasi ?? avgTask ?? 0;
        const nilaiAkhir = round2((nilaiMandiri + nilaiSimulasi) / 2);

        if (existing) {
          await prisma.nilai.update({
            where: { id: existing.id },
            data: { nilaiMandiri, nilaiSimulasi, nilaiAkhir, tanggalSimulasi: new Date() },
          });
        } else {
          await prisma.nilai.create({
            data: {
              id: randomBytes(16).toString("hex"),
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId,
              nilaiMandiri,
              nilaiSimulasi,
              nilaiAkhir,
            },
          });
        }
        syncedCount += 1;
      }

      return res.json({
        syncedCount,
        studentsCount: siswaIds.length,
        message:
          syncedCount > 0
            ? `Sinkronisasi berhasil: ${syncedCount} entri nilai E-Raport diperbarui otomatis dari Tugas & CBT kelas ${kelas.nama}.`
            : `Belum ada nilai Tugas atau CBT yang dinilai pada kelas ${kelas.nama} untuk semester ini.`,
      });
    } catch (error) {
      console.error("Gagal menyinkronkan nilai raport otomatis:", error);
      return res.status(503).json({ error: "Sinkronisasi nilai otomatis belum dapat diproses." });
    }
  });

  return router;
}
