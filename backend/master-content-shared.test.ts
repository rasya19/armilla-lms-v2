import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneMasterContentToSchool,
  defaultKelasNameForMaster,
  isPdfOrDriveUrl,
  normalizeMasterJenjang,
  normalizeMasterKategori,
  normalizeModuleVisibility,
  parseMasterBankSoalInput,
  parseMasterButirList,
  parseMasterModulInput,
} from "./master-content-shared.js";
import type { PrismaClient } from "@prisma/client";

test("normalizeMasterJenjang and normalizeMasterKategori handle Indonesian PKBM labels", () => {
  assert.equal(normalizeMasterJenjang("Paket A"), "PAKET_A");
  assert.equal(normalizeMasterJenjang("sd"), "PAKET_A");
  assert.equal(normalizeMasterJenjang("paket b"), "PAKET_B");
  assert.equal(normalizeMasterJenjang("Paket C"), "PAKET_C");
  assert.equal(normalizeMasterJenjang("unknown"), null);

  assert.equal(normalizeMasterKategori("Materi"), "MATERI");
  assert.equal(normalizeMasterKategori("PTS"), "UTS");
  assert.equal(normalizeMasterKategori("UAS"), "UAS");
  assert.equal(normalizeMasterKategori("UPK"), "UJIAN_AKHIR");
  assert.equal(normalizeMasterKategori("Ujian Akhir Kelas Akhir"), "UJIAN_AKHIR");
  assert.equal(defaultKelasNameForMaster("PAKET_C", "12"), "Paket C Kelas 12");
});

test("parseMasterModulInput validates safe URLs and required fields", () => {
  const valid = parseMasterModulInput({
    jenjang: "Paket B",
    tingkatKelas: "8",
    mataPelajaran: "Matematika",
    judul: "Modul Aljabar Dasar",
    fileUrl: "https://example.org/modul.pdf",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.jenjang, "PAKET_B");
    assert.equal(valid.data.tingkatKelas, "Kelas 8");
    assert.equal(valid.data.fileUrl, "https://example.org/modul.pdf");
  }

  const unsafe = parseMasterModulInput({
    jenjang: "Paket A",
    mataPelajaran: "IPA",
    judul: "Modul Unsafe",
    fileUrl: "javascript:alert(1)",
  });
  assert.equal(unsafe.ok, false);

  // Indonesian Excel column aliases (Paket, Kelas, Mata Pelajaran, Judul Modul, Ringkasan, Link PDF)
  const excelAlias = parseMasterModulInput({
    paket: "Paket C",
    kelas: "11",
    mata_pelajaran: "Ekonomi",
    judul_modul: "Modul 3 — Pasar Modal",
    ringkasan: "Pengantar instrumen pasar modal Indonesia",
    link_pdf: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing",
    visibility: "public",
  });
  assert.equal(excelAlias.ok, true);
  if (excelAlias.ok) {
    assert.equal(excelAlias.data.jenjang, "PAKET_C");
    assert.equal(excelAlias.data.tingkatKelas, "Kelas 11");
    assert.equal(excelAlias.data.mataPelajaran, "Ekonomi");
    assert.equal(excelAlias.data.judul, "Modul 3 — Pasar Modal");
    assert.equal(excelAlias.data.deskripsi, "Pengantar instrumen pasar modal Indonesia");
    assert.equal(excelAlias.data.visibility, "PUBLIC");
    assert.equal(isPdfOrDriveUrl(excelAlias.data.fileUrl), true);
  }

  // Reject embedded binary / base64 payloads
  const base64FileUrl = parseMasterModulInput({
    paket: "Paket B",
    kelas: "7",
    mata_pelajaran: "IPS",
    judul_modul: "Modul Base64",
    link_pdf: "data:application/pdf;base64,JVBERi0xLjQK",
  });
  assert.equal(base64FileUrl.ok, false);

  const base64Konten = parseMasterModulInput({
    paket: "Paket B",
    kelas: "7",
    mata_pelajaran: "IPS",
    judul_modul: "Modul Embedded Base64",
    konten: "Lampiran: data:application/pdf;base64,JVBERi0xLjQK",
  });
  assert.equal(base64Konten.ok, false);

  assert.equal(normalizeModuleVisibility("PRIVATE"), "PRIVATE");
  assert.equal(normalizeModuleVisibility("publik", "PRIVATE"), "PUBLIC");
  assert.equal(isPdfOrDriveUrl("https://cdn.kemdikbud.go.id/modul-1.pdf"), true);
  assert.equal(isPdfOrDriveUrl("https://example.org/halaman-biasa"), false);
});

test("parseMasterBankSoalInput and parseMasterButirList validate PG and ESAI items", () => {
  const bank = parseMasterBankSoalInput({
    jenjang: "PAKET_C",
    tingkatKelas: "Kelas 12",
    mataPelajaran: "Bahasa Indonesia",
    kategoriUjian: "UJIAN_AKHIR",
    judul: "UPK Bahasa Indonesia Paket C",
    durasiMenit: 90,
    kkm: 75,
  });
  assert.equal(bank.ok, true);

  const parsed = parseMasterButirList([
    {
      tipe: "PG",
      teks: "Apa gagasan utama paragraf tersebut?",
      opsiA: "Pendidikan kesetaraan",
      opsiB: "Olahraga",
      opsiC: "Wisata",
      opsiD: "Kuliner",
      kunciJawaban: "A",
      bobot: 10,
    },
    {
      tipe: "ESAI",
      teks: "Jelaskan struktur teks eksposisi!",
      kunciJawaban: "Tesis, argumentasi, penegasan ulang",
      bobot: 20,
    },
    {
      tipe: "PG",
      teks: "Soal rusak tanpa opsi cukup",
      opsiA: "Hanya satu",
    },
  ]);

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.items[0].kunciJawaban, "A");
  assert.equal(parsed.items[1].tipe, "ESAI");
});

test("cloneMasterContentToSchool copies modules and exam packets scoped strictly to sekolahId and skips duplicates", async () => {
  const createdMateri: Array<Record<string, unknown>> = [];
  const createdUjian: Array<Record<string, unknown>> = [];
  const createdKelas: Array<{ id: string; nama: string }> = [];
  const createdMapel: Array<{ id: string; nama: string }> = [];

  const mockPrisma = {
    masterModul: {
      findMany: async () => [
        {
          id: "m1",
          jenjang: "PAKET_C",
          tingkatKelas: "Kelas 12",
          mataPelajaran: "Matematika",
          kategoriUjian: "MATERI",
          judul: "Modul Statistika",
          deskripsi: "Pengantar statistika",
          konten: "Isi ringkas modul",
          fileUrl: "https://example.org/stat.pdf",
          jenis: "MODUL",
          aktif: true,
        },
      ],
    },
    masterBankSoal: {
      findMany: async () => [
        {
          id: "b1",
          jenjang: "PAKET_C",
          tingkatKelas: "Kelas 12",
          mataPelajaran: "Matematika",
          kategoriUjian: "UJIAN_AKHIR",
          judul: "UPK Matematika Paket C",
          deskripsi: "Paket soal UPK",
          durasiMenit: 90,
          kkm: 75,
          aktif: true,
          butirSoal: [
            {
              id: "s1",
              urutan: 1,
              tipe: "PG",
              teks: "Berapakah 2 + 2?",
              bobot: 10,
              opsiA: "3",
              opsiB: "4",
              opsiC: "5",
              opsiD: "6",
              opsiE: null,
              kunciJawaban: "B",
              pembahasan: "2 + 2 = 4",
            },
          ],
        },
      ],
    },
    tahunAjaran: {
      findFirst: async () => ({ id: "ta-1" }),
    },
    guru: {
      findFirst: async () => ({ id: "guru-1" }),
    },
    kelas: {
      findMany: async () => createdKelas,
      create: async ({ data }: { data: { nama: string } }) => {
        const next = { id: `kelas-${createdKelas.length + 1}`, nama: data.nama };
        createdKelas.push(next);
        return next;
      },
    },
    mapel: {
      findMany: async () => createdMapel,
      create: async ({ data }: { data: { nama: string } }) => {
        const next = { id: `mapel-${createdMapel.length + 1}`, nama: data.nama };
        createdMapel.push(next);
        return next;
      },
    },
    materiAjar: {
      findMany: async () =>
        createdMateri.map((m) => ({
          kelasId: m.kelasId,
          mapelId: m.mapelId,
          judul: m.judul,
        })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdMateri.push(data);
        return data;
      },
    },
    ujian: {
      findMany: async () =>
        createdUjian.map((u) => ({
          kelasId: u.kelasId,
          mapelId: u.mapelId,
          judul: u.judul,
        })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdUjian.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;

  const first = await cloneMasterContentToSchool(mockPrisma, {
    sekolahId: "school-abc",
    jenjangList: ["PAKET_C"],
  });

  assert.equal(first.copiedModul, 1);
  assert.equal(first.copiedBankSoal, 1);
  assert.equal(first.copiedSoalCount, 1);
  assert.equal(first.createdKelas, 1);
  assert.equal(first.createdMapel, 1);
  assert.equal(createdMateri[0].sekolahId, "school-abc");
  assert.equal(createdUjian[0].sekolahId, "school-abc");
  assert.match(String(createdUjian[0].kode), /^UAK-/);

  // Second run should deduplicate cleanly
  const second = await cloneMasterContentToSchool(mockPrisma, {
    sekolahId: "school-abc",
    jenjangList: ["PAKET_C"],
  });
  assert.equal(second.copiedModul, 0);
  assert.equal(second.skippedModul, 1);
  assert.equal(second.copiedBankSoal, 0);
  assert.equal(second.skippedBankSoal, 1);
});
