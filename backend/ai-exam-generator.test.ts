import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  aiCategoryCodePrefix,
  buildGeminiModelCandidates,
  DEFAULT_GEMINI_MODEL,
  generateExamDraftWithAi,
  normalizeAiExamCategory,
  normalizeGeneratedQuestions,
  resolveGeminiApiKey,
  resolveGeminiModel,
  sanitizeEnvValue,
} from "./ai-exam-generator.js";

const silentLogger = {
  error: () => {},
  warn: () => {},
};

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

test("normalizes generated questions including nested options and rejects incomplete entries", () => {
  const valid = normalizeGeneratedQuestions([
    {
      teks: "Berapakah hasil 2 + 2?",
      opsiA: "3",
      opsiB: "4",
      opsiC: "5",
      opsiD: "6",
      kunciJawaban: "B. 4",
      pembahasan: "2 + 2 = 4",
      bobot: 10,
    },
    {
      pertanyaan: "Ibu kota Indonesia adalah...",
      options: { A: "Bandung", B: "Surabaya", C: "Jakarta", D: "Medan" },
      kunci: "C",
      penjelasan: "Jakarta adalah ibu kota Indonesia.",
    },
    {
      teks: "Soal tidak lengkap tanpa opsi D",
      opsiA: "A",
      opsiB: "B",
      opsiC: "C",
    },
  ]);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].kunciJawaban, "B");
  assert.equal(valid[0].bobot, 10);
  assert.equal(valid[1].opsiC, "Jakarta");
  assert.equal(valid[1].kunciJawaban, "C");
});

test("sanitizes GEMINI_API_KEY and GEMINI_MODEL quotes, whitespace, and models/ prefix", () => {
  assert.equal(sanitizeEnvValue('  "AIzaSyTest123"  '), "AIzaSyTest123");
  assert.equal(sanitizeEnvValue("'gemini-2.0-flash'"), "gemini-2.0-flash");
  assert.equal(resolveGeminiApiKey({ GEMINI_API_KEY: ' "secret-key" ' }), "secret-key");
  assert.equal(resolveGeminiModel({}), DEFAULT_GEMINI_MODEL);
  assert.equal(resolveGeminiModel({ GEMINI_MODEL: ' "models/gemini-2.0-flash" ' }), "gemini-2.0-flash");
  assert.equal(resolveGeminiModel({ GEMINI_MODEL: "invalid model/with spaces" }), DEFAULT_GEMINI_MODEL);
  assert.deepEqual(buildGeminiModelCandidates({ GEMINI_MODEL: "gemini-custom" }), [
    "gemini-custom",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ]);
});

test("generateExamDraftWithAi returns 500 AI_NOT_CONFIGURED when API key is missing", async () => {
  const res = await generateExamDraftWithAi(
    { kategori: "UTS", kelasNama: "Paket C Kelas 10", mapelNama: "Matematika", topik: "Aljabar", jumlahSoal: 5 },
    { env: {}, logger: silentLogger },
  );
  assert.equal(res.ok, false);
  if (res.ok === false) {
    assert.equal(res.status, 500);
    assert.equal(res.code, "AI_NOT_CONFIGURED");
  }
});

test("generateExamDraftWithAi falls back to stable model when configured GEMINI_MODEL returns 404", async () => {
  const calledModels: string[] = [];
  const mockFetch = (async (url: string | URL | Request) => {
    const urlStr = String(url);
    const match = urlStr.match(/\/models\/([^:]+):generateContent/);
    const model = match ? decodeURIComponent(match[1]) : "";
    calledModels.push(model);

    if (model === "gemini-retired-model") {
      return new Response(
        JSON.stringify({ error: { code: 404, message: "models/gemini-retired-model is not found", status: "NOT_FOUND" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    judulPaket: "UTS Matematika Paket C",
                    deskripsiPaket: "Soal latihan UTS",
                    butirSoal: [
                      {
                        teks: "Nilai x dari 2x + 4 = 10 adalah...",
                        opsiA: "2",
                        opsiB: "3",
                        opsiC: "4",
                        opsiD: "5",
                        opsiE: "6",
                        kunciJawaban: "B",
                        pembahasan: "2x = 6 sehingga x = 3.",
                        bobot: 10,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const res = await generateExamDraftWithAi(
    { kategori: "UTS", kelasNama: "Paket C Kelas 10", mapelNama: "Matematika", topik: "Linear", jumlahSoal: 3 },
    {
      env: { GEMINI_API_KEY: '"valid-key"', GEMINI_MODEL: "gemini-retired-model" },
      fetchImpl: mockFetch,
      retryDelayMs: 1,
      logger: silentLogger,
    },
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.model, "gemini-2.5-flash");
    assert.equal(res.draft.butirSoal.length, 1);
    assert.equal(res.draft.butirSoal[0].kunciJawaban, "B");
  }
  assert.deepEqual(calledModels, ["gemini-retired-model", "gemini-2.5-flash"]);
});

test("generateExamDraftWithAi returns specific status/code for auth error, rate limit, and invalid JSON", async () => {
  const authFail = await generateExamDraftWithAi(
    { kategori: "UAS", kelasNama: "Paket B Kelas 9", mapelNama: "IPA", topik: "Listrik", jumlahSoal: 5 },
    {
      env: { GEMINI_API_KEY: "bad-key" },
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 403 })) as typeof fetch,
      retryDelayMs: 1,
      logger: silentLogger,
    },
  );
  assert.equal(authFail.ok, false);
  if (authFail.ok === false) {
    assert.equal(authFail.status, 502);
    assert.equal(authFail.code, "GEMINI_AUTH_ERROR");
  }

  const rateLimit = await generateExamDraftWithAi(
    { kategori: "UAS", kelasNama: "Paket B Kelas 9", mapelNama: "IPA", topik: "Listrik", jumlahSoal: 5 },
    {
      env: { GEMINI_API_KEY: "valid-key" },
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: "Resource exhausted" } }), { status: 429 })) as typeof fetch,
      retryDelayMs: 1,
      logger: silentLogger,
    },
  );
  assert.equal(rateLimit.ok, false);
  if (rateLimit.ok === false) {
    assert.equal(rateLimit.status, 429);
    assert.equal(rateLimit.code, "GEMINI_RATE_LIMIT");
  }

  const invalidJson = await generateExamDraftWithAi(
    { kategori: "UJIAN_AKHIR", kelasNama: "Paket C Kelas 12", mapelNama: "Bahasa Indonesia", topik: "Teks", jumlahSoal: 5 },
    {
      env: { GEMINI_API_KEY: "valid-key" },
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{ truncated json" }] } }] }),
          { status: 200 },
        )) as typeof fetch,
      retryDelayMs: 1,
      logger: silentLogger,
    },
  );
  assert.equal(invalidJson.ok, false);
  if (invalidJson.ok === false) {
    assert.equal(invalidJson.status, 502);
    assert.equal(invalidJson.code, "GEMINI_INVALID_JSON");
  }
});
