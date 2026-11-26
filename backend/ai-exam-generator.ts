import { cleanInt, cleanText } from "./school-modules-shared.js";

export type AiExamCategory = "UTS" | "UAS" | "UJIAN_AKHIR";

export type GeneratedExamQuestion = {
  teks: string;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  kunciJawaban: "A" | "B" | "C" | "D" | "E";
  pembahasan: string;
  bobot: number;
};

export type GeneratedExamDraft = {
  judulPaket: string;
  deskripsiPaket: string;
  butirSoal: GeneratedExamQuestion[];
};

export type AiGeneratorErrorCode =
  | "AI_NOT_CONFIGURED"
  | "GEMINI_AUTH_ERROR"
  | "GEMINI_MODEL_NOT_FOUND"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_BAD_REQUEST"
  | "GEMINI_UPSTREAM_ERROR"
  | "GEMINI_TIMEOUT"
  | "GEMINI_EMPTY_RESPONSE"
  | "GEMINI_INVALID_JSON"
  | "GEMINI_EMPTY_QUESTIONS";

export type AiGenerateResult =
  | {
      ok: true;
      draft: GeneratedExamDraft;
      provider: "gemini" | "openrouter";
      model: string;
    }
  | {
      ok: false;
      status: number;
      code: AiGeneratorErrorCode;
      error: string;
      detail?: string;
    };

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"] as const;

/**
 * Safely trims whitespace and accidental surrounding quotes from environment variables.
 */
export function sanitizeEnvValue(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  while (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function resolveGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return sanitizeEnvValue(env.GEMINI_API_KEY);
}

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = sanitizeEnvValue(env.GEMINI_MODEL).replace(/^models\//i, "");
  if (!configured || !/^[a-zA-Z0-9._-]+$/.test(configured)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return configured;
}

export function buildGeminiModelCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = resolveGeminiModel(env);
  const candidates = [primary, ...GEMINI_FALLBACK_MODELS];
  return Array.from(new Set(candidates));
}

export function normalizeAiExamCategory(raw: unknown): AiExamCategory {
  if (typeof raw !== "string") return "UTS";
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "UAS" || upper === "AS" || upper === "PAS" || upper === "PSAS") return "UAS";
  if (upper === "UJIAN_AKHIR" || upper === "UPK" || upper === "UAK" || upper === "KELAS_AKHIR") return "UJIAN_AKHIR";
  return "UTS";
}

export function aiCategoryLabel(category: AiExamCategory): string {
  if (category === "UAS") return "Ujian Akhir Semester (UAS)";
  if (category === "UJIAN_AKHIR") return "Ujian Akhir / UPK Kelas Akhir";
  return "Ujian Tengah Semester (UTS)";
}

export function aiCategoryCodePrefix(category: AiExamCategory): string {
  if (category === "UAS") return "UAS";
  if (category === "UJIAN_AKHIR") return "UAK";
  return "UTS";
}

function readOptionText(obj: Record<string, unknown>, key: "A" | "B" | "C" | "D" | "E"): string {
  const lower = key.toLowerCase();
  const nestedOptions =
    (obj.opsi && typeof obj.opsi === "object" && !Array.isArray(obj.opsi) ? (obj.opsi as Record<string, unknown>) : null) ??
    (obj.options && typeof obj.options === "object" && !Array.isArray(obj.options) ? (obj.options as Record<string, unknown>) : null) ??
    (obj.pilihan && typeof obj.pilihan === "object" && !Array.isArray(obj.pilihan) ? (obj.pilihan as Record<string, unknown>) : null);

  return cleanText(
    obj[`opsi${key}`] ?? obj[lower] ?? obj[key] ?? nestedOptions?.[key] ?? nestedOptions?.[lower],
    1000,
  );
}

export function normalizeGeneratedQuestions(rawList: unknown): GeneratedExamQuestion[] {
  if (!Array.isArray(rawList)) return [];
  const results: GeneratedExamQuestion[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const teks = cleanText(obj.teks ?? obj.pertanyaan ?? obj.soal ?? obj.question, 4000);
    const opsiA = readOptionText(obj, "A");
    const opsiB = readOptionText(obj, "B");
    const opsiC = readOptionText(obj, "C");
    const opsiD = readOptionText(obj, "D");
    const opsiE = readOptionText(obj, "E");
    if (!teks || !opsiA || !opsiB || !opsiC || !opsiD) continue;

    const rawKeyText = cleanText(obj.kunciJawaban ?? obj.kunci ?? obj.jawabanBenar ?? obj.answer, 20).toUpperCase();
    const keyMatch = rawKeyText.match(/^([A-E])\b/) ?? rawKeyText.match(/\b([A-E])\b/);
    const extractedKey = keyMatch ? keyMatch[1] : rawKeyText;
    const validKey: "A" | "B" | "C" | "D" | "E" =
      extractedKey === "B" || extractedKey === "C" || extractedKey === "D" || (extractedKey === "E" && Boolean(opsiE))
        ? extractedKey
        : "A";

    results.push({
      teks,
      opsiA,
      opsiB,
      opsiC,
      opsiD,
      opsiE,
      kunciJawaban: validKey,
      pembahasan: cleanText(obj.pembahasan ?? obj.penjelasan ?? obj.explanation, 2000),
      bobot: cleanInt(obj.bobot, 1, 100, 10),
    });
    if (results.length >= 25) break;
  }
  return results;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (Array.isArray(parsed)) {
      return { butirSoal: parsed };
    }
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function readUpstreamErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text.trim()) return `HTTP ${response.status} ${response.statusText}`.trim();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; status?: string; code?: number }; message?: string };
      const msg = parsed.error?.message || parsed.message;
      const st = parsed.error?.status ? ` (${parsed.error.status})` : "";
      if (msg) return `${msg}${st}`.slice(0, 300);
    } catch {
      // plain text body
    }
    return text.trim().slice(0, 300);
  } catch {
    return `HTTP ${response.status}`;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError" || /timeout|aborted/i.test(error.message);
}

async function delayMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateExamDraftWithAi(
  input: {
    kategori: AiExamCategory;
    kelasNama: string;
    mapelNama: string;
    topik: string;
    jumlahSoal: number;
    schoolName?: string;
  },
  deps?: {
    env?: NodeJS.ProcessEnv;
    apiKeyOverride?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    retryDelayMs?: number;
    logger?: Pick<Console, "error" | "warn">;
  },
): Promise<AiGenerateResult> {
  const env = deps?.env ?? process.env;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? 45_000;
  const retryDelayMs = deps?.retryDelayMs ?? 600;
  const logger = deps?.logger ?? console;

  const overrideKey = sanitizeEnvValue(deps?.apiKeyOverride);
  const geminiKey = overrideKey || resolveGeminiApiKey(env);
  const openRouterKey = overrideKey ? "" : sanitizeEnvValue(env.OPENROUTER_API_KEY);

  if (!geminiKey && !openRouterKey) {
    logger.error("[CBT AI] GEMINI_API_KEY dan OPENROUTER_API_KEY kosong pada environment server.");
    return {
      ok: false,
      status: 500,
      code: "AI_NOT_CONFIGURED",
      error: "GEMINI_API_KEY belum dikonfigurasi pada server. Atur kunci API Google AI Studio di Environment Variables untuk mengaktifkan Generator Soal AI.",
    };
  }

  const jumlahSoal = cleanInt(input.jumlahSoal, 3, 20, 5);
  const kategoriText = aiCategoryLabel(input.kategori);
  const isFinalExam = input.kategori === "UJIAN_AKHIR";

  const systemInstruction =
    "Anda adalah penulis soal profesional Pendidikan Kesetaraan (Paket A, B, C) Indonesia. " +
    "Keluarkan HANYA objek JSON valid tanpa teks tambahan di luar JSON. " +
    "Pastikan soal menggunakan bahasa Indonesia baku, kontekstual, bervariasi (C1-C4), dan kunci jawaban akurat secara akademis.";

  const userPrompt = [
    `Buat tepat ${jumlahSoal} butir soal pilihan ganda untuk ${kategoriText}.`,
    `Kelas / Program: ${input.kelasNama}`,
    `Mata Pelajaran: ${input.mapelNama}`,
    input.schoolName ? `Lembaga: ${input.schoolName}` : "",
    input.topik ? `Topik / Kisi-kisi Materi: ${input.topik}` : `Topik: Kompetensi esensial ${input.mapelNama} (${input.kelasNama})`,
    isFinalExam
      ? "Karena ini Ujian Akhir / UPK untuk kelas akhir (Kelas 6 / 9 / 12), sertakan soal komprehensif lintas kompetensi inti sebagai evaluasi kelulusan."
      : "",
    'Kembalikan JSON dengan struktur tepat berikut: {"judulPaket":"string","deskripsiPaket":"string","butirSoal":[{"teks":"string","opsiA":"string","opsiB":"string","opsiC":"string","opsiD":"string","opsiE":"","kunciJawaban":"A","pembahasan":"string","bobot":10}]}.',
    "Setiap soal wajib punya opsiA sampai opsiD (opsiE boleh kosong atau diisi untuk Paket B/C), kunciJawaban berupa satu huruf kapital (A/B/C/D/E), dan pembahasan singkat.",
  ]
    .filter(Boolean)
    .join("\n");

  let rawText = "";
  let provider: "gemini" | "openrouter" = "gemini";
  let usedModel = resolveGeminiModel(env);
  let lastFailure: Extract<AiGenerateResult, { ok: false }> | null = null;

  if (geminiKey) {
    const modelCandidates = buildGeminiModelCandidates(env);

    for (const model of modelCandidates) {
      usedModel = model;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      let tryNextModel = false;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (response.ok) {
            const json = (await response.json()) as {
              candidates?: Array<{
                finishReason?: string;
                content?: { parts?: Array<{ text?: string }> };
              }>;
              promptFeedback?: { blockReason?: string };
            };
            const candidate = json.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const blockReason = json.promptFeedback?.blockReason;
            const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

            if (text) {
              rawText = text;
              provider = "gemini";
              usedModel = model;
              break;
            }

            logger.error("[CBT AI] Gemini mengembalikan respons kosong", {
              model,
              attempt,
              finishReason,
              blockReason,
            });
            lastFailure = {
              ok: false,
              status: 502,
              code: "GEMINI_EMPTY_RESPONSE",
              error: blockReason
                ? `Permintaan diblokir filter keamanan Gemini (${blockReason}). Ubah topik/kisi-kisi lalu coba lagi.`
                : `Gemini (${model}) mengembalikan respons kosong${finishReason ? ` (${finishReason})` : ""}. Coba ulangi dengan jumlah soal lebih sedikit.`,
              detail: finishReason || blockReason || "EMPTY_CANDIDATES",
            };
            tryNextModel = true;
            break;
          }

          const detail = await readUpstreamErrorDetail(response);
          logger.error("[CBT AI] Gemini API gagal", {
            model,
            attempt,
            status: response.status,
            detail,
          });

          if (response.status === 429) {
            lastFailure = {
              ok: false,
              status: 429,
              code: "GEMINI_RATE_LIMIT",
              error: "Kuota atau batas permintaan (rate limit) Gemini AI sedang penuh. Tunggu beberapa saat lalu coba lagi.",
              detail,
            };
            if (attempt < 2) {
              await delayMs(retryDelayMs);
              continue;
            }
            // Don't burn quota on more models when rate-limited unless OpenRouter is configured
            break;
          }

          if (response.status === 401 || response.status === 403) {
            lastFailure = {
              ok: false,
              status: 502,
              code: "GEMINI_AUTH_ERROR",
              error: "Kunci GEMINI_API_KEY tidak valid, kedaluwarsa, atau tidak memiliki izin akses. Periksa Environment Variables server.",
              detail,
            };
            break;
          }

          if (response.status === 404) {
            lastFailure = {
              ok: false,
              status: 502,
              code: "GEMINI_MODEL_NOT_FOUND",
              error: `Model Gemini "${model}" tidak ditemukan atau tidak didukung pada API v1beta. Periksa variabel GEMINI_MODEL.`,
              detail,
            };
            tryNextModel = true;
            break;
          }

          if (response.status === 400) {
            lastFailure = {
              ok: false,
              status: 400,
              code: "GEMINI_BAD_REQUEST",
              error: `Permintaan ke Gemini (${model}) ditolak: ${detail}`,
              detail,
            };
            // Sometimes model-specific generationConfig causes 400; try fallback model
            tryNextModel = true;
            break;
          }

          lastFailure = {
            ok: false,
            status: 502,
            code: "GEMINI_UPSTREAM_ERROR",
            error: `Layanan Gemini (${model}) sedang mengalami gangguan (HTTP ${response.status}). Silakan coba lagi beberapa saat.`,
            detail,
          };

          if (isRetryableStatus(response.status) && attempt < 2) {
            await delayMs(retryDelayMs);
            continue;
          }
          tryNextModel = isRetryableStatus(response.status);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const timedOut = isTimeoutError(error);
          logger.error("[CBT AI] Gagal menghubungi endpoint Gemini", {
            model,
            attempt,
            timedOut,
            error: message,
          });
          lastFailure = {
            ok: false,
            status: timedOut ? 504 : 502,
            code: timedOut ? "GEMINI_TIMEOUT" : "GEMINI_UPSTREAM_ERROR",
            error: timedOut
              ? "Permintaan ke Gemini AI melewati batas waktu (timeout). Coba kurangi jumlah soal atau ulangi beberapa saat lagi."
              : `Gagal terhubung ke layanan Gemini AI: ${message}`,
            detail: message,
          };
          if (attempt < 2) {
            await delayMs(retryDelayMs);
            continue;
          }
          tryNextModel = true;
        }
      }

      if (rawText) break;
      if (!tryNextModel) break;
    }
  }

  if (!rawText && openRouterKey) {
    const openRouterModel = sanitizeEnvValue(env.OPENROUTER_MODEL) || "google/gemini-2.0-flash-001";
    try {
      const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 8192,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        rawText = json.choices?.[0]?.message?.content?.trim() ?? "";
        provider = "openrouter";
        usedModel = openRouterModel;
      } else {
        const detail = await readUpstreamErrorDetail(response);
        logger.error("[CBT AI] OpenRouter fallback gagal", {
          model: openRouterModel,
          status: response.status,
          detail,
        });
        if (!lastFailure) {
          lastFailure = {
            ok: false,
            status: response.status === 429 ? 429 : 502,
            code: response.status === 429 ? "GEMINI_RATE_LIMIT" : "GEMINI_UPSTREAM_ERROR",
            error:
              response.status === 429
                ? "Kuota permintaan AI sedang penuh. Coba lagi beberapa saat."
                : `Layanan AI cadangan mengembalikan HTTP ${response.status}.`,
            detail,
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[CBT AI] Gagal menghubungi OpenRouter fallback", { error: message });
      if (!lastFailure) {
        lastFailure = {
          ok: false,
          status: isTimeoutError(error) ? 504 : 502,
          code: isTimeoutError(error) ? "GEMINI_TIMEOUT" : "GEMINI_UPSTREAM_ERROR",
          error: `Gagal terhubung ke layanan AI: ${message}`,
          detail: message,
        };
      }
    }
  }

  if (!rawText) {
    return (
      lastFailure ?? {
        ok: false,
        status: 502,
        code: "GEMINI_EMPTY_RESPONSE",
        error: "Layanan AI tidak mengembalikan draf soal. Periksa GEMINI_API_KEY / GEMINI_MODEL atau coba lagi.",
      }
    );
  }

  const parsed = extractJsonObject(rawText);
  if (!parsed) {
    logger.error("[CBT AI] Respons AI bukan JSON valid", {
      provider,
      model: usedModel,
      preview: rawText.slice(0, 400),
    });
    return {
      ok: false,
      status: 502,
      code: "GEMINI_INVALID_JSON",
      error: "Format respons dari Gemini AI tidak berupa JSON yang valid (kemungkinan terpotong). Coba kurangi jumlah soal atau generate ulang.",
    };
  }

  const butirSoal = normalizeGeneratedQuestions(parsed.butirSoal ?? parsed.soal ?? parsed.questions);
  if (butirSoal.length === 0) {
    logger.error("[CBT AI] JSON AI valid tetapi tidak menghasilkan butir soal lengkap", {
      provider,
      model: usedModel,
      keys: Object.keys(parsed),
    });
    return {
      ok: false,
      status: 502,
      code: "GEMINI_EMPTY_QUESTIONS",
      error: "AI belum menghasilkan butir soal pilihan ganda yang lengkap (wajib memiliki teks soal & opsi A–D). Coba ulangi dengan topik lebih spesifik.",
    };
  }

  const defaultTitle = `${input.kategori === "UJIAN_AKHIR" ? "Ujian Akhir / UPK" : input.kategori} ${input.mapelNama} — ${input.kelasNama}`;
  const judulPaket = cleanText(parsed.judulPaket ?? parsed.judul ?? parsed.title, 180) || defaultTitle;
  const deskripsiPaket = cleanText(parsed.deskripsiPaket ?? parsed.deskripsi ?? parsed.description, 600);

  return {
    ok: true,
    provider,
    model: usedModel,
    draft: {
      judulPaket,
      deskripsiPaket,
      butirSoal,
    },
  };
}
