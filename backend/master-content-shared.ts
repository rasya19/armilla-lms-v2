import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { cleanInt, cleanText, isSafeHttpUrl } from "./school-modules-shared.js";
import { normalizeLookupKey } from "./cbt-import.js";

export type MasterJenjang = "PAKET_A" | "PAKET_B" | "PAKET_C";
export type MasterKategori = "MATERI" | "UTS" | "UAS" | "UJIAN_AKHIR";

export type ParsedMasterModul = {
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: MasterKategori;
  judul: string;
  deskripsi: string | null;
  konten: string | null;
  fileUrl: string | null;
  jenis: string;
  aktif: boolean;
};

export type ParsedMasterButir = {
  urutan: number;
  tipe: "PG" | "ESAI";
  teks: string;
  bobot: number;
  opsiA: string | null;
  opsiB: string | null;
  opsiC: string | null;
  opsiD: string | null;
  opsiE: string | null;
  kunciJawaban: string;
  pembahasan: string | null;
};

export type ParsedMasterBankSoal = {
  jenjang: MasterJenjang;
  tingkatKelas: string;
  mataPelajaran: string;
  kategoriUjian: Exclude<MasterKategori, "MATERI">;
  judul: string;
  deskripsi: string | null;
  durasiMenit: number;
  kkm: number;
  aktif: boolean;
};

const VALID_MODUL_JENIS = new Set(["MODUL", "VIDEO", "TAUTAN", "RINGKASAN", "PDF", "TUGAS"]);

export function normalizeMasterJenjang(value: unknown, fallback: MasterJenjang = "PAKET_C"): MasterJenjang | null {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (cleaned === "PAKET_A" || cleaned === "A" || cleaned === "SD" || cleaned.includes("PAKET_A")) return "PAKET_A";
  if (cleaned === "PAKET_B" || cleaned === "B" || cleaned === "SMP" || cleaned.includes("PAKET_B")) return "PAKET_B";
  if (cleaned === "PAKET_C" || cleaned === "C" || cleaned === "SMA" || cleaned.includes("PAKET_C")) return "PAKET_C";
  return null;
}

export function normalizeMasterKategori(
  value: unknown,
  fallback: MasterKategori = "UTS",
): MasterKategori | null {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (cleaned === "MATERI" || cleaned === "MODUL" || cleaned === "MODUL_AJAR") return "MATERI";
  if (cleaned === "UTS" || cleaned === "PTS" || cleaned.includes("TENGAH_SEMESTER")) return "UTS";
  if (cleaned === "UAS" || cleaned === "PAS" || cleaned === "AS" || cleaned.includes("AKHIR_SEMESTER")) return "UAS";
  if (
    cleaned === "UJIAN_AKHIR" ||
    cleaned === "UPK" ||
    cleaned === "UAK" ||
    cleaned === "US" ||
    cleaned.includes("KELAS_AKHIR") ||
    cleaned.includes("PENDIDIKAN_KESETARAAN")
  ) {
    return "UJIAN_AKHIR";
  }
  return null;
}

export function normalizeTingkatKelas(value: unknown, jenjang: MasterJenjang): string {
  const raw = cleanText(value, 40);
  if (!raw) {
    if (jenjang === "PAKET_A") return "Kelas 6";
    if (jenjang === "PAKET_B") return "Kelas 9";
    return "Kelas 12";
  }
  const numMatch = raw.match(/(\d{1,2})/);
  if (numMatch) {
    const grade = Number(numMatch[1]);
    if (grade >= 1 && grade <= 12) {
      return `Kelas ${grade}`;
    }
  }
  return raw;
}

export function jenjangLabel(jenjang: MasterJenjang): string {
  if (jenjang === "PAKET_A") return "Paket A";
  if (jenjang === "PAKET_B") return "Paket B";
  return "Paket C";
}

export function defaultKelasNameForMaster(jenjang: MasterJenjang, tingkatKelas: string): string {
  const label = jenjangLabel(jenjang);
  const tingkat = normalizeTingkatKelas(tingkatKelas, jenjang);
  if (tingkat.toLowerCase().includes("paket")) return tingkat;
  return `${label} ${tingkat}`;
}

export function cbtPrefixForMasterKategori(kategori: string): string {
  if (kategori === "UTS") return "UTS";
  if (kategori === "UAS") return "AS";
  if (kategori === "UJIAN_AKHIR") return "UAK";
  return "CBT";
}

export function parseMasterModulInput(body: unknown): { ok: true; data: ParsedMasterModul } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Data modul tidak valid." };
  }
  const row = body as Record<string, unknown>;
  const jenjang = normalizeMasterJenjang(row.jenjang, "PAKET_C");
  if (!jenjang) {
    return { ok: false, error: "Jenjang harus Paket A, Paket B, atau Paket C." };
  }
  const kategori = normalizeMasterKategori(row.kategoriUjian ?? row.kategori_ujian ?? row.kategori, "MATERI");
  if (!kategori) {
    return { ok: false, error: "Kategori tidak valid. Gunakan MATERI, UTS, UAS, atau UJIAN_AKHIR." };
  }
  const mataPelajaran = cleanText(row.mataPelajaran ?? row.mata_pelajaran ?? row.mapel, 120);
  const judul = cleanText(row.judul, 220);
  if (!mataPelajaran || !judul) {
    return { ok: false, error: "Mata pelajaran dan judul modul wajib diisi." };
  }
  const tingkatKelas = normalizeTingkatKelas(row.tingkatKelas ?? row.tingkat_kelas ?? row.kelas, jenjang);
  const deskripsi = cleanText(row.deskripsi, 1000) || null;
  const konten = cleanText(row.konten, 20000) || null;
  const fileUrl = cleanText(row.fileUrl ?? row.file_url ?? row.tautan, 600) || null;
  if (fileUrl && !isSafeHttpUrl(fileUrl)) {
    return { ok: false, error: "URL file/tautan harus menggunakan protokol http:// atau https://." };
  }
  const rawJenis = cleanText(row.jenis, 30).toUpperCase() || (fileUrl ? "TAUTAN" : "MODUL");
  const jenis = VALID_MODUL_JENIS.has(rawJenis) ? rawJenis : "MODUL";
  const aktif = typeof row.aktif === "boolean" ? row.aktif : true;

  return {
    ok: true,
    data: {
      jenjang,
      tingkatKelas,
      mataPelajaran,
      kategoriUjian: kategori,
      judul,
      deskripsi,
      konten,
      fileUrl,
      jenis,
      aktif,
    },
  };
}

export function parseMasterBankSoalInput(
  body: unknown,
): { ok: true; data: ParsedMasterBankSoal } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Data paket bank soal tidak valid." };
  }
  const row = body as Record<string, unknown>;
  const jenjang = normalizeMasterJenjang(row.jenjang, "PAKET_C");
  if (!jenjang) {
    return { ok: false, error: "Jenjang harus Paket A, Paket B, atau Paket C." };
  }
  const parsedKat = normalizeMasterKategori(row.kategoriUjian ?? row.kategori_ujian ?? row.kategori, "UTS");
  const kategoriUjian: Exclude<MasterKategori, "MATERI"> =
    parsedKat && parsedKat !== "MATERI" ? parsedKat : "UTS";
  const mataPelajaran = cleanText(row.mataPelajaran ?? row.mata_pelajaran ?? row.mapel, 120);
  const judul = cleanText(row.judul, 220);
  if (!mataPelajaran || !judul) {
    return { ok: false, error: "Mata pelajaran dan judul paket soal wajib diisi." };
  }
  const tingkatKelas = normalizeTingkatKelas(row.tingkatKelas ?? row.tingkat_kelas ?? row.kelas, jenjang);
  const deskripsi = cleanText(row.deskripsi, 1000) || null;
  const durasiMenit = cleanInt(row.durasiMenit ?? row.durasi_menit, 10, 360, 60);
  const kkm = cleanInt(row.kkm, 0, 100, 75);
  const aktif = typeof row.aktif === "boolean" ? row.aktif : true;

  return {
    ok: true,
    data: {
      jenjang,
      tingkatKelas,
      mataPelajaran,
      kategoriUjian,
      judul,
      deskripsi,
      durasiMenit,
      kkm,
      aktif,
    },
  };
}

export function parseMasterButirList(rawItems: unknown): {
  items: ParsedMasterButir[];
  errors: string[];
} {
  if (!Array.isArray(rawItems)) {
    return { items: [], errors: ["Daftar butir soal harus berupa array."] };
  }
  const items: ParsedMasterButir[] = [];
  const errors: string[] = [];
  const limit = Math.min(rawItems.length, 250);

  for (let i = 0; i < limit; i++) {
    const raw = rawItems[i];
    const rowNo = i + 1;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`Baris soal #${rowNo}: format objek tidak valid.`);
      continue;
    }
    const r = raw as Record<string, unknown>;
    const teks = cleanText(r.teks ?? r.pertanyaan ?? r.soal, 4000);
    if (!teks) {
      errors.push(`Baris soal #${rowNo}: teks pertanyaan wajib diisi.`);
      continue;
    }
    const rawTipe = cleanText(r.tipe ?? r.jenis, 20).toUpperCase();
    const tipe: "PG" | "ESAI" = rawTipe === "ESAI" || rawTipe === "ESSAY" || rawTipe === "URAIAN" ? "ESAI" : "PG";
    const bobot = cleanInt(r.bobot, 1, 100, 10);
    const pembahasan = cleanText(r.pembahasan, 2000) || null;

    if (tipe === "ESAI") {
      const kunciJawaban = cleanText(r.kunciJawaban ?? r.kunci_jawaban ?? r.kunciEsai ?? r.kunci, 2000) || "Rubrik guru";
      items.push({
        urutan: items.length + 1,
        tipe: "ESAI",
        teks,
        bobot,
        opsiA: null,
        opsiB: null,
        opsiC: null,
        opsiD: null,
        opsiE: null,
        kunciJawaban,
        pembahasan,
      });
      continue;
    }

    const opsiA = cleanText(r.opsiA ?? r.opsi_a ?? r.a ?? r.A, 1000) || null;
    const opsiB = cleanText(r.opsiB ?? r.opsi_b ?? r.b ?? r.B, 1000) || null;
    const opsiC = cleanText(r.opsiC ?? r.opsi_c ?? r.c ?? r.C, 1000) || null;
    const opsiD = cleanText(r.opsiD ?? r.opsi_d ?? r.d ?? r.D, 1000) || null;
    const opsiE = cleanText(r.opsiE ?? r.opsi_e ?? r.e ?? r.E, 1000) || null;
    const optionsMap: Record<string, string | null> = { A: opsiA, B: opsiB, C: opsiC, D: opsiD, E: opsiE };
    const filledKeys = Object.entries(optionsMap)
      .filter(([, text]) => Boolean(text))
      .map(([k]) => k);
    if (filledKeys.length < 2) {
      errors.push(`Baris soal #${rowNo}: soal PG minimal memiliki 2 pilihan jawaban.`);
      continue;
    }
    const rawKunci = cleanText(r.kunciJawaban ?? r.kunci_jawaban ?? r.kunciPg ?? r.kunci, 10)
      .toUpperCase()
      .replace(/[^A-E]/g, "")
      .slice(0, 1);
    const kunciJawaban = rawKunci && optionsMap[rawKunci] ? rawKunci : filledKeys[0];

    items.push({
      urutan: items.length + 1,
      tipe: "PG",
      teks,
      bobot,
      opsiA,
      opsiB,
      opsiC,
      opsiD,
      opsiE,
      kunciJawaban,
      pembahasan,
    });
  }

  return { items, errors };
}

export type CloneMasterContentParams = {
  sekolahId: string;
  guruId?: string | null;
  jenjangList?: MasterJenjang[];
  mataPelajaranList?: string[];
  kategoriList?: MasterKategori[];
  modulIds?: string[];
  bankSoalIds?: string[];
  targetKelasId?: string | null;
  targetMapelId?: string | null;
  copyAll?: boolean;
};

export type CloneMasterContentResult = {
  copiedModul: number;
  skippedModul: number;
  copiedBankSoal: number;
  skippedBankSoal: number;
  copiedSoalCount: number;
  createdKelas: number;
  createdMapel: number;
};

export async function cloneMasterContentToSchool(
  prisma: PrismaClient,
  params: CloneMasterContentParams,
): Promise<CloneMasterContentResult> {
  const { sekolahId } = params;
  const result: CloneMasterContentResult = {
    copiedModul: 0,
    skippedModul: 0,
    copiedBankSoal: 0,
    skippedBankSoal: 0,
    copiedSoalCount: 0,
    createdKelas: 0,
    createdMapel: 0,
  };

  const hasExplicitIds =
    (params.modulIds && params.modulIds.length > 0) ||
    (params.bankSoalIds && params.bankSoalIds.length > 0);
  const jenjangFilter = params.jenjangList && params.jenjangList.length > 0 ? params.jenjangList : undefined;
  const kategoriSet = params.kategoriList && params.kategoriList.length > 0 ? new Set(params.kategoriList) : null;
  const mapelKeySet =
    params.mataPelajaranList && params.mataPelajaranList.length > 0
      ? new Set(params.mataPelajaranList.map((m) => normalizeLookupKey(m)).filter(Boolean))
      : null;

  const shouldQueryModul =
    params.copyAll === true ||
    (params.modulIds && params.modulIds.length > 0) ||
    (!hasExplicitIds && (!kategoriSet || kategoriSet.has("MATERI")));
  const bankCategories: Exclude<MasterKategori, "MATERI">[] = (["UTS", "UAS", "UJIAN_AKHIR"] as const).filter(
    (k) => !kategoriSet || kategoriSet.has(k),
  );
  const shouldQueryBank =
    params.copyAll === true ||
    (params.bankSoalIds && params.bankSoalIds.length > 0) ||
    (!hasExplicitIds && bankCategories.length > 0);

  const [rawModuls, rawBanks] = await Promise.all([
    shouldQueryModul
      ? prisma.masterModul.findMany({
          where: {
            aktif: true,
            ...(params.modulIds && params.modulIds.length > 0
              ? { id: { in: params.modulIds.slice(0, 200) } }
              : {
                  ...(jenjangFilter ? { jenjang: { in: jenjangFilter } } : {}),
                }),
          },
          orderBy: [{ jenjang: "asc" }, { tingkatKelas: "asc" }, { createdAt: "asc" }],
          take: 250,
        })
      : Promise.resolve([]),
    shouldQueryBank
      ? prisma.masterBankSoal.findMany({
          where: {
            aktif: true,
            ...(params.bankSoalIds && params.bankSoalIds.length > 0
              ? { id: { in: params.bankSoalIds.slice(0, 150) } }
              : {
                  ...(jenjangFilter ? { jenjang: { in: jenjangFilter } } : {}),
                  ...(bankCategories.length > 0 ? { kategoriUjian: { in: bankCategories } } : {}),
                }),
          },
          include: {
            butirSoal: { orderBy: { urutan: "asc" } },
          },
          orderBy: [{ jenjang: "asc" }, { tingkatKelas: "asc" }, { createdAt: "asc" }],
          take: 150,
        })
      : Promise.resolve([]),
  ]);

  const moduls = mapelKeySet && !(params.modulIds && params.modulIds.length > 0)
    ? rawModuls.filter((m) => mapelKeySet.has(normalizeLookupKey(m.mataPelajaran)))
    : rawModuls;
  const banks = mapelKeySet && !(params.bankSoalIds && params.bankSoalIds.length > 0)
    ? rawBanks.filter((b) => mapelKeySet.has(normalizeLookupKey(b.mataPelajaran)))
    : rawBanks;

  if (moduls.length === 0 && banks.length === 0) {
    return result;
  }

  // Ensure TahunAjaran
  let tahunAjaran = await prisma.tahunAjaran.findFirst({
    where: { sekolahId },
    orderBy: { mulai: "desc" },
    select: { id: true },
  });
  if (!tahunAjaran) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const isGanjil = month >= 7;
    const namaTa = isGanjil ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    const semester = isGanjil ? "Ganjil" : "Genap";
    tahunAjaran = await prisma.tahunAjaran.create({
      data: {
        sekolahId,
        nama: namaTa,
        semester,
        mulai: new Date(Date.UTC(isGanjil ? year : year - 1, isGanjil ? 6 : 0, 1)),
        selesai: new Date(Date.UTC(isGanjil ? year : year, isGanjil ? 11 : 5, 30)),
      },
      select: { id: true },
    });
  }

  // Ensure Guru
  let resolvedGuruId = params.guruId ?? null;
  if (resolvedGuruId) {
    const owned = await prisma.guru.findFirst({
      where: { id: resolvedGuruId, sekolahId },
      select: { id: true },
    });
    if (!owned) resolvedGuruId = null;
  }
  if (!resolvedGuruId) {
    const existingGuru = await prisma.guru.findFirst({
      where: { sekolahId, status: "Aktif" },
      orderBy: { nama: "asc" },
      select: { id: true },
    });
    if (existingGuru) {
      resolvedGuruId = existingGuru.id;
    } else {
      const createdGuru = await prisma.guru.create({
        data: {
          sekolahId,
          nama: "Tutor Pustaka Pusat",
          mapelUtama: "Umum",
          email: `tutor.pustaka.${sekolahId.slice(0, 8)}@siput.local`,
          telepon: "-",
          status: "Aktif",
        },
        select: { id: true },
      });
      resolvedGuruId = createdGuru.id;
    }
  }

  // Load school's existing Kelas, Mapel, MateriAjar, Ujian for matching & deduplication
  const [existingKelas, existingMapel, existingMateri, existingUjian] = await Promise.all([
    prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true } }),
    prisma.mapel.findMany({ where: { sekolahId }, select: { id: true, nama: true } }),
    prisma.materiAjar.findMany({
      where: { sekolahId },
      select: { kelasId: true, mapelId: true, judul: true },
      take: 2000,
    }),
    prisma.ujian.findMany({
      where: { sekolahId },
      select: { kelasId: true, mapelId: true, judul: true },
      take: 2000,
    }),
  ]);

  const kelasByKey = new Map<string, string>();
  const kelasById = new Set<string>();
  for (const k of existingKelas) {
    kelasById.add(k.id);
    kelasByKey.set(normalizeLookupKey(k.nama), k.id);
  }
  const mapelByKey = new Map<string, string>();
  const mapelById = new Set<string>();
  for (const m of existingMapel) {
    mapelById.add(m.id);
    mapelByKey.set(normalizeLookupKey(m.nama), m.id);
  }

  const fixedKelasId = params.targetKelasId && kelasById.has(params.targetKelasId) ? params.targetKelasId : null;
  const fixedMapelId = params.targetMapelId && mapelById.has(params.targetMapelId) ? params.targetMapelId : null;

  const materiDupSet = new Set(
    existingMateri.map((m) => `${m.kelasId}::${m.mapelId}::${normalizeLookupKey(m.judul)}`),
  );
  const ujianDupSet = new Set(
    existingUjian.map((u) => `${u.kelasId}::${u.mapelId}::${normalizeLookupKey(u.judul)}`),
  );

  async function resolveOrCreateKelas(jenjangRaw: string, tingkatKelas: string): Promise<string> {
    if (fixedKelasId) return fixedKelasId;
    const jenjang = normalizeMasterJenjang(jenjangRaw, "PAKET_C") ?? "PAKET_C";
    const desiredName = defaultKelasNameForMaster(jenjang, tingkatKelas);
    const key = normalizeLookupKey(desiredName);
    const exact = kelasByKey.get(key);
    if (exact) return exact;

    // Try partial grade match within same Paket
    const paketPrefix = normalizeLookupKey(jenjangLabel(jenjang));
    const gradeMatch = tingkatKelas.match(/(\d{1,2})/);
    if (gradeMatch) {
      for (const [kKey, kId] of kelasByKey.entries()) {
        if (kKey.includes(paketPrefix) && new RegExp(`\\b${gradeMatch[1]}\\b`).test(kKey)) {
          return kId;
        }
      }
    }

    const kode = `KLS-${sekolahId.slice(0, 4).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const created = await prisma.kelas.create({
      data: { sekolahId, kode, nama: desiredName },
      select: { id: true },
    });
    kelasByKey.set(key, created.id);
    kelasById.add(created.id);
    result.createdKelas += 1;
    return created.id;
  }

  async function resolveOrCreateMapel(mataPelajaran: string): Promise<string> {
    if (fixedMapelId) return fixedMapelId;
    const key = normalizeLookupKey(mataPelajaran);
    const existing = mapelByKey.get(key);
    if (existing) return existing;
    const kode = `MPL-${sekolahId.slice(0, 4).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const created = await prisma.mapel.create({
      data: { sekolahId, kode, nama: mataPelajaran.trim(), kkm: 75 },
      select: { id: true },
    });
    mapelByKey.set(key, created.id);
    mapelById.add(created.id);
    result.createdMapel += 1;
    return created.id;
  }

  // Clone MasterModul -> MateriAjar
  for (const modul of moduls) {
    const kelasId = await resolveOrCreateKelas(modul.jenjang, modul.tingkatKelas);
    const mapelId = await resolveOrCreateMapel(modul.mataPelajaran);
    const dupKey = `${kelasId}::${mapelId}::${normalizeLookupKey(modul.judul)}`;
    if (materiDupSet.has(dupKey)) {
      result.skippedModul += 1;
      continue;
    }

    const combinedDescription = [modul.deskripsi, modul.konten].filter((part) => part && part.trim()).join("\n\n") || null;
    await prisma.materiAjar.create({
      data: {
        sekolahId,
        tahunAjaranId: tahunAjaran.id,
        kelasId,
        mapelId,
        guruId: resolvedGuruId,
        judul: modul.judul,
        deskripsi: combinedDescription,
        jenis: modul.jenis || (modul.fileUrl ? "TAUTAN" : "MODUL"),
        tautan: modul.fileUrl && isSafeHttpUrl(modul.fileUrl) ? modul.fileUrl : null,
      },
    });
    materiDupSet.add(dupKey);
    result.copiedModul += 1;
  }

  // Clone MasterBankSoal + MasterButirSoal -> Ujian + SoalUjian + OpsiSoal
  const now = new Date();
  const defaultMulai = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultSelesai = new Date(defaultMulai.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const bank of banks) {
    const kelasId = await resolveOrCreateKelas(bank.jenjang, bank.tingkatKelas);
    const mapelId = await resolveOrCreateMapel(bank.mataPelajaran);
    const dupKey = `${kelasId}::${mapelId}::${normalizeLookupKey(bank.judul)}`;
    if (ujianDupSet.has(dupKey)) {
      result.skippedBankSoal += 1;
      continue;
    }

    const prefix = cbtPrefixForMasterKategori(bank.kategoriUjian);
    const kode = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;

    await prisma.ujian.create({
      data: {
        sekolahId,
        tahunAjaranId: tahunAjaran.id,
        kelasId,
        mapelId,
        guruId: resolvedGuruId,
        kode,
        judul: bank.judul,
        durasiMenit: bank.durasiMenit,
        mulai: defaultMulai,
        selesai: defaultSelesai,
        kkm: bank.kkm,
        dipublikasikan: false,
        soal: {
          create: bank.butirSoal.map((soal, index) => {
            const isEsai = soal.tipe === "ESAI";
            const opsiEntries = isEsai
              ? []
              : ([
                  ["A", soal.opsiA],
                  ["B", soal.opsiB],
                  ["C", soal.opsiC],
                  ["D", soal.opsiD],
                  ["E", soal.opsiE],
                ] as const)
                  .filter(([, text]) => Boolean(text && text.trim()))
                  .map(([kodeOpsi, text]) => ({
                    kode: kodeOpsi,
                    teks: text!.trim(),
                    benar: soal.kunciJawaban.trim().toUpperCase() === kodeOpsi,
                  }));

            return {
              urutan: index + 1,
              tipe: isEsai ? "ESAI" : "PG",
              teks: soal.teks,
              bobot: soal.bobot,
              kunciEsai: isEsai ? soal.kunciJawaban : null,
              pembahasan: soal.pembahasan ?? null,
              ...(opsiEntries.length > 0 ? { opsi: { create: opsiEntries } } : {}),
            };
          }),
        },
      },
    });

    ujianDupSet.add(dupKey);
    result.copiedBankSoal += 1;
    result.copiedSoalCount += bank.butirSoal.length;
  }

  return result;
}
