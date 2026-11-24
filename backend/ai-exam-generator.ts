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

export function resolveGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || "gemini-2.5-flash";
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

export function normalizeGeneratedQuestions(rawList: unknown): GeneratedExamQuestion[] {
  if (!Array.isArray(rawList)) return [];
  const results: GeneratedExamQuestion[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const teks = cleanText(obj.teks ?? obj.pertanyaan ?? obj.soal, 4000);
    const opsiA = cleanText(obj.opsiA ?? obj.a, 1000);
    const opsiB = cleanText(obj.opsiB ?? obj.b, 1000);
    const opsiC = cleanText(obj.opsiC ?? obj.c, 1000);
    const opsiD = cleanText(obj.opsiD ?? obj.d, 1000);
    const opsiE = cleanText(obj.opsiE ?? obj.e, 1000);
    if (!teks || !opsiA || !opsiB || !opsiC || !opsiD) continue;

    const rawKey = cleanText(obj.kunciJawaban ?? obj.kunci ?? obj.jawabanBenar, 10).toUpperCase();
    const validKey: "A" | "B" | "C" | "D" | "E" =
      rawKey === "B" || rawKey === "C" || rawKey === "D" || (rawKey === "E" && Boolean(opsiE))
        ? rawKey
        : "A";

    results.push({
      teks,
      opsiA,
      opsiB,
      opsiC,
      opsiD,
      opsiE,
      kunciJawaban: validKey,
      pembahasan: cleanText(obj.pembahasan, 2000),
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

export async function generateExamDraftWithAi(input: {
  kategori: AiExamCategory;
  kelasNama: string;
  mapelNama: string;
  topik: string;
  jumlahSoal: number;
  schoolName?: string;
}): Promise<{ ok: true; draft: GeneratedExamDraft; provider: "gemini" | "openrouter" } | { ok: false; status: number; error: string }> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!geminiKey && !openRouterKey) {
    return {
      ok: false,
      status: 503,
      error: "GEMINI_API_KEY belum dikonfigurasi pada server. Atur kunci API Google AI Studio di Environment Variables untuk mengaktifkan Generate Soal AI.",
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

  if (geminiKey) {
    const model = resolveGeminiModel();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(25_000),
        },
      );

      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        rawText = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
        provider = "gemini";
      } else if (response.status === 429) {
        return { ok: false, status: 429, error: "Kuota permintaan Gemini AI sedang penuh. Tunggu beberapa saat lalu coba lagi." };
      } else if ((response.status === 401 || response.status === 403) && !openRouterKey) {
        return { ok: false, status: 502, error: "Kunci GEMINI_API_KEY tidak valid atau ditolak. Periksa pengaturan Environment Variables." };
      }
    } catch {
      // Fall through to OpenRouter fallback if configured
    }
  }

  if (!rawText && openRouterKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        rawText = json.choices?.[0]?.message?.content?.trim() ?? "";
        provider = "openrouter";
      } else if (response.status === 429) {
        return { ok: false, status: 429, error: "Kuota permintaan AI sedang penuh. Coba lagi beberapa saat." };
      }
    } catch {
      // Handled below
    }
  }

  if (!rawText) {
    return {
      ok: false,
      status: 502,
      error: "Layanan AI tidak mengembalikan draf soal. Periksa GEMINI_API_KEY / GEMINI_MODEL atau coba lagi.",
    };
  }

  const parsed = extractJsonObject(rawText);
  if (!parsed) {
    return { ok: false, status: 502, error: "Format respons AI tidak dapat dibaca. Silakan coba generate ulang." };
  }

  const butirSoal = normalizeGeneratedQuestions(parsed.butirSoal ?? parsed.soal);
  if (butirSoal.length === 0) {
    return { ok: false, status: 502, error: "AI belum menghasilkan butir soal yang valid. Coba ulangi dengan topik lebih spesifik." };
  }

  const defaultTitle = `${input.kategori === "UJIAN_AKHIR" ? "Ujian Akhir / UPK" : input.kategori} ${input.mapelNama} — ${input.kelasNama}`;
  const judulPaket = cleanText(parsed.judulPaket ?? parsed.judul, 180) || defaultTitle;
  const deskripsiPaket = cleanText(parsed.deskripsiPaket ?? parsed.deskripsi, 600);

  return {
    ok: true,
    provider,
    draft: {
      judulPaket,
      deskripsiPaket,
      butirSoal,
    },
  };
}
