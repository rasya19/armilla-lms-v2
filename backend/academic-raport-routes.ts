import { Router } from "express";
import { randomBytes } from "crypto";
import { prisma } from "./db.js";
import { readSchoolKopSurat } from "./kop-surat-helper.js";

const TRANSFER_LEGER_MARKER = "__LEGER_PINDAHAN__";
const TRANSFER_LEGER_TOKEN_REGEX = /_{2,}LEGER_PINDAHAN_{2,}|\[LEGER_PINDAHAN\]/i;
const INTERNAL_SENTINEL_REGEX = /_{2,}[A-Z0-9_]+_{2,}|\[(?:LEGER_PINDAHAN|UPK_OVERRIDE)\]/gi;

function sanitizeCompetencyNote(raw: string | null | undefined): { isTransfer: boolean; cleanNote: string | null } {
  const text = typeof raw === "string" ? raw : "";
  const isTransfer = text === TRANSFER_LEGER_MARKER || TRANSFER_LEGER_TOKEN_REGEX.test(text);
  const cleaned = text.replace(INTERNAL_SENTINEL_REGEX, " ").replace(/\s+/g, " ").trim();
  return { isTransfer, cleanNote: cleaned || null };
}

type RaportExtraBiodata = {
  anakKe?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisKelamin?: string;
  alamat?: string;
  namaOrangTuaWali?: string;
  pekerjaanOrangTuaWali?: string;
  asalLembaga?: string;
  tanggalMasuk?: string;
  semesterMasuk?: string;
  keteranganPindah?: string;
  isSiswaPindahan?: boolean;
  pasFotoUrl?: string;
  tandaTanganUrl?: string;
  tandaTanganTanggal?: string;
};

type RaportP5Item = {
  id: string;
  dimensi: string;
  judulProjek: string;
  tingkatCapaian: "MB" | "SB" | "BSH" | "SAB";
  deskripsi: string;
};

type RaportEkskulItem = {
  id: string;
  kegiatan: string;
  predikat: string;
  keterangan: string;
};

type RaportPrestasiItem = {
  id: string;
  jenis: string;
  keterangan: string;
};

type RaportStudentExtra = {
  biodata: RaportExtraBiodata;
  p5: {
    judulTemaUtama: string;
    catatanProses: string;
    items: RaportP5Item[];
  };
  ekstrakurikuler: RaportEkskulItem[];
  prestasi: RaportPrestasiItem[];
};

const VALID_P5_LEVELS = new Set(["MB", "SB", "BSH", "SAB"]);

function raportBiodataSettingKey(sekolahId: string, siswaId: string): string {
  return `raport_biodata:${sekolahId}:${siswaId}`;
}

function raportExtraSettingKey(sekolahId: string, tahunAjaranId: string, siswaId: string): string {
  return `raport_extra:${sekolahId}:${tahunAjaranId}:${siswaId}`;
}

function sanitizeSafeImageUrl(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLen) return undefined;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function sanitizeRaportBiodata(raw: unknown): RaportExtraBiodata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: RaportExtraBiodata = {};
  const setStr = (key: keyof Omit<RaportExtraBiodata, "isSiswaPindahan" | "pasFotoUrl" | "tandaTanganUrl">, maxLen = 200) => {
    const val = cleanText(obj[key], maxLen);
    if (val) out[key] = val;
  };
  setStr("anakKe", 30);
  setStr("tempatLahir", 100);
  setStr("tanggalLahir", 30);
  setStr("jenisKelamin", 30);
  setStr("alamat", 300);
  setStr("namaOrangTuaWali", 150);
  setStr("pekerjaanOrangTuaWali", 150);
  setStr("asalLembaga", 180);
  setStr("tanggalMasuk", 30);
  setStr("semesterMasuk", 60);
  setStr("keteranganPindah", 350);
  setStr("tandaTanganTanggal", 30);
  if (typeof obj.isSiswaPindahan === "boolean") {
    out.isSiswaPindahan = obj.isSiswaPindahan;
  }
  const pasFoto = sanitizeSafeImageUrl(obj.pasFotoUrl, 600_000);
  if (pasFoto) out.pasFotoUrl = pasFoto;
  const ttd = sanitizeSafeImageUrl(obj.tandaTanganUrl, 350_000);
  if (ttd) out.tandaTanganUrl = ttd;
  return out;
}

function sanitizeRaportSemesterExtra(raw: unknown): Omit<RaportStudentExtra, "biodata"> {
  const empty: Omit<RaportStudentExtra, "biodata"> = {
    p5: { judulTemaUtama: "", catatanProses: "", items: [] },
    ekstrakurikuler: [],
    prestasi: [],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;

  const rawP5 = obj.p5 && typeof obj.p5 === "object" && !Array.isArray(obj.p5) ? (obj.p5 as Record<string, unknown>) : {};
  const rawP5Items = Array.isArray(rawP5.items) ? rawP5.items : [];
  const p5Items: RaportP5Item[] = [];
  for (const item of rawP5Items.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const dimensi = cleanText(rec.dimensi, 120);
    const judulProjek = cleanText(rec.judulProjek, 200);
    const rawLevel = cleanText(rec.tingkatCapaian, 10).toUpperCase();
    const tingkatCapaian = (VALID_P5_LEVELS.has(rawLevel) ? rawLevel : "BSH") as RaportP5Item["tingkatCapaian"];
    const deskripsi = cleanText(rec.deskripsi, 800);
    if (!dimensi && !judulProjek && !deskripsi) continue;
    p5Items.push({
      id: cleanText(rec.id, 60) || randomBytes(6).toString("hex"),
      dimensi: dimensi || "PEMBERDAYAAN",
      judulProjek,
      tingkatCapaian,
      deskripsi,
    });
  }

  const rawEkskul = Array.isArray(obj.ekstrakurikuler) ? obj.ekstrakurikuler : [];
  const ekstrakurikuler: RaportEkskulItem[] = [];
  for (const item of rawEkskul.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const kegiatan = cleanText(rec.kegiatan, 150);
    const predikat = cleanText(rec.predikat, 40) || "Baik";
    const keterangan = cleanText(rec.keterangan, 500);
    if (!kegiatan && !keterangan) continue;
    ekstrakurikuler.push({
      id: cleanText(rec.id, 60) || randomBytes(6).toString("hex"),
      kegiatan,
      predikat,
      keterangan,
    });
  }

  const rawPrestasi = Array.isArray(obj.prestasi) ? obj.prestasi : [];
  const prestasi: RaportPrestasiItem[] = [];
  for (const item of rawPrestasi.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const jenis = cleanText(rec.jenis, 150);
    const keterangan = cleanText(rec.keterangan, 500);
    if (!jenis && !keterangan) continue;
    prestasi.push({
      id: cleanText(rec.id, 60) || randomBytes(6).toString("hex"),
      jenis,
      keterangan,
    });
  }

  return {
    p5: {
      judulTemaUtama: cleanText(rawP5.judulTemaUtama, 200),
      catatanProses: cleanText(rawP5.catatanProses, 1000),
      items: p5Items,
    },
    ekstrakurikuler,
    prestasi,
  };
}

async function saveRaportStudentExtra(
  sekolahId: string,
  tahunAjaranId: string | null,
  siswaId: string,
  rawExtra: unknown,
): Promise<RaportStudentExtra> {
  const obj = rawExtra && typeof rawExtra === "object" && !Array.isArray(rawExtra) ? (rawExtra as Record<string, unknown>) : {};
  const hasBiodataPayload = obj.biodata !== undefined && obj.biodata !== null && typeof obj.biodata === "object";
  const semesterExtra = sanitizeRaportSemesterExtra(obj);

  const bioKey = raportBiodataSettingKey(sekolahId, siswaId);
  let biodata: RaportExtraBiodata = {};
  if (hasBiodataPayload) {
    biodata = sanitizeRaportBiodata(obj.biodata);
    await prisma.platformSetting.upsert({
      where: { key: bioKey },
      create: { key: bioKey, value: JSON.stringify(biodata) },
      update: { value: JSON.stringify(biodata) },
    });
  } else {
    const existingBio = await prisma.platformSetting.findUnique({ where: { key: bioKey } }).catch(() => null);
    if (existingBio?.value) {
      try {
        biodata = sanitizeRaportBiodata(JSON.parse(existingBio.value));
      } catch {
        biodata = {};
      }
    }
  }

  if (tahunAjaranId) {
    const semKey = raportExtraSettingKey(sekolahId, tahunAjaranId, siswaId);
    await prisma.platformSetting.upsert({
      where: { key: semKey },
      create: { key: semKey, value: JSON.stringify(semesterExtra) },
      update: { value: JSON.stringify(semesterExtra) },
    });
  }

  return { biodata, ...semesterExtra };
}
const NOT_UPK_MARKER_FILTER = {
  OR: [{ catatanKompetensi: null }, { catatanKompetensi: { not: UPK_OVERRIDE_MARKER } }],
};
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
            select: {
              id: true,
              nama: true,
              nisn: true,
              jenjang: true,
              tempatLahir: true,
              tanggalLahir: true,
              jenisKelamin: true,
              alamatLengkap: true,
              desaKelurahan: true,
              kecamatan: true,
              namaAyah: true,
              pekerjaanAyah: true,
              namaIbu: true,
              namaIbuKandung: true,
              pekerjaanIbu: true,
              namaWali: true,
              pekerjaanWali: true,
              sekolahAsal: true,
              npsnAsal: true,
              tanggalMasuk: true,
              jalurPendaftaran: true,
              urlSuratPindah: true,
            },
            orderBy: { nama: "asc" },
            take: 500,
          })
        : [];

      const siswaIds = siswaList.map((s) => s.id);
      const extraKeys = siswaIds.flatMap((id) => [
        raportBiodataSettingKey(sekolahId, id),
        ...(activeTahun ? [raportExtraSettingKey(sekolahId, activeTahun.id, id)] : []),
      ]);
      const [nilaiRows, catatanRows, extraSettings] = siswaIds.length
        ? await Promise.all([
            prisma.nilai.findMany({
              where: {
                sekolahId,
                siswaId: { in: siswaIds },
                AND: [
                  ...(activeTahun ? [{ OR: [{ tahunAjaranId: activeTahun.id }, { tahunAjaranId: null }] }] : []),
                  NOT_UPK_MARKER_FILTER,
                ],
              },
              orderBy: { tanggalSimulasi: "desc" },
            }),
            activeTahun
              ? prisma.catatanRaport.findMany({
                  where: { sekolahId, tahunAjaranId: activeTahun.id, siswaId: { in: siswaIds } },
                }).catch(() => [])
              : Promise.resolve([]),
            extraKeys.length
              ? prisma.platformSetting
                  .findMany({ where: { key: { in: extraKeys } } })
                  .catch(() => [])
              : Promise.resolve([]),
          ])
        : [[], [], []];

      const settingMap = new Map(extraSettings.map((item) => [item.key, item.value]));
      const raportExtras: Record<string, RaportStudentExtra> = {};
      for (const sId of siswaIds) {
        let biodata: RaportExtraBiodata = {};
        const rawBio = settingMap.get(raportBiodataSettingKey(sekolahId, sId));
        if (rawBio) {
          try {
            biodata = sanitizeRaportBiodata(JSON.parse(rawBio));
          } catch {
            biodata = {};
          }
        }
        let semExtra: Omit<RaportStudentExtra, "biodata"> = {
          p5: { judulTemaUtama: "", catatanProses: "", items: [] },
          ekstrakurikuler: [],
          prestasi: [],
        };
        if (activeTahun) {
          const rawSem = settingMap.get(raportExtraSettingKey(sekolahId, activeTahun.id, sId));
          if (rawSem) {
            try {
              semExtra = sanitizeRaportSemesterExtra(JSON.parse(rawSem));
            } catch {
              // keep empty default
            }
          }
        }
        raportExtras[sId] = { biodata, ...semExtra };
      }

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
        nilai: (() => {
          const deduped = new Map<string, (typeof nilaiRows)[number] & { parsed: ReturnType<typeof sanitizeCompetencyNote> }>();
          const sorted = [...nilaiRows].sort((a, b) => {
            const aExact = activeTahun && a.tahunAjaranId === activeTahun.id ? 1 : 0;
            const bExact = activeTahun && b.tahunAjaranId === activeTahun.id ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            const aReg = sanitizeCompetencyNote(a.catatanKompetensi).isTransfer ? 0 : 1;
            const bReg = sanitizeCompetencyNote(b.catatanKompetensi).isTransfer ? 0 : 1;
            if (aReg !== bReg) return bReg - aReg;
            return b.tanggalSimulasi.getTime() - a.tanggalSimulasi.getTime();
          });
          for (const row of sorted) {
            const key = `${row.siswaId}::${row.mapelId}`;
            if (!deduped.has(key)) {
              deduped.set(key, { ...row, parsed: sanitizeCompetencyNote(row.catatanKompetensi) });
            }
          }
          return Array.from(deduped.values()).map(({ parsed, ...row }) => ({
            ...row,
            catatanKompetensi: parsed.cleanNote,
            sumberNilai: parsed.isTransfer ? ("pindahan" as const) : ("raport" as const),
          }));
        })(),
        catatan: catatanRows,
        raportExtras,
      });
    } catch (error) {
      console.error("Gagal memuat E-Raport:", error);
      return res.status(503).json({ error: "Data E-Raport belum dapat dimuat." });
    }
  });

  router.post("/raport/tahun-ajaran", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const nama = cleanText(req.body?.nama, 40);
      const rawSem = cleanText(req.body?.semester, 20).toLowerCase();
      const semester = rawSem === "genap" ? "Genap" : "Ganjil";
      const createPair = req.body?.createPair !== false;
      if (!nama) {
        return res.status(400).json({ error: "Nama tahun ajaran (contoh: 2026/2027) wajib diisi." });
      }

      const yearMatch = nama.match(/(20\d{2})/);
      const startYear = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
      const semestersToEnsure: Array<"Ganjil" | "Genap"> = createPair ? ["Ganjil", "Genap"] : [semester];

      let targetRow: { id: string; nama: string; semester: string } | null = null;
      let createdCount = 0;

      for (const sem of semestersToEnsure) {
        const existing = await prisma.tahunAjaran.findFirst({
          where: { sekolahId, nama, semester: sem },
          select: { id: true, nama: true, semester: true },
        });
        if (existing) {
          if (sem === semester) targetRow = existing;
          continue;
        }
        const defaultMulai =
          sem === "Ganjil"
            ? new Date(`${startYear}-07-01T00:00:00.000Z`)
            : new Date(`${startYear + 1}-01-01T00:00:00.000Z`);
        const defaultSelesai =
          sem === "Ganjil"
            ? new Date(`${startYear}-12-31T23:59:59.000Z`)
            : new Date(`${startYear + 1}-06-30T23:59:59.000Z`);

        const created = await prisma.tahunAjaran.create({
          data: {
            sekolahId,
            nama,
            semester: sem,
            mulai: defaultMulai,
            selesai: defaultSelesai,
          },
          select: { id: true, nama: true, semester: true },
        });
        createdCount += 1;
        if (sem === semester) targetRow = created;
      }

      return res.status(createdCount > 0 ? 201 : 200).json({
        tahunAjaran: targetRow,
        createdCount,
        message:
          createdCount > 0
            ? `Tahun ajaran ${nama} (Ganjil & Genap) tersimpan permanen di database.`
            : `Tahun ajaran ${nama} (${semester}) sudah tersedia di database.`,
      });
    } catch (error) {
      console.error("Gagal menambah tahun ajaran:", error);
      return res.status(503).json({ error: "Tahun ajaran belum dapat ditambahkan." });
    }
  });

  // DELETE /api/sekolah/raport/tahun-ajaran — Hapus tahun ajaran (Ganjil & Genap) yang belum terpakai
  router.delete("/raport/tahun-ajaran", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const nama = cleanText(req.query.nama ?? req.body?.nama, 40);
      const forceDeleteNilai = String(req.query.force ?? req.body?.force ?? "") === "true";
      if (!nama) {
        return res.status(400).json({ error: "Nama tahun ajaran wajib ditentukan." });
      }

      const targets = await prisma.tahunAjaran.findMany({
        where: { sekolahId, nama },
        select: { id: true, nama: true, semester: true },
      });
      if (targets.length === 0) {
        return res.status(404).json({ error: `Tahun ajaran ${nama} tidak ditemukan.` });
      }
      const targetIds = targets.map((t) => t.id);

      const [nilaiCount, jadwalCount, agendaCount, presensiCount, materiCount, tugasCount, ujianCount] =
        await Promise.all([
          prisma.nilai.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.jadwalPelajaran.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.agendaMengajar.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.presensi.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.materiAjar.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.tugas.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
          prisma.ujian.count({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }),
        ]);

      const reasons: string[] = [];
      if (nilaiCount > 0 && !forceDeleteNilai) reasons.push(`${nilaiCount} nilai`);
      if (jadwalCount > 0) reasons.push(`${jadwalCount} jadwal`);
      if (agendaCount > 0) reasons.push(`${agendaCount} agenda`);
      if (presensiCount > 0) reasons.push(`${presensiCount} presensi`);
      if (materiCount > 0) reasons.push(`${materiCount} materi`);
      if (tugasCount > 0) reasons.push(`${tugasCount} tugas`);
      if (ujianCount > 0) reasons.push(`${ujianCount} ujian`);

      if (reasons.length > 0) {
        return res.status(409).json({
          error: `Tahun ajaran ${nama} masih digunakan (${reasons.join(", ")}). Kosongkan data terkait terlebih dahulu sebelum menghapus.`,
        });
      }

      if (nilaiCount > 0 && forceDeleteNilai) {
        await prisma.nilai.deleteMany({ where: { sekolahId, tahunAjaranId: { in: targetIds } } });
      }
      await prisma.catatanRaport.deleteMany({ where: { sekolahId, tahunAjaranId: { in: targetIds } } }).catch(() => null);
      await prisma.tahunAjaran.deleteMany({ where: { sekolahId, id: { in: targetIds } } });

      return res.json({
        deletedCount: targets.length,
        deletedNilaiCount: forceDeleteNilai ? nilaiCount : 0,
        message:
          nilaiCount > 0 && forceDeleteNilai
            ? `Tahun ajaran ${nama} beserta ${nilaiCount} nilai di dalamnya berhasil dihapus.`
            : `Tahun ajaran ${nama} berhasil dihapus.`,
      });
    } catch (error) {
      console.error("Gagal menghapus tahun ajaran:", error);
      return res.status(503).json({ error: "Tahun ajaran belum dapat dihapus." });
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
          AND: [NOT_UPK_MARKER_FILTER],
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

  // POST /api/sekolah/raport/nilai-batch — Simpan semua nilai mapel + catatan wali dalam 1x klik
  router.post("/raport/nilai-batch", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100) || null;
      const kelasId = cleanText(req.body?.kelasId, 100);
      const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (!siswaId) {
        return res.status(400).json({ error: "Warga belajar wajib dipilih." });
      }

      const [siswa, tahunAjaran, validMapels] = await Promise.all([
        prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true, kelasId: true } }),
        tahunAjaranId
          ? prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } })
          : Promise.resolve({ id: "" }),
        prisma.mapel.findMany({ where: { sekolahId }, select: { id: true } }),
      ]);
      if (!siswa || (tahunAjaranId && !tahunAjaran)) {
        return res.status(404).json({ error: "Warga belajar atau tahun ajaran tidak ditemukan." });
      }

      const teacherScope = peran === "GURU" && guruId ? await resolveTeacherScope(sekolahId, guruId) : null;
      const validMapelIds = new Set(validMapels.map((m) => m.id));
      let savedCount = 0;

      for (const rawItem of rawEntries.slice(0, 100)) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
        const entry = rawItem as Record<string, unknown>;
        const mapelId = cleanText(entry.mapelId, 100);
        if (!mapelId || !validMapelIds.has(mapelId)) continue;

        if (teacherScope && !teacherScope.isWaliKelas) {
          if (!teacherScope.assignedMapelIds.includes(mapelId) || !siswa.kelasId || !teacherScope.assignedKelasIds.includes(siswa.kelasId)) {
            continue;
          }
        }

        const rawMandiri = entry.nilaiMandiri;
        const rawSimulasi = entry.nilaiSimulasi;
        const hasMandiri = rawMandiri !== null && rawMandiri !== undefined && String(rawMandiri).trim() !== "";
        const hasSimulasi = rawSimulasi !== null && rawSimulasi !== undefined && String(rawSimulasi).trim() !== "";
        if (!hasMandiri && !hasSimulasi) {
          // Jika kolom Mandiri & Simulasi dikosongkan, hapus nilai yang sebelumnya tersimpan pada mapel ini
          const deleted = await prisma.nilai.deleteMany({
            where: { sekolahId, siswaId, mapelId, tahunAjaranId, AND: [NOT_UPK_MARKER_FILTER] },
          });
          if (deleted.count > 0) savedCount += deleted.count;
          continue;
        }

        const mVal = hasMandiri ? Math.max(0, Math.min(100, Number(rawMandiri))) : Math.max(0, Math.min(100, Number(rawSimulasi)));
        const sVal = hasSimulasi ? Math.max(0, Math.min(100, Number(rawSimulasi))) : mVal;
        if (!Number.isFinite(mVal) || !Number.isFinite(sVal)) continue;

        const nilaiAkhir = Math.round(((mVal + sVal) / 2) * 10) / 10;
        const incomingNote = sanitizeCompetencyNote(cleanText(entry.catatanKompetensi, 500) || null).cleanNote;
        const batchSourceMode = cleanText(req.body?.sourceMode, 20).toLowerCase() === "pindahan" ? "pindahan" : "raport";

        const existing = await prisma.nilai.findFirst({
          where: { sekolahId, siswaId, mapelId, tahunAjaranId, AND: [NOT_UPK_MARKER_FILTER] },
          select: { id: true, catatanKompetensi: true },
        });
        const catatanKompetensi = incomingNote
          ? incomingNote
          : batchSourceMode === "pindahan"
            ? TRANSFER_LEGER_MARKER
            : null;
        if (existing) {
          await prisma.nilai.update({
            where: { id: existing.id },
            data: { nilaiMandiri: mVal, nilaiSimulasi: sVal, nilaiAkhir, catatanKompetensi, tanggalSimulasi: new Date() },
          });
        } else {
          await prisma.nilai.create({
            data: {
              id: randomBytes(16).toString("hex"),
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId,
              nilaiMandiri: mVal,
              nilaiSimulasi: sVal,
              nilaiAkhir,
              catatanKompetensi,
            },
          });
        }
        savedCount += 1;
      }

      if (tahunAjaranId && kelasId && (req.body?.catatanWali !== undefined || req.body?.statusKenaikan !== undefined)) {
        const catatanWali = cleanText(req.body?.catatanWali, 1000) || null;
        const rawStatus = cleanText(req.body?.statusKenaikan, 30).toUpperCase();
        const statusKenaikan = ["PROSES", "NAIK_KELAS", "LULUS", "TINGGAL_KELAS"].includes(rawStatus) ? rawStatus : "PROSES";
        const existingCatatan = await prisma.catatanRaport.findUnique({
          where: { sekolahId_tahunAjaranId_siswaId: { sekolahId, tahunAjaranId, siswaId } },
          select: { id: true },
        });
        if (existingCatatan) {
          await prisma.catatanRaport.update({
            where: { id: existingCatatan.id },
            data: { kelasId, catatanWali, statusKenaikan, tanggalRapor: new Date() },
          });
        } else {
          await prisma.catatanRaport.create({
            data: { sekolahId, tahunAjaranId, kelasId, siswaId, catatanWali, statusKenaikan, tanggalRapor: new Date() },
          });
        }
      }

      if (req.body?.raportExtra && typeof req.body.raportExtra === "object") {
        await saveRaportStudentExtra(sekolahId, tahunAjaranId, siswaId, req.body.raportExtra);
      }

      return res.json({
        savedCount,
        message: `${savedCount} nilai mata pelajaran, biodata, P5, ekskul & catatan wali berhasil disimpan.`,
      });
    } catch (error) {
      console.error("Gagal menyimpan nilai raport batch:", error);
      return res.status(503).json({ error: "Nilai raport belum dapat disimpan." });
    }
  });

  // PATCH /api/sekolah/raport/sumber-nilai — Ubah sumber nilai semester siswa antara Rapor Reguler & Leger Pindahan
  router.patch("/raport/sumber-nilai", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const sourceMode = cleanText(req.body?.sourceMode, 20).toLowerCase() === "pindahan" ? "pindahan" : "raport";
      if (!siswaId || !tahunAjaranId) {
        return res.status(400).json({ error: "Warga belajar dan tahun ajaran wajib dipilih." });
      }

      const siswa = await prisma.siswa.findFirst({
        where: { id: siswaId, sekolahId },
        select: { id: true, kelasId: true },
      });
      if (!siswa) {
        return res.status(404).json({ error: "Warga belajar tidak ditemukan." });
      }
      if (peran === "GURU" && guruId) {
        const scope = await resolveTeacherScope(sekolahId, guruId);
        if (!scope.isWaliKelas && (!siswa.kelasId || !scope.assignedKelasIds.includes(siswa.kelasId))) {
          return res.status(403).json({ error: "Anda tidak memiliki akses mengubah sumber nilai pada kelas ini." });
        }
      }

      const rows = await prisma.nilai.findMany({
        where: { sekolahId, siswaId, tahunAjaranId, AND: [NOT_UPK_MARKER_FILTER] },
        select: { id: true, catatanKompetensi: true },
      });

      let updatedCount = 0;
      for (const row of rows) {
        const parsed = sanitizeCompetencyNote(row.catatanKompetensi);
        const nextNote =
          sourceMode === "raport"
            ? parsed.cleanNote
            : parsed.cleanNote
              ? parsed.cleanNote
              : TRANSFER_LEGER_MARKER;
        if (row.catatanKompetensi !== nextNote) {
          await prisma.nilai.update({
            where: { id: row.id },
            data: { catatanKompetensi: nextNote },
          });
          updatedCount += 1;
        }
      }

      return res.json({
        updatedCount,
        sourceMode,
        message:
          sourceMode === "raport"
            ? `Sumber nilai semester ini diubah ke Rapor Reguler (${updatedCount} mapel diperbarui).`
            : `Sumber nilai semester ini ditandai sebagai Leger Pindahan (${updatedCount} mapel diperbarui).`,
      });
    } catch (error) {
      console.error("Gagal mengubah sumber nilai raport:", error);
      return res.status(503).json({ error: "Sumber nilai rapor belum dapat diperbarui." });
    }
  });

  // PUT /api/sekolah/raport/extra — Simpan biodata tambahan, P5/Pemberdayaan, Ekstrakurikuler & Prestasi
  router.put("/raport/extra", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100) || null;
      if (!siswaId) {
        return res.status(400).json({ error: "Warga belajar wajib dipilih." });
      }

      const siswa = await prisma.siswa.findFirst({
        where: { id: siswaId, sekolahId },
        select: { id: true, kelasId: true },
      });
      if (!siswa) {
        return res.status(404).json({ error: "Warga belajar tidak ditemukan." });
      }

      if (peran === "GURU" && guruId) {
        const scope = await resolveTeacherScope(sekolahId, guruId);
        if (!scope.isWaliKelas && (!siswa.kelasId || !scope.assignedKelasIds.includes(siswa.kelasId))) {
          return res.status(403).json({ error: "Anda tidak memiliki akses mengubah data rapor untuk kelas ini." });
        }
      }

      const saved = await saveRaportStudentExtra(sekolahId, tahunAjaranId, siswaId, req.body?.raportExtra ?? req.body);
      return res.json({
        raportExtra: saved,
        message: "Capaian P5, ekstrakurikuler, dan prestasi berhasil disimpan.",
      });
    } catch (error) {
      console.error("Gagal menyimpan data tambahan raport:", error);
      return res.status(503).json({ error: "Data tambahan rapor belum dapat disimpan." });
    }
  });

  // GET /api/sekolah/siswa/:id/biodata — Biodata lengkap siswa (identitas, ortu/wali, mutasi, pas foto, TTD)
  router.get("/siswa/:id/biodata", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;
      const siswaId = cleanText(req.params.id, 100);
      if (!siswaId) return res.status(400).json({ error: "ID siswa tidak valid." });

      const [siswa, school, settings, kopSurat, bioSetting, transferCount] = await Promise.all([
        prisma.siswa.findFirst({
          where: { id: siswaId, sekolahId },
          select: {
            id: true,
            nama: true,
            nisn: true,
            nik: true,
            jenjang: true,
            kelasId: true,
            email: true,
            telepon: true,
            tempatLahir: true,
            tanggalLahir: true,
            jenisKelamin: true,
            alamatLengkap: true,
            desaKelurahan: true,
            kecamatan: true,
            namaAyah: true,
            pekerjaanAyah: true,
            namaIbu: true,
            namaIbuKandung: true,
            pekerjaanIbu: true,
            namaWali: true,
            pekerjaanWali: true,
            sekolahAsal: true,
            npsnAsal: true,
            tanggalMasuk: true,
            jalurPendaftaran: true,
            urlFotoIjazah: true,
            urlSuratPindah: true,
          },
        }),
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, npsn: true, alamatSekolah: true, kabupatenKota: true, namaKepalaSekolah: true },
        }),
        prisma.websiteSettings.findUnique({ where: { school_id: sekolahId }, select: { logo_url: true } }).catch(() => null),
        readSchoolKopSurat(sekolahId),
        prisma.platformSetting.findUnique({ where: { key: raportBiodataSettingKey(sekolahId, siswaId) } }).catch(() => null),
        prisma.nilai.count({ where: { sekolahId, siswaId, catatanKompetensi: TRANSFER_LEGER_MARKER } }).catch(() => 0),
      ]);

      if (!siswa) {
        return res.status(404).json({ error: "Data siswa tidak ditemukan." });
      }

      const kelas = siswa.kelasId
        ? await prisma.kelas.findFirst({ where: { id: siswa.kelasId, sekolahId }, select: { nama: true } })
        : null;

      let biodata: RaportExtraBiodata = {};
      if (bioSetting?.value) {
        try {
          biodata = sanitizeRaportBiodata(JSON.parse(bioSetting.value));
        } catch {
          biodata = {};
        }
      }

      return res.json({
        siswa,
        kelasNama: kelas?.nama ?? null,
        sekolah: {
          nama: school?.nama ?? "PKBM",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
          logoUrl: settings?.logo_url ?? null,
        },
        kopSurat,
        biodata,
        hasTransferScores: transferCount > 0,
      });
    } catch (error) {
      console.error("Gagal memuat biodata siswa:", error);
      return res.status(503).json({ error: "Biodata siswa belum dapat dimuat." });
    }
  });

  // PUT /api/sekolah/siswa/:id/biodata — Simpan biodata lengkap siswa, pas foto & tanda tangan
  router.put("/siswa/:id/biodata", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;
      const siswaId = cleanText(req.params.id, 100);
      if (!siswaId) return res.status(400).json({ error: "ID siswa tidak valid." });

      const existingSiswa = await prisma.siswa.findFirst({
        where: { id: siswaId, sekolahId },
        select: { id: true },
      });
      if (!existingSiswa) {
        return res.status(404).json({ error: "Data siswa tidak ditemukan." });
      }

      const biodata = sanitizeRaportBiodata(req.body?.biodata ?? req.body);
      const bioKey = raportBiodataSettingKey(sekolahId, siswaId);
      await prisma.platformSetting.upsert({
        where: { key: bioKey },
        create: { key: bioKey, value: JSON.stringify(biodata) },
        update: { value: JSON.stringify(biodata) },
      });

      // Sinkronkan field induk dasar siswa jika diisi agar selaras dengan Data Induk & E-Raport
      const siswaUpdate: Record<string, unknown> = {};
      if (biodata.tempatLahir) siswaUpdate.tempatLahir = biodata.tempatLahir;
      if (biodata.tanggalLahir && /^\d{4}-\d{2}-\d{2}$/.test(biodata.tanggalLahir)) {
        const dt = new Date(`${biodata.tanggalLahir}T00:00:00.000Z`);
        if (!Number.isNaN(dt.getTime())) siswaUpdate.tanggalLahir = dt;
      }
      if (biodata.jenisKelamin) siswaUpdate.jenisKelamin = biodata.jenisKelamin;
      if (biodata.alamat) siswaUpdate.alamatLengkap = biodata.alamat;
      if (biodata.asalLembaga) siswaUpdate.sekolahAsal = biodata.asalLembaga;
      if (biodata.tanggalMasuk && /^\d{4}-\d{2}-\d{2}$/.test(biodata.tanggalMasuk)) {
        const dt = new Date(`${biodata.tanggalMasuk}T00:00:00.000Z`);
        if (!Number.isNaN(dt.getTime())) siswaUpdate.tanggalMasuk = dt;
      }
      if (biodata.pasFotoUrl) siswaUpdate.urlFotoIjazah = biodata.pasFotoUrl;

      if (Object.keys(siswaUpdate).length > 0) {
        await prisma.siswa.update({ where: { id: siswaId }, data: siswaUpdate }).catch(() => null);
      }

      return res.json({
        biodata,
        message: "Biodata lengkap peserta didik, pas foto, dan tanda tangan berhasil disimpan.",
      });
    } catch (error) {
      console.error("Gagal menyimpan biodata siswa:", error);
      return res.status(503).json({ error: "Biodata siswa belum dapat disimpan." });
    }
  });

  // POST /api/sekolah/raport/publish — Terbitkan / tarik terbitan E-Raport Digital ke portal siswa
  router.post("/raport/publish", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const kelasId = cleanText(req.body?.kelasId, 100);
      const siswaId = cleanText(req.body?.siswaId, 100);
      const publishAllInClass = req.body?.publishAllInClass === true;
      const diterbitkan = req.body?.diterbitkan === true;

      if (!tahunAjaranId || !kelasId || (!siswaId && !publishAllInClass)) {
        return res.status(400).json({ error: "Tahun ajaran, kelas, dan target siswa wajib dipilih." });
      }

      const targetSiswaIds = publishAllInClass
        ? (
            await prisma.siswa.findMany({
              where: { sekolahId, kelasId, status: "Aktif" },
              select: { id: true },
            })
          ).map((s) => s.id)
        : [siswaId];

      const now = diterbitkan ? new Date() : null;
      let affected = 0;
      for (const sid of targetSiswaIds) {
        const existing = await prisma.catatanRaport.findUnique({
          where: { sekolahId_tahunAjaranId_siswaId: { sekolahId, tahunAjaranId, siswaId: sid } },
          select: { id: true },
        });
        if (existing) {
          await prisma.catatanRaport.update({
            where: { id: existing.id },
            data: { raportDiterbitkan: diterbitkan, raportDiterbitkanPada: now },
          });
        } else {
          await prisma.catatanRaport.create({
            data: {
              sekolahId,
              tahunAjaranId,
              kelasId,
              siswaId: sid,
              statusKenaikan: "PROSES",
              raportDiterbitkan: diterbitkan,
              raportDiterbitkanPada: now,
              tanggalRapor: new Date(),
            },
          });
        }
        affected += 1;
      }

      return res.json({
        affected,
        diterbitkan,
        message: diterbitkan
          ? `Raport Digital berhasil diterbitkan ke portal siswa (${affected} warga belajar).`
          : `Terbitan Raport Digital ditarik kembali (${affected} warga belajar tidak dapat melihat raport).`,
      });
    } catch (error) {
      console.error("Gagal menerbitkan raport digital:", error);
      return res.status(503).json({ error: "Status terbit Raport Digital belum dapat diperbarui." });
    }
  });

  // POST /api/sekolah/raport/transkrip/publish — Terbitkan / tarik terbitan Transkrip Nilai ke portal siswa
  router.post("/raport/transkrip/publish", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const kelasId = cleanText(req.body?.kelasId, 100);
      const siswaId = cleanText(req.body?.siswaId, 100);
      const publishAllInClass = req.body?.publishAllInClass === true;
      const diterbitkan = req.body?.diterbitkan === true;

      if (!siswaId && (!publishAllInClass || !kelasId)) {
        return res.status(400).json({ error: "Target siswa atau kelas wajib dipilih." });
      }

      const result = await prisma.siswa.updateMany({
        where: {
          sekolahId,
          ...(publishAllInClass ? { kelasId, status: "Aktif" } : { id: siswaId }),
        },
        data: {
          transkripDiterbitkan: diterbitkan,
          transkripDiterbitkanPada: diterbitkan ? new Date() : null,
        },
      });

      return res.json({
        affected: result.count,
        diterbitkan,
        message: diterbitkan
          ? `Transkrip Nilai berhasil diterbitkan ke portal siswa (${result.count} warga belajar).`
          : `Terbitan Transkrip Nilai ditarik kembali (${result.count} warga belajar tidak dapat melihat transkrip).`,
      });
    } catch (error) {
      console.error("Gagal menerbitkan transkrip nilai:", error);
      return res.status(503).json({ error: "Status terbit Transkrip Nilai belum dapat diperbarui." });
    }
  });

  async function ensureSixSemesters(sekolahId: string, graduationYear?: string) {
    const gradMatch = graduationYear ? graduationYear.match(/(20\d{2})/) : null;
    if (gradMatch) {
      const gradStartYear = Number(gradMatch[1]);
      const desiredSlots: Array<{ nama: string; semester: string; mulai: Date; selesai: Date }> = [];
      for (let offset = 2; offset >= 0; offset--) {
        const y = gradStartYear - offset;
        const nama = `${y}/${y + 1}`;
        desiredSlots.push(
          {
            nama,
            semester: "Ganjil",
            mulai: new Date(`${y}-07-01T00:00:00.000Z`),
            selesai: new Date(`${y}-12-31T23:59:59.000Z`),
          },
          {
            nama,
            semester: "Genap",
            mulai: new Date(`${y + 1}-01-01T00:00:00.000Z`),
            selesai: new Date(`${y + 1}-06-30T23:59:59.000Z`),
          },
        );
      }
      const existing = await prisma.tahunAjaran.findMany({
        where: { sekolahId, nama: { in: desiredSlots.map((s) => s.nama) } },
        select: { id: true, nama: true, semester: true },
      });
      const byKey = new Map(existing.map((e) => [`${e.nama}::${e.semester}`, e]));
      const result: Array<{ id: string; label: string; nama: string }> = [];
      for (let idx = 0; idx < desiredSlots.length; idx++) {
        const slot = desiredSlots[idx];
        let found = byKey.get(`${slot.nama}::${slot.semester}`);
        if (!found) {
          found =
            (await prisma.tahunAjaran
              .create({
                data: {
                  sekolahId,
                  nama: slot.nama,
                  semester: slot.semester,
                  mulai: slot.mulai,
                  selesai: slot.selesai,
                },
                select: { id: true, nama: true, semester: true },
              })
              .catch(() => undefined)) ??
            (await prisma.tahunAjaran.findFirst({
              where: { sekolahId, nama: slot.nama, semester: slot.semester },
              select: { id: true, nama: true, semester: true },
            })) ??
            undefined;
        }
        if (found) {
          result.push({
            id: found.id,
            label: `Sem ${idx + 1}`,
            nama: `${found.nama} (${found.semester})`,
          });
        }
      }
      if (result.length === 6) return result;
    }

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
      const requestedGraduationYear = cleanText(req.query.graduationYear, 40) || undefined;
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

      // Keep 6 chronological semesters (Semester 1..6), aligned to requested graduationYear if specified
      const sixSemesters = requestedGraduationYear
        ? await ensureSixSemesters(sekolahId, requestedGraduationYear)
        : tahunList.length >= 6
          ? tahunList.slice(-6).map((t, idx) => ({
              id: t.id,
              label: `Sem ${idx + 1}`,
              nama: `${t.nama} (${t.semester})`,
            }))
          : await ensureSixSemesters(sekolahId);
      const sixSemesterIds = new Set(sixSemesters.map((s) => s.id));

      const siswaList = activeKelas
        ? await prisma.siswa.findMany({
            where: { sekolahId, kelasId: activeKelas.id, status: "Aktif" },
            select: {
              id: true,
              nama: true,
              nisn: true,
              jenjang: true,
              tempatLahir: true,
              tanggalLahir: true,
              transkripDiterbitkan: true,
              transkripDiterbitkanPada: true,
            },
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
      const semesterScoreMap = new Map<string, Map<string, { nilai: number; source: "raport" | "pindahan" }>>();
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
            bySem.set(row.tahunAjaranId, {
              nilai: row.nilaiAkhir,
              source: row.catatanKompetensi === TRANSFER_LEGER_MARKER ? "pindahan" : "raport",
            });
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
          const semesterBreakdown = sixSemesters.map((sem) => {
            const entry = bySem?.get(sem.id);
            return {
              tahunAjaranId: sem.id,
              label: sem.label,
              tahunNama: sem.nama,
              nilai: entry?.nilai ?? null,
              source: entry ? entry.source : ("empty" as const),
            };
          });

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
      const allowOverwriteRaport = req.body?.allowOverwriteRaport === true;
      const sourceMode = cleanText(req.body?.sourceMode, 20).toLowerCase() === "reguler" ? "reguler" : "pindahan";
      const graduationYear = cleanText(req.body?.graduationYear, 40) || undefined;
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
      const sixSemesters = await ensureSixSemesters(sekolahId, graduationYear);

      let savedCells = 0;
      const semKeys = ["sem1", "sem2", "sem3", "sem4", "sem5", "sem6"] as const;

      for (const rawItem of rawEntries.slice(0, 100)) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
        const entry = rawItem as Record<string, unknown>;
        const mapelId = cleanText(entry.mapelId, 100);
        if (!mapelId || !validMapelIds.has(mapelId)) continue;

        for (let i = 0; i < Math.min(semKeys.length, sixSemesters.length); i++) {
          const valRaw = entry[semKeys[i]];
          const tahunAjaranId = sixSemesters[i].id;

          // Jika sel dikosongkan (null / ""), hapus record nilai yang ada bila diizinkan
          if (valRaw === null || valRaw === undefined || valRaw === "") {
            if (valRaw === undefined) continue;
            const existingToDelete = await prisma.nilai.findMany({
              where: {
                sekolahId,
                siswaId,
                mapelId,
                tahunAjaranId,
                AND: [NOT_UPK_MARKER_FILTER],
              },
              select: { id: true, catatanKompetensi: true },
            });
            for (const row of existingToDelete) {
              const isRaportRecord = !sanitizeCompetencyNote(row.catatanKompetensi).isTransfer;
              if (isRaportRecord && !allowOverwriteRaport) continue;
              await prisma.nilai.delete({ where: { id: row.id } });
              savedCells += 1;
            }
            continue;
          }

          const num = Number(valRaw);
          if (!Number.isFinite(num) || num < 0 || num > 100) continue;
          const rounded = round2(num);

          const existing = await prisma.nilai.findFirst({
            where: {
              sekolahId,
              siswaId,
              mapelId,
              tahunAjaranId,
              AND: [NOT_UPK_MARKER_FILTER],
            },
            select: { id: true, catatanKompetensi: true, nilaiAkhir: true },
          });

          if (existing) {
            const parsedExisting = sanitizeCompetencyNote(existing.catatanKompetensi);
            const isRaportRecord = !parsedExisting.isTransfer;
            if (isRaportRecord && !allowOverwriteRaport) {
              continue;
            }
            const nextNote =
              sourceMode === "reguler"
                ? parsedExisting.cleanNote
                : parsedExisting.cleanNote || TRANSFER_LEGER_MARKER;
            if (existing.nilaiAkhir === rounded && existing.catatanKompetensi === nextNote) continue;
            await prisma.nilai.update({
              where: { id: existing.id },
              data: {
                nilaiMandiri: rounded,
                nilaiSimulasi: rounded,
                nilaiAkhir: rounded,
                catatanKompetensi: nextNote,
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
                catatanKompetensi: sourceMode === "pindahan" ? TRANSFER_LEGER_MARKER : null,
              },
            });
          }
          savedCells += 1;
        }

        const upkRaw = entry.nilaiUpk;
        if (upkRaw === null || upkRaw === "") {
          const deletedUpk = await prisma.nilai.deleteMany({
            where: { sekolahId, siswaId, mapelId, catatanKompetensi: UPK_OVERRIDE_MARKER },
          });
          savedCells += deletedUpk.count;
        } else if (upkRaw !== undefined) {
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

  // POST /api/sekolah/raport/seed-mapel-kesetaraan — Muat daftar mapel resmi Paket A / B / C (IPA / IPS)
  router.post("/raport/seed-mapel-kesetaraan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const rawJenjang = cleanText(req.body?.jenjang, 20).toUpperCase();
      const rawJurusan = cleanText(req.body?.jurusan, 10).toUpperCase();
      const jenjang: "PAKET_A" | "PAKET_B" | "PAKET_C" =
        rawJenjang === "PAKET_A" || rawJenjang === "PAKET_B" || rawJenjang === "PAKET_C" ? rawJenjang : "PAKET_C";
      const jurusan: "IPA" | "IPS" = rawJurusan === "IPA" ? "IPA" : "IPS";

      const catalog: Record<string, Array<{ kode: string; nama: string; kkm: number }>> = {
        PAKET_A: [
          { kode: "PA-PABP", nama: "Pendidikan Agama dan Budi Pekerti", kkm: 75 },
          { kode: "PA-PPKN", nama: "Pendidikan Pancasila", kkm: 75 },
          { kode: "PA-BIND", nama: "Bahasa Indonesia", kkm: 75 },
          { kode: "PA-MTK", nama: "Matematika", kkm: 70 },
          { kode: "PA-IPAS", nama: "Ilmu Pengetahuan Alam dan Sosial (IPAS)", kkm: 72 },
          { kode: "PA-PJOK", nama: "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)", kkm: 75 },
          { kode: "PA-SBD", nama: "Seni dan Budaya", kkm: 75 },
          { kode: "PA-BING", nama: "Bahasa Inggris", kkm: 72 },
          { kode: "PA-PMB", nama: "Pemberdayaan", kkm: 75 },
          { kode: "PA-KTR", nama: "Keterampilan", kkm: 75 },
        ],
        PAKET_B: [
          { kode: "PB-PABP", nama: "Pendidikan Agama dan Budi Pekerti", kkm: 75 },
          { kode: "PB-PPKN", nama: "Pendidikan Pancasila", kkm: 75 },
          { kode: "PB-BIND", nama: "Bahasa Indonesia", kkm: 75 },
          { kode: "PB-MTK", nama: "Matematika", kkm: 72 },
          { kode: "PB-IPA", nama: "Ilmu Pengetahuan Alam (IPA)", kkm: 72 },
          { kode: "PB-IPS", nama: "Ilmu Pengetahuan Sosial (IPS)", kkm: 75 },
          { kode: "PB-BING", nama: "Bahasa Inggris", kkm: 72 },
          { kode: "PB-PJOK", nama: "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)", kkm: 75 },
          { kode: "PB-INF", nama: "Informatika", kkm: 75 },
          { kode: "PB-SBD", nama: "Seni dan Budaya", kkm: 75 },
          { kode: "PB-PMB", nama: "Pemberdayaan", kkm: 75 },
          { kode: "PB-KTR", nama: "Keterampilan", kkm: 75 },
        ],
        PAKET_C_IPA: [
          { kode: "PC-PABP", nama: "Pendidikan Agama dan Budi Pekerti", kkm: 75 },
          { kode: "PC-PPKN", nama: "Pendidikan Pancasila", kkm: 75 },
          { kode: "PC-BIND", nama: "Bahasa Indonesia", kkm: 75 },
          { kode: "PC-MTK", nama: "Matematika", kkm: 72 },
          { kode: "PC-BING", nama: "Bahasa Inggris", kkm: 75 },
          { kode: "PC-SEJ", nama: "Sejarah", kkm: 75 },
          { kode: "PC-PJOK", nama: "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)", kkm: 75 },
          { kode: "PC-SBD", nama: "Seni dan Budaya", kkm: 75 },
          { kode: "PC-FIS", nama: "Fisika", kkm: 72 },
          { kode: "PC-KIM", nama: "Kimia", kkm: 72 },
          { kode: "PC-BIO", nama: "Biologi", kkm: 75 },
          { kode: "PC-INF", nama: "Informatika", kkm: 75 },
          { kode: "PC-PMB", nama: "Pemberdayaan", kkm: 75 },
          { kode: "PC-KTR", nama: "Keterampilan", kkm: 75 },
        ],
        PAKET_C_IPS: [
          { kode: "PC-PABP", nama: "Pendidikan Agama dan Budi Pekerti", kkm: 75 },
          { kode: "PC-PPKN", nama: "Pendidikan Pancasila", kkm: 75 },
          { kode: "PC-BIND", nama: "Bahasa Indonesia", kkm: 75 },
          { kode: "PC-MTK", nama: "Matematika", kkm: 72 },
          { kode: "PC-BING", nama: "Bahasa Inggris", kkm: 75 },
          { kode: "PC-SEJ", nama: "Sejarah", kkm: 75 },
          { kode: "PC-PJOK", nama: "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)", kkm: 75 },
          { kode: "PC-SBD", nama: "Seni dan Budaya", kkm: 75 },
          { kode: "PC-EKO", nama: "Ekonomi", kkm: 75 },
          { kode: "PC-SOS", nama: "Sosiologi", kkm: 75 },
          { kode: "PC-GEO", nama: "Geografi", kkm: 75 },
          { kode: "PC-PMB", nama: "Pemberdayaan", kkm: 75 },
          { kode: "PC-KTR", nama: "Keterampilan", kkm: 75 },
        ],
      };

      const key = jenjang === "PAKET_C" ? `PAKET_C_${jurusan}` : jenjang;
      const templates = catalog[key] ?? catalog.PAKET_C_IPS;

      const existing = await prisma.mapel.findMany({
        where: { sekolahId },
        select: { nama: true, kode: true },
      });
      const existingNames = new Set(existing.map((m) => m.nama.trim().toLowerCase()));
      const slugPrefix = sekolahId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();

      let createdCount = 0;
      for (const item of templates) {
        if (existingNames.has(item.nama.trim().toLowerCase())) continue;
        const uniqueCode = `${item.kode}-${slugPrefix}`;
        try {
          await prisma.mapel.create({
            data: {
              sekolahId,
              kode: uniqueCode,
              nama: item.nama,
              kkm: item.kkm,
            },
          });
          existingNames.add(item.nama.trim().toLowerCase());
          createdCount += 1;
        } catch {
          // skip duplicate code if already present
        }
      }

      const label = jenjang === "PAKET_C" ? `Paket C (${jurusan})` : jenjang.replace("_", " ");
      return res.json({
        createdCount,
        message:
          createdCount > 0
            ? `${createdCount} mata pelajaran standar ${label} berhasil ditambahkan.`
            : `Seluruh mata pelajaran standar ${label} sudah tersedia di lembaga ini.`,
      });
    } catch (error) {
      console.error("Gagal memuat mapel standar kesetaraan:", error);
      return res.status(503).json({ error: "Daftar mapel standar belum dapat dimuat." });
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
            AND: [NOT_UPK_MARKER_FILTER],
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
