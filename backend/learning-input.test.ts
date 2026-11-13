import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseGrade, parseLearningContent, parseSubmission } from "./learning-input.js";

test("validates learning content and HTTPS links", () => {
  const base = { jadwalId: "jadwal", judul: "Materi", isi: "", tautan: "https://example.com/a" };
  assert.ok(parseLearningContent(base, "materi"));
  for (const tautan of ["javascript:alert(1)", "http://example.com", "https://u:p@example.com", ""]) assert.equal(parseLearningContent({ ...base, tautan }, "materi"), null);
  assert.ok(parseLearningContent({ ...base, isi: "Teks", tautan: "" }, "materi"));
  assert.ok(parseLearningContent({ ...base, isi: "Instruksi", batasWaktu: "2026-11-14T05:30:00.000Z" }, "tugas"));
  for (const batasWaktu of ["2026-02-30T00:00:00.000Z", "2026-01-01", "garbage"]) assert.equal(parseLearningContent({ ...base, isi: "Instruksi", batasWaktu }, "tugas"), null);
});

test("validates submission and grading", () => {
  assert.ok(parseSubmission({ jawaban: "Jawaban", tautan: "" }));
  assert.ok(parseSubmission({ jawaban: "", tautan: "https://example.com" }));
  assert.equal(parseSubmission({ jawaban: "", tautan: "" }), null);
  assert.equal(parseSubmission({ jawaban: "", tautan: "javascript:alert(1)" }), null);
  assert.deepEqual(parseGrade({ nilai: 80.5, catatanGuru: "" }), { nilai: 80.5, catatanGuru: null });
  for (const nilai of [-1, 101, "80", Infinity]) assert.equal(parseGrade({ nilai, catatanGuru: "" }), null);
});
