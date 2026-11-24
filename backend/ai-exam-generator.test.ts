import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  aiCategoryCodePrefix,
  normalizeAiExamCategory,
  normalizeGeneratedQuestions,
  resolveGeminiModel,
} from "./ai-exam-generator.js";

test("normalizes AI exam categories and code prefixes including final-grade UPK", () => {
  assert.equal(normalizeAiExamCategory("UTS"), "UTS");
  assert.equal(normalizeAiExamCategory("UAS"), "UAS");
  assert.equal(normalizeAiExamCategory("AS"), "UAS");
  assert.equal(normalizeAiExamCategory("UPK"), "UJIAN_AKHIR");
  assert.equal(normalizeAiExamCategory("Ujian Akhir"), "UJIAN_AKHIR");
  assert.equal(aiCategoryCodePrefix("UTS"), "UTS");
  assert.equal(aiCategoryCodePrefix("UAS"), "UAS");
  assert.equal(aiCategoryCodePrefix("UJIAN_AKHIR"), "UAK");
});

test("normalizes generated questions and rejects incomplete entries", () => {
  const valid = normalizeGeneratedQuestions([
    {
      teks: "Berapakah hasil 2 + 2?",
      opsiA: "3",
      opsiB: "4",
      opsiC: "5",
      opsiD: "6",
      kunciJawaban: "B",
      pembahasan: "2 + 2 = 4",
      bobot: 10,
    },
    {
      teks: "Soal tidak lengkap tanpa opsi D",
      opsiA: "A",
      opsiB: "B",
      opsiC: "C",
    },
  ]);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].kunciJawaban, "B");
  assert.equal(valid[0].bobot, 10);
});

test("resolveGeminiModel falls back to gemini-2.5-flash when env unset", () => {
  const prev = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODEL;
  assert.equal(resolveGeminiModel(), "gemini-2.5-flash");
  process.env.GEMINI_MODEL = "gemini-2.0-flash";
  assert.equal(resolveGeminiModel(), "gemini-2.0-flash");
  if (prev === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = prev;
});
