import assert from "node:assert/strict";
import test from "node:test";
import { cbtCategoryPrefix, normalizeCbtCategory, parseBulkQuestions, parseBulkTasks } from "./cbt-import.js";

test("normalizeCbtCategory maps UTS, AS/UAS, Ujian Akhir Kelas Akhir, and Tugas variants", () => {
  assert.equal(normalizeCbtCategory("UTS"), "UTS");
  assert.equal(normalizeCbtCategory("Sumatif Tengah Semester"), "UTS");
  assert.equal(normalizeCbtCategory("AS"), "AS");
  assert.equal(normalizeCbtCategory("UAS"), "AS");
  assert.equal(normalizeCbtCategory("Asesmen Sumatif"), "AS");
  assert.equal(normalizeCbtCategory("Ujian Akhir Kelas Akhir"), "UJIAN_AKHIR");
  assert.equal(normalizeCbtCategory("UPK"), "UJIAN_AKHIR");
  assert.equal(normalizeCbtCategory("Tugas"), "TUGAS");

  assert.equal(cbtCategoryPrefix("UTS"), "UTS");
  assert.equal(cbtCategoryPrefix("AS"), "AS");
  assert.equal(cbtCategoryPrefix("UJIAN_AKHIR"), "UAK");
  assert.equal(cbtCategoryPrefix("TUGAS"), "TGS");
});

test("parseBulkQuestions validates PG A-E and ESAI questions and reports invalid rows", () => {
  const result = parseBulkQuestions([
    {
      row: 2,
      tipe: "PG",
      teks: "Ibu kota Indonesia adalah...",
      opsiA: "Bandung",
      opsiB: "Jakarta",
      opsiC: "Medan",
      opsiD: "Surabaya",
      kunci: "Opsi B",
      bobot: 10,
    },
    {
      row: 3,
      tipe: "ESAI",
      teks: "Jelaskan pengertian demokrasi.",
      kunciEsai: "Pemerintahan dari rakyat, oleh rakyat, dan untuk rakyat.",
      bobot: 25,
    },
    {
      row: 4,
      tipe: "PG",
      teks: "Soal tanpa kunci",
      opsiA: "Satu",
      opsiB: "Dua",
      kunci: "",
    },
  ]);

  assert.ok(!("error" in result));
  assert.equal(result.valid.length, 2);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].row, 4);
  assert.equal(result.valid[0].tipe, "PG");
  assert.equal(result.valid[0].opsi.find((o) => o.benar)?.kode, "B");
  assert.equal(result.valid[1].tipe, "ESAI");
  assert.equal(result.valid[1].bobot, 25);
});

test("parseBulkTasks validates tasks, category normalization, and HTTPS-only links", () => {
  const result = parseBulkTasks(
    [
      {
        row: 2,
        judul: "Proyek Portofolio Akhir",
        kategori: "Ujian Akhir Kelas Akhir",
        kelasNama: "Paket C Kelas 12",
        mapelNama: "Matematika",
        instruksi: "Kerjakan studi kasus dan kumpulkan laporan.",
        batasWaktu: "2026-12-20T16:59:00.000Z",
        tautan: "https://example.org/panduan.pdf",
      },
      {
        row: 3,
        judul: "Tugas Tautan Tidak Aman",
        instruksi: "Cek tautan",
        tautan: "javascript:alert(1)",
      },
    ],
    "UTS",
  );

  assert.ok(!("error" in result));
  assert.equal(result.valid.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.valid[0].kategori, "UJIAN_AKHIR");
  assert.equal(result.valid[0].tautan, "https://example.org/panduan.pdf");
});
