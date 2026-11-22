import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  resolveAuthorizedSchool,
  resolveTeacherScope,
  type SchoolContextResolver,
} from "./school-modules-shared.js";
import {
  cbtCategoryPrefix,
  cbtCategoryTag,
  normalizeCbtCategory,
  normalizeLookupKey,
  parseBulkQuestions,
  parseBulkTasks,
} from "./cbt-import.js";

export type BankVisibility = "PRIVATE" | "PUBLIC" | "ARCHIVED";
export type BankJenjang = "PAKET_A" | "PAKET_B" | "PAKET_C" | "LAINNYA";
export type PublicBankKategori = "LATIHAN" | "UTS" | "UAS" | "UJIAN_AKHIR";

export const ARCHIVED_OR_UNAVAILABLE_ERROR =
  "Bank soal ini sudah diarsipkan atau tidak tersedia untuk publik";

export function parseBankVisibilityStrict(raw: unknown): BankVisibility | null {
  if (typeof raw !== "string") return null;
  const norm = raw.trim().toUpperCase();
  if (norm === "PRIVATE" || norm === "PUBLIC" || norm === "ARCHIVED") return norm;
  return null;
}

export function normalizeBankVisibility(raw: unknown, fallback: BankVisibility = "PRIVATE"): BankVisibility {
  return parseBankVisibilityStrict(raw) ?? fallback;
}

export function isBankCloneable(bank: { visibility?: string | null } | null | undefined): boolean {
  return Boolean(bank && bank.visibility === "PUBLIC");
}

export function detectBankJenjang(kelasNama: string, judul: string): BankJenjang {
  const combined = `${kelasNama} ${judul}`.toLowerCase();
  if (/\bpaket\s*a\b/.test(combined)) return "PAKET_A";
  if (/\bpaket\s*b\b/.test(combined)) return "PAKET_B";
  if (/\bpaket\s*c\b/.test(combined)) return "PAKET_C";
  const gradeMatch = combined.match(/\b(?:kelas|kls|tingkat)\s*(\d{1,2})(?=[a-z]?\b)/);
  if (gradeMatch) {
    const grade = Number(gradeMatch[1]);
    if (grade >= 1 && grade <= 6) return "PAKET_A";
    if (grade >= 7 && grade <= 9) return "PAKET_B";
    if (grade >= 10 && grade <= 12) return "PAKET_C";
  }
  if (/\bsd\b/.test(combined)) return "PAKET_A";
  if (/\bsmp\b/.test(combined)) return "PAKET_B";
  if (/\bsma\b|\bsmk\b/.test(combined)) return "PAKET_C";
  return "LAINNYA";
}

export function detectPublicBankKategori(kode: string, judul: string): PublicBankKategori {
  const k = kode.trim().toUpperCase();
  const j = judul.trim().toUpperCase();
  if (k.startsWith("UA-") || k.startsWith("UPK-") || /\b(?:UJIAN AKHIR|KELAS AKHIR|UPK|USBN|UNPK)\b/.test(j)) {
    return "UJIAN_AKHIR";
  }
  if (k.startsWith("AS-") || k.startsWith("UAS-") || /\b(?:UAS|PAS|PAT|ASESMEN SUMATIF|SUMATIF AKHIR)\b/.test(j)) {
    return "UAS";
  }
  if (k.startsWith("UTS-") || k.startsWith("PTS-") || /\b(?:UTS|PTS|TENGAH SEMESTER)\b/.test(j)) {
    return "UTS";
  }
  return "LATIHAN";
}

function generateExamToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let token = "";
  for (let i = 0; i < 6; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}

async function resolveOrCreateSchoolYearShared(sekolahId: string, requestedId?: string): Promise<string | null> {
  if (requestedId) {
    const found = await prisma.tahunAjaran.findFirst({ where: { id: requestedId, sekolahId }, select: { id: true } });
    if (found) return found.id;
  }
  const now = new Date();
  const active = await prisma.tahunAjaran.findFirst({
    where: { sekolahId, mulai: { lte: now }, selesai: { gte: now } },
    select: { id: true },
  });
  if (active) return active.id;
  const latest = await prisma.tahunAjaran.findFirst({ where: { sekolahId }, orderBy: { mulai: "desc" }, select: { id: true } });
  if (latest) return latest.id;
  const yearNow = now.getUTCFullYear();
  const createdYear = await prisma.tahunAjaran.create({
    data: {
      sekolahId,
      nama: `${yearNow}/${yearNow + 1}`,
      semester: "Ganjil",
      mulai: new Date(`${yearNow}-01-01T00:00:00.000Z`),
      selesai: new Date(`${yearNow}-12-31T23:59:59.000Z`),
    },
    select: { id: true },
  });
  return createdYear.id;
}

export function cbtPublicBankRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  function mapMasterKategori(raw: string): PublicBankKategori {
    const norm = raw.trim().toUpperCase();
    if (norm === "UTS") return "UTS";
    if (norm === "UAS" || norm === "AS") return "UAS";
    if (norm === "UJIAN_AKHIR" || norm === "UPK") return "UJIAN_AKHIR";
    return "LATIHAN";
  }

  function mapMasterJenjang(raw: string): BankJenjang {
    const norm = raw.trim().toUpperCase();
    if (norm === "PAKET_A") return "PAKET_A";
    if (norm === "PAKET_B") return "PAKET_B";
    if (norm === "PAKET_C") return "PAKET_C";
    return "LAINNYA";
  }

  function masterButirToOptions(item: {
    tipe: string;
    opsiA: string | null;
    opsiB: string | null;
    opsiC: string | null;
    opsiD: string | null;
    opsiE: string | null;
    kunciJawaban: string;
  }): Array<{ kode: string; teks: string; benar: boolean }> {
    if (item.tipe.toUpperCase() === "ESAI") return [];
    const key = item.kunciJawaban.trim().toUpperCase();
    const pairs: Array<[string, string | null]> = [
      ["A", item.opsiA],
      ["B", item.opsiB],
      ["C", item.opsiC],
      ["D", item.opsiD],
      ["E", item.opsiE],
    ];
    return pairs
      .filter(([, text]) => Boolean(text && text.trim()))
      .map(([kode, text]) => ({ kode, teks: text!.trim(), benar: kode === key }));
  }

  // GET /api/cbt/public-banks — Strictly PUBLIC school banks + active Master Admin banks (PRIVATE & ARCHIVED excluded)
  router.get("/public-banks", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

      const rawJenjang = typeof req.query.jenjang === "string" ? req.query.jenjang.trim().toUpperCase() : "";
      const rawMapel = typeof req.query.mapel === "string" ? req.query.mapel.trim().toLowerCase() : "";
      const rawKategori = typeof req.query.kategori === "string" ? req.query.kategori.trim().toUpperCase() : "";
      const rawQ = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      const [schoolRows, masterRows] = await Promise.all([
        prisma.ujian.findMany({
          where: { visibility: "PUBLIC" },
          select: {
            id: true,
            sekolahId: true,
            kode: true,
            judul: true,
            durasiMenit: true,
            kkm: true,
            visibility: true,
            originSchoolName: true,
            createdAt: true,
            sekolah: { select: { nama: true } },
            kelas: { select: { nama: true } },
            mapel: { select: { nama: true } },
            guru: { select: { nama: true } },
            _count: { select: { soal: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 300,
        }),
        prisma.masterBankSoal
          .findMany({
            where: { aktif: true },
            select: {
              id: true,
              jenjang: true,
              tingkatKelas: true,
              mataPelajaran: true,
              kategoriUjian: true,
              judul: true,
              durasiMenit: true,
              kkm: true,
              createdAt: true,
              _count: { select: { butirSoal: true } },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 200,
          })
          .catch(() => []),
      ]);

      const mappedSchool = schoolRows.map((row) => {
        const originName = row.originSchoolName || row.sekolah.nama;
        return {
          id: row.id,
          kode: row.kode,
          judul: row.judul,
          durasiMenit: row.durasiMenit,
          kkm: row.kkm,
          visibility: "PUBLIC" as const,
          createdAt: row.createdAt,
          jumlahSoal: row._count.soal,
          mataPelajaran: row.mapel.nama,
          kelasAsal: row.kelas.nama,
          jenjang: detectBankJenjang(row.kelas.nama, row.judul),
          kategori: detectPublicBankKategori(row.kode, row.judul),
          originSchoolName: originName,
          sourceSchoolName: originName,
          pembuatNama: row.guru.nama,
          isOwnSchool: row.sekolahId === auth.session.sekolahId,
          isMaster: false,
        };
      });

      const mappedMaster = masterRows.map((row) => ({
        id: `master:${row.id}`,
        kode: `MASTER-${row.kategoriUjian}`,
        judul: row.judul,
        durasiMenit: row.durasiMenit,
        kkm: row.kkm,
        visibility: "PUBLIC" as const,
        createdAt: row.createdAt,
        jumlahSoal: row._count.butirSoal,
        mataPelajaran: row.mataPelajaran,
        kelasAsal: `${row.jenjang.replace("_", " ")} ${row.tingkatKelas}`.trim(),
        jenjang: mapMasterJenjang(row.jenjang),
        kategori: mapMasterKategori(row.kategoriUjian),
        originSchoolName: "Pustaka Pusat (Master Admin)",
        sourceSchoolName: "Pustaka Pusat (Master Admin)",
        pembuatNama: "Tim Kurikulum Pusat",
        isOwnSchool: false,
        isMaster: true,
      }));

      const combined = [...mappedMaster, ...mappedSchool];

      const mataPelajaranList = Array.from(new Set(combined.map((item) => item.mataPelajaran))).sort((a, b) =>
        a.localeCompare(b, "id-ID"),
      );

      const filtered = combined.filter((item) => {
        if (rawJenjang && rawJenjang !== "ALL" && item.jenjang !== rawJenjang) return false;
        if (rawKategori && rawKategori !== "ALL" && item.kategori !== rawKategori) return false;
        if (rawMapel && item.mataPelajaran.toLowerCase() !== rawMapel) return false;
        if (rawQ) {
          const haystack = `${item.judul} ${item.kode} ${item.mataPelajaran} ${item.kelasAsal} ${item.originSchoolName} ${item.pembuatNama}`.toLowerCase();
          if (!haystack.includes(rawQ)) return false;
        }
        return true;
      });

      return res.json({
        banks: filtered,
        mataPelajaranList,
        total: filtered.length,
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Kolom visibilitas Bank Soal belum dimigrasi pada database." });
      }
      console.error("Gagal memuat katalog bank soal umum:", error);
      return res.status(503).json({ error: "Katalog bank soal umum belum dapat dimuat." });
    }
  });

  // GET /api/cbt/public-banks/:id/preview — Read-only question & options preview (rejects PRIVATE / ARCHIVED)
  router.get("/public-banks/:id/preview", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

      const rawId = req.params.id;
      if (rawId.startsWith("master:")) {
        const masterId = rawId.slice("master:".length);
        const master = await prisma.masterBankSoal.findUnique({
          where: { id: masterId },
          include: { butirSoal: { orderBy: { urutan: "asc" } } },
        });
        if (!master || !master.aktif) {
          return res.status(404).json({ error: ARCHIVED_OR_UNAVAILABLE_ERROR });
        }
        return res.json({
          bank: {
            id: rawId,
            kode: `MASTER-${master.kategoriUjian}`,
            judul: master.judul,
            durasiMenit: master.durasiMenit,
            kkm: master.kkm,
            mataPelajaran: master.mataPelajaran,
            kelasAsal: `${master.jenjang.replace("_", " ")} ${master.tingkatKelas}`.trim(),
            jenjang: mapMasterJenjang(master.jenjang),
            kategori: mapMasterKategori(master.kategoriUjian),
            originSchoolName: "Pustaka Pusat (Master Admin)",
            pembuatNama: "Tim Kurikulum Pusat",
            jumlahSoal: master.butirSoal.length,
            isMaster: true,
          },
          soal: master.butirSoal.map((item) => ({
            id: item.id,
            urutan: item.urutan,
            tipe: item.tipe === "ESAI" ? "ESAI" : "PG",
            teks: item.teks,
            bobot: item.bobot,
            kunciEsai: item.tipe === "ESAI" ? item.kunciJawaban : null,
            pembahasan: item.pembahasan,
            opsi: masterButirToOptions(item),
          })),
        });
      }

      const source = await prisma.ujian.findUnique({
        where: { id: rawId },
        select: {
          id: true,
          kode: true,
          judul: true,
          durasiMenit: true,
          kkm: true,
          visibility: true,
          originSchoolName: true,
          sekolah: { select: { nama: true } },
          kelas: { select: { nama: true } },
          mapel: { select: { nama: true } },
          guru: { select: { nama: true } },
          soal: {
            orderBy: { urutan: "asc" },
            select: {
              id: true,
              urutan: true,
              tipe: true,
              teks: true,
              bobot: true,
              kunciEsai: true,
              pembahasan: true,
              opsi: {
                orderBy: { kode: "asc" },
                select: { id: true, kode: true, teks: true, benar: true },
              },
            },
          },
        },
      });

      if (!isBankCloneable(source) || !source) {
        return res.status(404).json({ error: ARCHIVED_OR_UNAVAILABLE_ERROR });
      }

      const originName = source.originSchoolName || source.sekolah.nama;
      return res.json({
        bank: {
          id: source.id,
          kode: source.kode,
          judul: source.judul,
          durasiMenit: source.durasiMenit,
          kkm: source.kkm,
          mataPelajaran: source.mapel.nama,
          kelasAsal: source.kelas.nama,
          jenjang: detectBankJenjang(source.kelas.nama, source.judul),
          kategori: detectPublicBankKategori(source.kode, source.judul),
          originSchoolName: originName,
          pembuatNama: source.guru.nama,
          jumlahSoal: source.soal.length,
          isMaster: false,
        },
        soal: source.soal,
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Kolom visibilitas Bank Soal belum dimigrasi pada database." });
      }
      console.error("Gagal memuat pratinjau bank soal umum:", error);
      return res.status(503).json({ error: "Pratinjau soal belum dapat dimuat." });
    }
  });

  // Shared handler for POST /api/cbt/public-banks/:id/import and POST /api/cbt/public-banks/:id/clone
  async function handleImportPublicBank(req: import("express").Request, res: import("express").Response) {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const rawId = req.params.id;
      let sourceData: {
        judul: string;
        kode: string;
        durasiMenit: number;
        kkm: number;
        kelasNama: string;
        mapelNama: string;
        mapelKkm: number;
        originSchoolName: string;
        category: PublicBankKategori;
        jenjang: BankJenjang;
        acakSoal: boolean;
        acakOpsi: boolean;
        tampilNilai: boolean;
        toleransiKeluarTab: number;
        soal: Array<{
          tipe: string;
          teks: string;
          bobot: number;
          kunciEsai: string | null;
          pembahasan: string | null;
          opsi: Array<{ kode: string; teks: string; benar: boolean }>;
        }>;
      } | null = null;

      if (rawId.startsWith("master:")) {
        const masterId = rawId.slice("master:".length);
        const master = await prisma.masterBankSoal.findUnique({
          where: { id: masterId },
          include: { butirSoal: { orderBy: { urutan: "asc" } } },
        });
        if (!master || !master.aktif) {
          return res.status(404).json({ error: ARCHIVED_OR_UNAVAILABLE_ERROR });
        }
        const jenjang = mapMasterJenjang(master.jenjang);
        const jenjangTitle =
          jenjang === "PAKET_A" ? "Paket A" : jenjang === "PAKET_B" ? "Paket B" : jenjang === "PAKET_C" ? "Paket C" : "Kesetaraan";
        sourceData = {
          judul: master.judul,
          kode: `MASTER-${master.kategoriUjian}`,
          durasiMenit: master.durasiMenit,
          kkm: master.kkm,
          kelasNama: `${jenjangTitle} ${master.tingkatKelas}`.trim(),
          mapelNama: master.mataPelajaran,
          mapelKkm: master.kkm,
          originSchoolName: "Pustaka Pusat (Master Admin)",
          category: mapMasterKategori(master.kategoriUjian),
          jenjang,
          acakSoal: true,
          acakOpsi: true,
          tampilNilai: true,
          toleransiKeluarTab: 3,
          soal: master.butirSoal.map((item) => ({
            tipe: item.tipe === "ESAI" ? "ESAI" : "PG",
            teks: item.teks,
            bobot: item.bobot,
            kunciEsai: item.tipe === "ESAI" ? item.kunciJawaban : null,
            pembahasan: item.pembahasan,
            opsi: masterButirToOptions(item),
          })),
        };
      } else {
        const source = await prisma.ujian.findUnique({
          where: { id: rawId },
          include: {
            sekolah: { select: { nama: true } },
            kelas: { select: { nama: true } },
            mapel: { select: { nama: true, kkm: true } },
            soal: {
              orderBy: { urutan: "asc" },
              include: { opsi: { orderBy: { kode: "asc" } } },
            },
          },
        });
        if (!isBankCloneable(source) || !source) {
          return res.status(404).json({ error: ARCHIVED_OR_UNAVAILABLE_ERROR });
        }
        sourceData = {
          judul: source.judul,
          kode: source.kode,
          durasiMenit: source.durasiMenit,
          kkm: source.kkm,
          kelasNama: source.kelas.nama,
          mapelNama: source.mapel.nama,
          mapelKkm: source.mapel.kkm,
          originSchoolName: source.originSchoolName || source.sekolah.nama,
          category: detectPublicBankKategori(source.kode, source.judul),
          jenjang: detectBankJenjang(source.kelas.nama, source.judul),
          acakSoal: source.acakSoal,
          acakOpsi: source.acakOpsi,
          tampilNilai: source.tampilNilai,
          toleransiKeluarTab: source.toleransiKeluarTab,
          soal: source.soal.map((item) => ({
            tipe: item.tipe,
            teks: item.teks,
            bobot: item.bobot,
            kunciEsai: item.kunciEsai,
            pembahasan: item.pembahasan,
            opsi: item.opsi.map((opt) => ({ kode: opt.kode, teks: opt.teks, benar: opt.benar })),
          })),
        };
      }

      const teacherScope = peran === "GURU" && sessionGuruId ? await resolveTeacherScope(sekolahId, sessionGuruId) : null;
      const requestedKelasId = cleanText(req.body?.kelasId, 100);
      const requestedMapelId = cleanText(req.body?.mapelId, 100);
      let targetGuruId = peran === "GURU" && sessionGuruId ? sessionGuruId : cleanText(req.body?.guruId, 100);

      if (!targetGuruId) {
        const firstGuru = await prisma.guru.findFirst({ where: { sekolahId, status: "Aktif" }, select: { id: true } });
        if (!firstGuru) {
          return res.status(400).json({ error: "Tambahkan minimal satu guru aktif di sekolah Anda sebelum mengambil bank soal." });
        }
        targetGuruId = firstGuru.id;
      } else {
        const validGuru = await prisma.guru.findFirst({ where: { id: targetGuruId, sekolahId }, select: { id: true } });
        if (!validGuru) {
          return res.status(400).json({ error: "Guru target tidak ditemukan di sekolah Anda." });
        }
      }

      // Resolve target Kelas in requesting school
      let targetKelasId = "";
      if (requestedKelasId) {
        const foundKelas = await prisma.kelas.findFirst({ where: { id: requestedKelasId, sekolahId }, select: { id: true } });
        if (!foundKelas) return res.status(400).json({ error: "Kelas tujuan tidak ditemukan di sekolah Anda." });
        if (teacherScope && !teacherScope.isWaliKelas && !teacherScope.assignedKelasIds.includes(foundKelas.id)) {
          return res.status(403).json({ error: "Anda hanya dapat menyalin ke kelas yang Anda ampu." });
        }
        targetKelasId = foundKelas.id;
      } else {
        const schoolClasses = await prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(teacherScope && !teacherScope.isWaliKelas && teacherScope.assignedKelasIds.length > 0
              ? { id: { in: teacherScope.assignedKelasIds } }
              : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 200,
        });
        const exactKelas = schoolClasses.find((k) => normalizeLookupKey(k.nama) === normalizeLookupKey(sourceData.kelasNama));
        const sameJenjangKelas =
          sourceData.jenjang !== "LAINNYA"
            ? schoolClasses.find((k) => detectBankJenjang(k.nama, "") === sourceData.jenjang)
            : undefined;
        if (exactKelas) {
          targetKelasId = exactKelas.id;
        } else if (sameJenjangKelas) {
          targetKelasId = sameJenjangKelas.id;
        } else if (schoolClasses[0]) {
          targetKelasId = schoolClasses[0].id;
        } else {
          const kodeKelas = `KLS-${randomBytes(3).toString("hex").toUpperCase()}`;
          const createdKelas = await prisma.kelas.create({
            data: { sekolahId, kode: kodeKelas, nama: sourceData.kelasNama.slice(0, 80) },
            select: { id: true },
          });
          targetKelasId = createdKelas.id;
        }
      }

      // Resolve target Mapel in requesting school
      let targetMapelId = "";
      if (requestedMapelId) {
        const foundMapel = await prisma.mapel.findFirst({ where: { id: requestedMapelId, sekolahId }, select: { id: true } });
        if (!foundMapel) return res.status(400).json({ error: "Mata pelajaran tujuan tidak ditemukan di sekolah Anda." });
        if (teacherScope && !teacherScope.isWaliKelas && !teacherScope.assignedMapelIds.includes(foundMapel.id)) {
          return res.status(403).json({ error: "Anda hanya dapat menyalin ke mata pelajaran yang Anda ampu." });
        }
        targetMapelId = foundMapel.id;
      } else {
        const schoolMapels = await prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 300,
        });
        const exactMapel = schoolMapels.find((m) => normalizeLookupKey(m.nama) === normalizeLookupKey(sourceData.mapelNama));
        if (exactMapel) {
          targetMapelId = exactMapel.id;
        } else {
          const kodeMapel = `${sourceData.mapelNama.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "MP"}-${randomBytes(2).toString("hex").toUpperCase()}`;
          const createdMapel = await prisma.mapel.create({
            data: {
              sekolahId,
              kode: kodeMapel,
              nama: sourceData.mapelNama.slice(0, 120),
              kkm: Math.round(sourceData.mapelKkm || sourceData.kkm || 75),
            },
            select: { id: true },
          });
          targetMapelId = createdMapel.id;
        }
      }

      const tahunAjaranId = await resolveOrCreateSchoolYearShared(sekolahId);
      if (!tahunAjaranId) return res.status(400).json({ error: "Tahun ajaran sekolah tidak tersedia." });

      const settings = await prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null);
      const prefix =
        sourceData.category === "UTS"
          ? "UTS"
          : sourceData.category === "UAS"
            ? "AS"
            : sourceData.category === "UJIAN_AKHIR"
              ? "UA"
              : "CBT";
      const tokenKode = generateExamToken();
      const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
      const kode = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const now = new Date();
      const selesai = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const cloned = await prisma.$transaction(async (tx) => {
        return tx.ujian.create({
          data: {
            sekolahId,
            tahunAjaranId,
            kelasId: targetKelasId,
            mapelId: targetMapelId,
            guruId: targetGuruId,
            kode,
            judul: sourceData.judul,
            durasiMenit: sourceData.durasiMenit,
            mulai: now,
            selesai,
            kkm: sourceData.kkm,
            tokenKode,
            tokenHash,
            acakSoal: settings?.acakUrutanSoal ?? sourceData.acakSoal,
            acakOpsi: settings?.acakOpsiJawaban ?? sourceData.acakOpsi,
            tampilNilai: settings?.tampilkanNilaiLangsung ?? sourceData.tampilNilai,
            toleransiKeluarTab: settings?.batasToleransiKeluarTab ?? sourceData.toleransiKeluarTab,
            dipublikasikan: false,
            visibility: "PRIVATE",
            originSchoolName: sourceData.originSchoolName,
            soal: {
              create: sourceData.soal.map((item, idx) => ({
                urutan: idx + 1,
                tipe: item.tipe,
                teks: item.teks,
                bobot: item.bobot,
                kunciEsai: item.kunciEsai,
                pembahasan: item.pembahasan,
                ...(item.opsi.length
                  ? {
                      opsi: {
                        create: item.opsi.map((opt) => ({
                          kode: opt.kode,
                          teks: opt.teks,
                          benar: opt.benar,
                        })),
                      },
                    }
                  : {}),
              })),
            },
          },
          include: {
            kelas: { select: { id: true, nama: true } },
            mapel: { select: { id: true, nama: true } },
            guru: { select: { id: true, nama: true } },
            _count: { select: { soal: true, percobaan: true } },
          },
        });
      });

      return res.status(201).json({
        ujian: cloned,
        copiedSoalCount: sourceData.soal.length,
        message: `Bank soal "${sourceData.judul}" (${sourceData.soal.length} butir soal) dari ${sourceData.originSchoolName} berhasil diambil ke Bank Soal Sekolah Anda (Privat).`,
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Kolom visibilitas Bank Soal belum dimigrasi pada database." });
      }
      console.error("Gagal mengambil bank soal umum:", error);
      return res.status(503).json({ error: "Bank soal umum belum dapat diambil." });
    }
  }

  router.post("/public-banks/:id/import", handleImportPublicBank);
  router.post("/public-banks/:id/clone", handleImportPublicBank);

  // PATCH /api/cbt/banks/:id/visibility — Creator or School Admin toggles PRIVATE | PUBLIC | ARCHIVED
  router.patch("/banks/:id/visibility", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const nextVisibility = parseBankVisibilityStrict(req.body?.visibility);
      if (!nextVisibility) {
        return res.status(400).json({
          error: "Status visibilitas tidak valid. Gunakan PRIVATE, PUBLIC, atau ARCHIVED.",
        });
      }

      const existing = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        select: { id: true, judul: true, guruId: true, visibility: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Paket bank soal tidak ditemukan." });
      }

      if (peran === "GURU" && sessionGuruId && existing.guruId !== sessionGuruId) {
        return res.status(403).json({
          error: "Hanya pembuat soal atau Admin Sekolah yang dapat mengubah status visibilitas paket ini.",
        });
      }

      const updated = await prisma.ujian.update({
        where: { id: existing.id },
        data: { visibility: nextVisibility },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { soal: true, percobaan: true } },
        },
      });

      const message =
        nextVisibility === "PUBLIC"
          ? `Bank soal "${existing.judul}" berhasil dibagikan ke Bank Soal Umum.`
          : nextVisibility === "ARCHIVED"
            ? `Bank soal "${existing.judul}" telah diarsipkan dan ditarik dari Bank Soal Umum.`
            : `Bank soal "${existing.judul}" diubah menjadi Bank Soal Sekolah (Privat).`;

      return res.json({ ujian: updated, message });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Kolom visibilitas Bank Soal belum dimigrasi pada database." });
      }
      console.error("Gagal mengubah status visibilitas bank soal:", error);
      return res.status(503).json({ error: "Status visibilitas bank soal belum dapat diperbarui." });
    }
  });

  return router;
}

export function tahap2CbtRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();
  router.use("/cbt", cbtPublicBankRoutes(getSchoolSession));

  async function canTeacherAccessExam(
    session: { sekolahId: string; peran: "ADMIN" | "GURU" | "SISWA"; guruId?: string | null },
    ujian: { guruId: string; kelasId: string; mapelId: string },
  ): Promise<boolean> {
    if (session.peran !== "GURU" || !session.guruId) return true;
    if (ujian.guruId === session.guruId) return true;
    const scope = await resolveTeacherScope(session.sekolahId, session.guruId);
    if (scope.isWaliKelas) return true;
    return scope.assignedKelasIds.includes(ujian.kelasId) && scope.assignedMapelIds.includes(ujian.mapelId);
  }

  // ==========================================
  // 1. PAKET UJIAN & JADWAL CBT (REGULER+)
  // ==========================================
  router.get("/cbt/ujian", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;
      const teacherScope = peran === "GURU" && sessionGuruId ? await resolveTeacherScope(sekolahId, sessionGuruId) : null;
      const restrictToAssigned = Boolean(teacherScope && !teacherScope.isWaliKelas);

      const [ujian, kelas, mapel, guru, tahunAjaran, settings] = await Promise.all([
        prisma.ujian.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned && sessionGuruId
              ? {
                  OR: [
                    { guruId: sessionGuruId },
                    ...(teacherScope!.assignedKelasIds.length && teacherScope!.assignedMapelIds.length
                      ? [{ kelasId: { in: teacherScope!.assignedKelasIds }, mapelId: { in: teacherScope!.assignedMapelIds } }]
                      : []),
                  ],
                }
              : {}),
          },
          include: {
            kelas: { select: { id: true, nama: true } },
            mapel: { select: { id: true, nama: true } },
            guru: { select: { id: true, nama: true } },
            _count: { select: { soal: true, percobaan: true } },
          },
          orderBy: [{ mulai: "desc" }, { id: "desc" }],
          take: 200,
        }),
        prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedKelasIds } } : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 500,
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
        prisma.guru.findMany({
          where: {
            sekolahId,
            status: "Aktif",
            ...(peran === "GURU" && sessionGuruId ? { id: sessionGuruId } : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.tahunAjaran.findMany({ where: { sekolahId }, select: { id: true, nama: true, semester: true }, orderBy: { mulai: "desc" }, take: 100 }),
        prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null),
      ]);

      return res.json({
        ujian,
        kelas,
        mapel,
        guru,
        tahunAjaran,
        pengaturan: settings ?? {
          sekolahId,
          acakUrutanSoal: true,
          acakOpsiJawaban: true,
          tampilkanNilaiLangsung: true,
          batasToleransiKeluarTab: 3,
          kkmDefault: 75,
          wajibToken: true,
        },
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Skema CBT belum dimigrasi pada database." });
      }
      console.error("Gagal memuat ujian CBT:", error);
      return res.status(503).json({ error: "Data ujian CBT belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const judul = cleanText(req.body?.judul, 180);
      const kelasId = cleanText(req.body?.kelasId, 100);
      const mapelId = cleanText(req.body?.mapelId, 100);
      let guruId = peran === "GURU" && sessionGuruId ? sessionGuruId : cleanText(req.body?.guruId, 100);
      let tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const durasiMenit = cleanInt(req.body?.durasiMenit, 5, 360, 60);
      const kkm = Math.max(0, Math.min(100, Number(req.body?.kkm ?? 75)));
      const mulaiRaw = cleanText(req.body?.mulai, 40);
      const selesaiRaw = cleanText(req.body?.selesai, 40);
      const dipublikasikan = Boolean(req.body?.dipublikasikan);
      const visibility = normalizeBankVisibility(req.body?.visibility, "PRIVATE");

      if (!judul || !kelasId || !mapelId) {
        return res.status(400).json({ error: "Judul ujian, kelas target, dan mata pelajaran wajib diisi." });
      }

      if (peran === "GURU" && sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas && (!scope.assignedKelasIds.includes(kelasId) || !scope.assignedMapelIds.includes(mapelId))) {
          return res.status(403).json({ error: "Anda hanya dapat membuat ujian untuk kelas dan mata pelajaran yang Anda ampu." });
        }
      }

      if (!guruId) {
        const firstGuru = await prisma.guru.findFirst({ where: { sekolahId, status: "Aktif" }, select: { id: true } });
        if (!firstGuru) return res.status(400).json({ error: "Tambahkan minimal satu guru aktif terlebih dahulu." });
        guruId = firstGuru.id;
      }

      if (!tahunAjaranId) {
        const firstYear = await prisma.tahunAjaran.findFirst({ where: { sekolahId }, orderBy: { mulai: "desc" }, select: { id: true } });
        if (firstYear) {
          tahunAjaranId = firstYear.id;
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
        return res.status(400).json({ error: "Referensi kelas, mapel, guru, atau tahun ajaran tidak ditemukan." });
      }

      const now = new Date();
      const mulai = mulaiRaw ? new Date(mulaiRaw) : now;
      const selesai = selesaiRaw ? new Date(selesaiRaw) : new Date(mulai.getTime() + 2 * 60 * 60 * 1000);
      if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime()) || selesai <= mulai) {
        return res.status(400).json({ error: "Rentang waktu mulai & selesai ujian tidak valid." });
      }

      const settings = await prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null);
      const tokenKode = generateExamToken();
      const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
      const kategori = req.body?.kategori ? normalizeCbtCategory(req.body.kategori, "UTS") : null;
      const prefix = kategori ? cbtCategoryPrefix(kategori) : "CBT";
      const kode = cleanText(req.body?.kode, 40).toUpperCase() || `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;

      const created = await prisma.ujian.create({
        data: {
          sekolahId,
          tahunAjaranId,
          kelasId,
          mapelId,
          guruId,
          kode,
          judul,
          durasiMenit,
          mulai,
          selesai,
          kkm: Number.isFinite(kkm) ? kkm : (settings?.kkmDefault ?? 75),
          tokenKode,
          tokenHash,
          acakSoal: settings?.acakUrutanSoal ?? true,
          acakOpsi: settings?.acakOpsiJawaban ?? true,
          tampilNilai: settings?.tampilkanNilaiLangsung ?? true,
          toleransiKeluarTab: settings?.batasToleransiKeluarTab ?? 3,
          dipublikasikan,
          visibility,
        },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { soal: true, percobaan: true } },
        },
      });
      return res.status(201).json({ ujian: created, message: "Paket ujian CBT dibuat." });
    } catch (error) {
      console.error("Gagal membuat paket ujian CBT:", error);
      return res.status(503).json({ error: "Paket ujian CBT belum dapat disimpan." });
    }
  });

  router.patch("/cbt/ujian/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const existing = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (peran === "GURU" && sessionGuruId && existing.guruId !== sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengubah ujian ini." });
      }

      const data: Record<string, unknown> = {};
      if (typeof req.body?.judul === "string" && req.body.judul.trim()) data.judul = req.body.judul.trim().slice(0, 180);
      if (req.body?.durasiMenit !== undefined) data.durasiMenit = cleanInt(req.body.durasiMenit, 5, 360, existing.durasiMenit);
      if (req.body?.kkm !== undefined && Number.isFinite(Number(req.body.kkm))) data.kkm = Math.max(0, Math.min(100, Number(req.body.kkm)));
      if (typeof req.body?.kelasId === "string" && req.body.kelasId.trim()) {
        const kelas = await prisma.kelas.findFirst({ where: { id: req.body.kelasId, sekolahId }, select: { id: true } });
        if (!kelas) return res.status(400).json({ error: "Kelas target tidak ditemukan." });
        data.kelasId = kelas.id;
      }
      if (typeof req.body?.mulai === "string") {
        const mulai = new Date(req.body.mulai);
        if (!Number.isNaN(mulai.getTime())) data.mulai = mulai;
      }
      if (typeof req.body?.selesai === "string") {
        const selesai = new Date(req.body.selesai);
        if (!Number.isNaN(selesai.getTime())) data.selesai = selesai;
      }
      if (typeof req.body?.dipublikasikan === "boolean") data.dipublikasikan = req.body.dipublikasikan;
      if (req.body?.visibility !== undefined) {
        const parsedVis = parseBankVisibilityStrict(req.body.visibility);
        if (!parsedVis) {
          return res.status(400).json({ error: "Status visibilitas harus PRIVATE, PUBLIC, atau ARCHIVED." });
        }
        data.visibility = parsedVis;
      }

      const updated = await prisma.ujian.update({
        where: { id: existing.id },
        data,
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { soal: true, percobaan: true } },
        },
      });
      return res.json({ ujian: updated, message: "Jadwal & detail ujian diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui ujian CBT:", error);
      return res.status(503).json({ error: "Ujian CBT belum dapat diperbarui." });
    }
  });

  router.post("/cbt/ujian/:id/token", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const target = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true } });
      if (!target) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (peran === "GURU" && sessionGuruId && target.guruId !== sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengganti token ujian ini." });
      }

      const tokenKode = generateExamToken();
      const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
      const updated = await prisma.ujian.updateMany({
        where: { id: req.params.id, sekolahId },
        data: { tokenKode, tokenHash },
      });
      if (!updated.count) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      return res.json({ tokenKode, message: "Token sesi ujian baru berhasil digenerasi." });
    } catch (error) {
      console.error("Gagal mengganti token CBT:", error);
      return res.status(503).json({ error: "Token ujian belum dapat diperbarui." });
    }
  });

  router.delete("/cbt/ujian/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran === "GURU" && auth.session.guruId) {
        const target = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId: auth.session.sekolahId }, select: { guruId: true } });
        if (!target) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
        if (target.guruId !== auth.session.guruId) {
          const scope = await resolveTeacherScope(auth.session.sekolahId, auth.session.guruId);
          if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda hanya dapat menghapus ujian yang Anda buat." });
        }
      }
      const deleted = await prisma.ujian.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      return res.json({ message: "Paket ujian CBT dihapus." });
    } catch (error) {
      console.error("Gagal menghapus ujian CBT:", error);
      return res.status(503).json({ error: "Paket ujian CBT belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2. BANK SOAL (PG A-E & ESAI)
  // ==========================================
  router.get("/cbt/ujian/:id/soal", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        select: { id: true, judul: true, kode: true, guruId: true, kelasId: true, mapelId: true },
      });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses ke bank soal ujian ini." });
      }

      const soal = await prisma.soalUjian.findMany({
        where: { ujianId: ujian.id },
        include: { opsi: { orderBy: { kode: "asc" } } },
        orderBy: { urutan: "asc" },
      });
      return res.json({ ujian, soal });
    } catch (error) {
      console.error("Gagal memuat bank soal:", error);
      return res.status(503).json({ error: "Daftar soal belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian/:id/soal", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk menambah soal pada ujian ini." });
      }

      const tipe = req.body?.tipe === "ESAI" ? "ESAI" : "PG";
      const teks = cleanText(req.body?.teks, 2000);
      const bobot = cleanInt(req.body?.bobot, 1, 100, 10);
      const kunciEsai = cleanText(req.body?.kunciEsai, 1000) || null;
      const pembahasan = cleanText(req.body?.pembahasan, 1000) || null;

      if (!teks) return res.status(400).json({ error: "Teks pertanyaan wajib diisi." });

      const rawOpsi = Array.isArray(req.body?.opsi) ? req.body.opsi : [];
      const opsiList: Array<{ kode: string; teks: string; benar: boolean }> = [];
      if (tipe === "PG") {
        const codes = ["A", "B", "C", "D", "E"];
        for (let i = 0; i < codes.length; i++) {
          const entry = rawOpsi.find((o: unknown) => typeof o === "object" && o !== null && (o as Record<string, unknown>).kode === codes[i]) as Record<string, unknown> | undefined;
          const optText = entry ? cleanText(entry.teks, 500) : "";
          if (optText) {
            opsiList.push({ kode: codes[i], teks: optText, benar: Boolean(entry?.benar) });
          }
        }
        if (opsiList.length < 2 || !opsiList.some((o) => o.benar)) {
          return res.status(400).json({ error: "Soal pilihan ganda minimal 2 opsi jawaban dan 1 kunci benar." });
        }
      }

      const lastSoal = await prisma.soalUjian.findFirst({
        where: { ujianId: ujian.id },
        orderBy: { urutan: "desc" },
        select: { urutan: true },
      });
      const nextUrutan = (lastSoal?.urutan ?? 0) + 1;

      const created = await prisma.soalUjian.create({
        data: {
          ujianId: ujian.id,
          urutan: nextUrutan,
          tipe,
          teks,
          bobot,
          kunciEsai,
          pembahasan,
          ...(opsiList.length ? { opsi: { create: opsiList } } : {}),
        },
        include: { opsi: { orderBy: { kode: "asc" } } },
      });

      return res.status(201).json({ soal: created, message: "Butir soal ditambahkan." });
    } catch (error) {
      console.error("Gagal menambah soal CBT:", error);
      return res.status(503).json({ error: "Butir soal belum dapat disimpan." });
    }
  });

  router.delete("/cbt/ujian/:id/soal/:soalId", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk menghapus soal pada ujian ini." });
      }

      const deleted = await prisma.soalUjian.deleteMany({
        where: { id: req.params.soalId, ujianId: ujian.id },
      });
      if (!deleted.count) return res.status(404).json({ error: "Soal tidak ditemukan." });
      return res.json({ message: "Butir soal dihapus." });
    } catch (error) {
      console.error("Gagal menghapus soal CBT:", error);
      return res.status(503).json({ error: "Butir soal belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2B. IMPOR MASSAL SOAL CBT (UTS / AS / UJIAN AKHIR / TUGAS)
  // ==========================================
  async function resolveOrCreateSchoolYear(sekolahId: string, requestedId?: string): Promise<string | null> {
    if (requestedId) {
      const found = await prisma.tahunAjaran.findFirst({ where: { id: requestedId, sekolahId }, select: { id: true } });
      if (found) return found.id;
    }
    const now = new Date();
    const active = await prisma.tahunAjaran.findFirst({
      where: { sekolahId, mulai: { lte: now }, selesai: { gte: now } },
      select: { id: true },
    });
    if (active) return active.id;
    const latest = await prisma.tahunAjaran.findFirst({ where: { sekolahId }, orderBy: { mulai: "desc" }, select: { id: true } });
    if (latest) return latest.id;
    const yearNow = now.getUTCFullYear();
    const createdYear = await prisma.tahunAjaran.create({
      data: {
        sekolahId,
        nama: `${yearNow}/${yearNow + 1}`,
        semester: "Ganjil",
        mulai: new Date(`${yearNow}-01-01T00:00:00.000Z`),
        selesai: new Date(`${yearNow}-12-31T23:59:59.000Z`),
      },
      select: { id: true },
    });
    return createdYear.id;
  }

  router.post("/cbt/ujian/:id/soal/import", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        select: { id: true, judul: true, guruId: true, kelasId: true, mapelId: true },
      });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengimpor soal pada ujian ini." });
      }

      const parsed = parseBulkQuestions(req.body?.soal);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      if (parsed.valid.length === 0) {
        return res.status(400).json({
          error: "Tidak ada butir soal valid yang dapat diimpor.",
          skipped: parsed.skipped,
        });
      }

      const mode = req.body?.mode === "replace" ? "replace" : "append";

      const totalSoal = await prisma.$transaction(async (tx) => {
        let startUrutan = 1;
        if (mode === "replace") {
          await tx.soalUjian.deleteMany({ where: { ujianId: ujian.id } });
        } else {
          const last = await tx.soalUjian.findFirst({
            where: { ujianId: ujian.id },
            orderBy: { urutan: "desc" },
            select: { urutan: true },
          });
          startUrutan = (last?.urutan ?? 0) + 1;
        }

        for (let i = 0; i < parsed.valid.length; i++) {
          const item = parsed.valid[i];
          await tx.soalUjian.create({
            data: {
              ujianId: ujian.id,
              urutan: startUrutan + i,
              tipe: item.tipe,
              teks: item.teks,
              bobot: item.bobot,
              kunciEsai: item.kunciEsai,
              pembahasan: item.pembahasan,
              ...(item.opsi.length ? { opsi: { create: item.opsi } } : {}),
            },
          });
        }

        return tx.soalUjian.count({ where: { ujianId: ujian.id } });
      });

      return res.status(201).json({
        importedCount: parsed.valid.length,
        skippedCount: parsed.skipped.length,
        skipped: parsed.skipped,
        totalSoal,
        message: `${parsed.valid.length} butir soal berhasil diimpor ke "${ujian.judul}".`,
      });
    } catch (error) {
      console.error("Gagal mengimpor soal CBT:", error);
      return res.status(503).json({ error: "Soal CBT belum dapat diimpor." });
    }
  });

  router.post("/cbt/ujian/import", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const kategori = normalizeCbtCategory(req.body?.kategori, "UTS");
      const judul = cleanText(req.body?.judul, 180);
      const mapelId = cleanText(req.body?.mapelId, 100);
      let guruId = peran === "GURU" && sessionGuruId ? sessionGuruId : cleanText(req.body?.guruId, 100);
      const durasiMenit = cleanInt(req.body?.durasiMenit, 5, 360, 60);
      const kkm = Math.max(0, Math.min(100, Number(req.body?.kkm ?? 75)));
      const mulaiRaw = cleanText(req.body?.mulai, 40);
      const selesaiRaw = cleanText(req.body?.selesai, 40);
      const dipublikasikan = Boolean(req.body?.dipublikasikan);
      const visibility = normalizeBankVisibility(req.body?.visibility, "PRIVATE");

      const rawKelasIds: unknown[] = Array.isArray(req.body?.kelasIds)
        ? req.body.kelasIds
        : req.body?.kelasId
          ? [req.body.kelasId]
          : [];
      const kelasIds = Array.from(
        new Set(
          rawKelasIds
            .map((id) => cleanText(id, 100))
            .filter(Boolean),
        ),
      );

      if (!judul || !mapelId || kelasIds.length === 0) {
        return res.status(400).json({ error: "Judul paket, mata pelajaran, dan minimal satu kelas target wajib diisi." });
      }
      if (kelasIds.length > 30) {
        return res.status(400).json({ error: "Maksimal 30 kelas target per sekali impor paket." });
      }

      const parsed = parseBulkQuestions(req.body?.soal);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      if (parsed.valid.length === 0) {
        return res.status(400).json({
          error: "Tidak ada butir soal valid yang dapat diimpor.",
          skipped: parsed.skipped,
        });
      }

      if (!guruId) {
        const firstGuru = await prisma.guru.findFirst({ where: { sekolahId, status: "Aktif" }, select: { id: true } });
        if (!firstGuru) return res.status(400).json({ error: "Tambahkan minimal satu guru aktif terlebih dahulu." });
        guruId = firstGuru.id;
      }

      const tahunAjaranId = await resolveOrCreateSchoolYear(sekolahId, cleanText(req.body?.tahunAjaranId, 100) || undefined);
      if (!tahunAjaranId) return res.status(400).json({ error: "Tahun ajaran tidak ditemukan." });

      const [kelasRows, mapel, guru, settings] = await Promise.all([
        prisma.kelas.findMany({ where: { id: { in: kelasIds }, sekolahId }, select: { id: true, nama: true } }),
        prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true, nama: true } }),
        prisma.guru.findFirst({ where: { id: guruId, sekolahId }, select: { id: true } }),
        prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null),
      ]);

      if (kelasRows.length !== kelasIds.length || !mapel || !guru) {
        return res.status(400).json({ error: "Referensi kelas, mata pelajaran, atau guru tidak valid untuk sekolah ini." });
      }

      if (peran === "GURU" && sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas && (!scope.assignedMapelIds.includes(mapelId) || kelasIds.some((id) => !scope.assignedKelasIds.includes(id)))) {
          return res.status(403).json({ error: "Anda tidak memiliki akses pada kelas atau mata pelajaran yang dipilih." });
        }
      }

      const now = new Date();
      const mulai = mulaiRaw ? new Date(mulaiRaw) : now;
      const selesai = selesaiRaw ? new Date(selesaiRaw) : new Date(mulai.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime()) || selesai <= mulai) {
        return res.status(400).json({ error: "Rentang waktu mulai & selesai ujian tidak valid." });
      }

      const prefix = cbtCategoryPrefix(kategori);
      const createdList = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const kelas of kelasRows) {
          const tokenKode = generateExamToken();
          const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
          const kode = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
          const created = await tx.ujian.create({
            data: {
              sekolahId,
              tahunAjaranId,
              kelasId: kelas.id,
              mapelId: mapel.id,
              guruId,
              kode,
              judul,
              durasiMenit,
              mulai,
              selesai,
              kkm: Number.isFinite(kkm) ? kkm : (settings?.kkmDefault ?? 75),
              tokenKode,
              tokenHash,
              acakSoal: settings?.acakUrutanSoal ?? true,
              acakOpsi: settings?.acakOpsiJawaban ?? true,
              tampilNilai: settings?.tampilkanNilaiLangsung ?? true,
              toleransiKeluarTab: settings?.batasToleransiKeluarTab ?? 3,
              dipublikasikan,
              visibility,
              soal: {
                create: parsed.valid.map((item, idx) => ({
                  urutan: idx + 1,
                  tipe: item.tipe,
                  teks: item.teks,
                  bobot: item.bobot,
                  kunciEsai: item.kunciEsai,
                  pembahasan: item.pembahasan,
                  ...(item.opsi.length ? { opsi: { create: item.opsi } } : {}),
                })),
              },
            },
            include: {
              kelas: { select: { id: true, nama: true } },
              mapel: { select: { id: true, nama: true } },
              guru: { select: { id: true, nama: true } },
              _count: { select: { soal: true, percobaan: true } },
            },
          });
          results.push(created);
        }
        return results;
      });

      return res.status(201).json({
        createdCount: createdList.length,
        importedQuestions: parsed.valid.length,
        skippedCount: parsed.skipped.length,
        skipped: parsed.skipped,
        ujian: createdList,
        message: `${createdList.length} paket ${prefix} (${parsed.valid.length} soal) berhasil dibuat & diimpor.`,
      });
    } catch (error) {
      console.error("Gagal mengimpor paket ujian CBT:", error);
      return res.status(503).json({ error: "Paket ujian & soal CBT belum dapat diimpor." });
    }
  });

  // ==========================================
  // 2C. IMPOR & DAFTAR TUGAS (UTS / AS / UJIAN AKHIR / TUGAS CBT)
  // ==========================================
  router.get("/cbt/tugas", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const rows = await prisma.tugas.findMany({
        where: { sekolahId },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { pengumpulan: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      });

      return res.json({ tugas: rows });
    } catch (error) {
      console.error("Gagal memuat daftar tugas CBT:", error);
      return res.status(503).json({ error: "Daftar tugas belum dapat dimuat." });
    }
  });

  router.post("/cbt/tugas/import", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const defaultKategori = normalizeCbtCategory(req.body?.kategori, "UTS");
      const defaultMapelId = cleanText(req.body?.defaultMapelId, 100);
      let guruId = peran === "GURU" && sessionGuruId ? sessionGuruId : cleanText(req.body?.guruId, 100);
      const rawDefaultKelasIds: unknown[] = Array.isArray(req.body?.defaultKelasIds)
        ? req.body.defaultKelasIds
        : req.body?.defaultKelasId
          ? [req.body.defaultKelasId]
          : [];
      const defaultKelasIds = Array.from(
        new Set(rawDefaultKelasIds.map((id) => cleanText(id, 100)).filter(Boolean)),
      ).slice(0, 30);

      const parsed = parseBulkTasks(req.body?.tugas, defaultKategori);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      if (parsed.valid.length === 0) {
        return res.status(400).json({
          error: "Tidak ada tugas valid yang dapat diimpor.",
          skipped: parsed.skipped,
        });
      }

      if (!guruId) {
        const firstGuru = await prisma.guru.findFirst({ where: { sekolahId, status: "Aktif" }, select: { id: true } });
        if (!firstGuru) return res.status(400).json({ error: "Tambahkan minimal satu guru aktif terlebih dahulu." });
        guruId = firstGuru.id;
      }

      const tahunAjaranId = await resolveOrCreateSchoolYear(sekolahId, cleanText(req.body?.tahunAjaranId, 100) || undefined);
      if (!tahunAjaranId) return res.status(400).json({ error: "Tahun ajaran tidak ditemukan." });

      const [allKelas, allMapel, guru] = await Promise.all([
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true, kode: true } }),
        prisma.mapel.findMany({ where: { sekolahId }, select: { id: true, nama: true, kode: true } }),
        prisma.guru.findFirst({ where: { id: guruId, sekolahId }, select: { id: true } }),
      ]);
      if (!guru) return res.status(400).json({ error: "Guru pembuat tugas tidak ditemukan." });

      const kelasById = new Map(allKelas.map((k) => [k.id, k]));
      const kelasByKey = new Map<string, string>();
      for (const k of allKelas) {
        kelasByKey.set(normalizeLookupKey(k.nama), k.id);
        kelasByKey.set(normalizeLookupKey(k.kode), k.id);
      }
      const mapelById = new Map(allMapel.map((m) => [m.id, m]));
      const mapelByKey = new Map<string, string>();
      for (const m of allMapel) {
        mapelByKey.set(normalizeLookupKey(m.nama), m.id);
        mapelByKey.set(normalizeLookupKey(m.kode), m.id);
      }

      const validDefaultKelasIds = defaultKelasIds.filter((id) => kelasById.has(id));
      const validDefaultMapelId = defaultMapelId && mapelById.has(defaultMapelId) ? defaultMapelId : "";

      const rowsToCreate: Array<{
        kelasId: string;
        mapelId: string;
        judul: string;
        instruksi: string;
        batasWaktu: Date | null;
      }> = [];
      const skipped = [...parsed.skipped];

      for (let i = 0; i < parsed.valid.length; i++) {
        const task = parsed.valid[i];
        const rowNum = i + 1;

        let targetMapelId = "";
        if (task.mapelNama) {
          const key = normalizeLookupKey(task.mapelNama);
          targetMapelId = mapelByKey.get(key) ?? "";
          if (!targetMapelId) {
            const partial = allMapel.find((m) => normalizeLookupKey(m.nama).includes(key) || key.includes(normalizeLookupKey(m.nama)));
            if (partial) targetMapelId = partial.id;
          }
        }
        if (!targetMapelId) targetMapelId = validDefaultMapelId;
        if (!targetMapelId) {
          skipped.push({ row: rowNum, reason: `Mata pelajaran "${task.mapelNama || "-"}" tidak ditemukan; pilih mapel default.` });
          continue;
        }

        let targetKelasIds: string[] = [];
        if (task.kelasNama) {
          const tokens = task.kelasNama.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
          for (const token of tokens) {
            const key = normalizeLookupKey(token);
            let matchedId = kelasByKey.get(key) ?? "";
            if (!matchedId) {
              const partial = allKelas.find((k) => normalizeLookupKey(k.nama).includes(key) || key.includes(normalizeLookupKey(k.nama)));
              if (partial) matchedId = partial.id;
            }
            if (matchedId) targetKelasIds.push(matchedId);
          }
          targetKelasIds = Array.from(new Set(targetKelasIds));
        }
        if (targetKelasIds.length === 0) targetKelasIds = validDefaultKelasIds;
        if (targetKelasIds.length === 0) {
          skipped.push({ row: rowNum, reason: `Kelas "${task.kelasNama || "-"}" tidak ditemukan; pilih minimal satu kelas target.` });
          continue;
        }

        const tag = cbtCategoryTag(task.kategori);
        const alreadyTagged = /^\[(UTS|AS|UAS|PAS|UJIAN AKHIR|UPK|TUGAS|TUGAS CBT)\]/i.test(task.judul);
        const finalJudul = (alreadyTagged ? task.judul : `${tag} ${task.judul}`).slice(0, 200);
        const finalInstruksi = task.tautan
          ? `${task.instruksi}\n\nTautan referensi: ${task.tautan}`.slice(0, 5000)
          : task.instruksi;

        for (const kelasId of targetKelasIds) {
          rowsToCreate.push({
            kelasId,
            mapelId: targetMapelId,
            judul: finalJudul,
            instruksi: finalInstruksi,
            batasWaktu: task.batasWaktu,
          });
        }
      }

      if (rowsToCreate.length === 0) {
        return res.status(400).json({
          error: "Tidak ada tugas yang dapat disimpan karena kelas atau mata pelajaran belum sesuai.",
          skipped,
        });
      }

      const createdTasks = await prisma.$transaction(async (tx) => {
        const created = [];
        for (const entry of rowsToCreate) {
          const saved = await tx.tugas.create({
            data: {
              sekolahId,
              tahunAjaranId,
              kelasId: entry.kelasId,
              mapelId: entry.mapelId,
              guruId,
              judul: entry.judul,
              instruksi: entry.instruksi,
              batasWaktu: entry.batasWaktu,
            },
            include: {
              kelas: { select: { id: true, nama: true } },
              mapel: { select: { id: true, nama: true } },
              guru: { select: { id: true, nama: true } },
              _count: { select: { pengumpulan: true } },
            },
          });
          created.push(saved);
        }
        return created;
      });

      return res.status(201).json({
        createdCount: createdTasks.length,
        skippedCount: skipped.length,
        skipped,
        tugas: createdTasks,
        message: `${createdTasks.length} tugas berhasil diimpor dan dibagikan ke ruang kelas.`,
      });
    } catch (error) {
      console.error("Gagal mengimpor tugas CBT:", error);
      return res.status(503).json({ error: "Daftar tugas belum dapat diimpor." });
    }
  });

  router.delete("/cbt/tugas/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId } = auth.session;

      const target = await prisma.tugas.findFirst({
        where: { id: req.params.id, sekolahId },
        select: { id: true, guruId: true },
      });
      if (!target) return res.status(404).json({ error: "Tugas tidak ditemukan." });
      if (peran === "GURU" && guruId && target.guruId !== guruId) {
        return res.status(403).json({ error: "Anda hanya dapat menghapus tugas yang Anda buat." });
      }

      await prisma.$transaction(async (tx) => {
        await tx.pengumpulanTugas.deleteMany({ where: { tugasId: target.id } });
        await tx.tugas.delete({ where: { id: target.id } });
      });
      return res.json({ message: "Tugas berhasil dihapus." });
    } catch (error) {
      console.error("Gagal menghapus tugas CBT:", error);
      return res.status(503).json({ error: "Tugas belum dapat dihapus." });
    }
  });

  // ==========================================
  // 3. MONITORING UJIAN LIVE & PENGATURAN CBT
  // ==========================================
  router.get("/cbt/ujian/:id/monitoring", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          _count: { select: { soal: true } },
        },
      });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk memantau ujian ini." });
      }

      const [students, attempts] = await Promise.all([
        prisma.siswa.findMany({
          where: { sekolahId, kelasId: ujian.kelasId, status: "Aktif" },
          select: { id: true, nama: true, nisn: true },
          orderBy: { nama: "asc" },
        }),
        prisma.percobaanUjian.findMany({
          where: { ujianId: ujian.id },
          include: { _count: { select: { jawaban: true } } },
        }),
      ]);

      const attemptMap = new Map(attempts.map((a) => [a.siswaId, a]));
      const peserta = students.map((student) => {
        const attempt = attemptMap.get(student.id);
        const status = attempt
          ? attempt.dikumpulkanPada
            ? "SELESAI"
            : attempt.status || "SEDANG_MENGERJAKAN"
          : "BELUM_MULAI";
        return {
          siswaId: student.id,
          nama: student.nama,
          nisn: student.nisn,
          percobaanId: attempt?.id ?? null,
          status,
          dimulaiPada: attempt?.dimulaiPada ?? null,
          dikumpulkanPada: attempt?.dikumpulkanPada ?? null,
          terjawab: attempt?._count.jawaban ?? 0,
          totalSoal: ujian._count.soal,
          nilai: attempt?.nilai ?? null,
          tabViolations: attempt?.tabViolations ?? 0,
        };
      });

      return res.json({ ujian, peserta });
    } catch (error) {
      console.error("Gagal memuat monitoring CBT:", error);
      return res.status(503).json({ error: "Data monitoring ujian belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian/:id/reset-peserta", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      if (!siswaId) return res.status(400).json({ error: "ID peserta wajib diisi." });

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk mereset peserta pada ujian ini." });
      }

      await prisma.percobaanUjian.deleteMany({
        where: { ujianId: ujian.id, siswaId },
      });
      return res.json({ message: "Sesi ujian peserta direset; peserta dapat memulai ulang." });
    } catch (error) {
      console.error("Gagal mereset sesi peserta CBT:", error);
      return res.status(503).json({ error: "Sesi peserta belum dapat direset." });
    }
  });

  router.get("/cbt/pengaturan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const settings = await prisma.cbtPengaturan.findUnique({ where: { sekolahId } });
      return res.json({
        pengaturan: settings ?? {
          sekolahId,
          acakUrutanSoal: true,
          acakOpsiJawaban: true,
          tampilkanNilaiLangsung: true,
          batasToleransiKeluarTab: 3,
          kkmDefault: 75,
          wajibToken: true,
        },
      });
    } catch (error) {
      console.error("Gagal memuat pengaturan CBT:", error);
      return res.status(503).json({ error: "Pengaturan CBT belum dapat dimuat." });
    }
  });

  router.patch("/cbt/pengaturan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran !== "ADMIN") {
        return res.status(403).json({ error: "Pengaturan kebijakan CBT hanya dapat diubah oleh Admin Sekolah." });
      }
      const { sekolahId } = auth.session;

      const payload = {
        acakUrutanSoal: typeof req.body?.acakUrutanSoal === "boolean" ? req.body.acakUrutanSoal : true,
        acakOpsiJawaban: typeof req.body?.acakOpsiJawaban === "boolean" ? req.body.acakOpsiJawaban : true,
        tampilkanNilaiLangsung: typeof req.body?.tampilkanNilaiLangsung === "boolean" ? req.body.tampilkanNilaiLangsung : true,
        batasToleransiKeluarTab: cleanInt(req.body?.batasToleransiKeluarTab, 0, 20, 3),
        kkmDefault: Math.max(0, Math.min(100, Number(req.body?.kkmDefault ?? 75))),
        wajibToken: typeof req.body?.wajibToken === "boolean" ? req.body.wajibToken : true,
      };

      const saved = await prisma.cbtPengaturan.upsert({
        where: { sekolahId },
        create: { sekolahId, ...payload },
        update: payload,
      });
      return res.json({ pengaturan: saved, message: "Pengaturan aturan CBT disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan pengaturan CBT:", error);
      return res.status(503).json({ error: "Pengaturan CBT belum dapat disimpan." });
    }
  });

  return router;
}
