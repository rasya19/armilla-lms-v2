import { MAX_IMAGE_BYTES, validateImageAttachment } from "./upload-validation.js";

function object(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.trim()) return null;
  return text(value, max) ?? undefined;
}

function optionalLink(value: unknown): string | null | undefined {
  const result = optionalText(value, 2000);
  if (result === null || result === undefined) return result;
  try {
    const url = new URL(result);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseLearningContent(input: unknown, kind: "materi" | "tugas") {
  const data = object(input);
  if (!data) return null;
  const jadwalId = text(data.jadwalId, 100);
  const kelasId = text(data.kelasId, 100);
  const mapelId = text(data.mapelId, 100);
  const judul = text(data.judul, 200);
  const isi = optionalText(data.isi, 5000);
  if ((!jadwalId && (!kelasId || !mapelId)) || !judul || isi === undefined) return null;
  if (kind === "materi") {
    const tautan = optionalLink(data.tautan);
    if (tautan === undefined || (!isi && !tautan)) return null;
    return { jadwalId, kelasId, mapelId, judul, isi, tautan, batasWaktu: null };
  }
  if (!isi || typeof data.batasWaktu !== "string") return null;
  let batasWaktu: Date | null = null;
  if (data.batasWaktu) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.batasWaktu)) return null;
    batasWaktu = new Date(data.batasWaktu);
    if (Number.isNaN(batasWaktu.getTime()) || batasWaktu.toISOString() !== data.batasWaktu) return null;
  }
  return { jadwalId, kelasId, mapelId, judul, isi, tautan: null, batasWaktu };
}

export function parseLearningContentUpdate(input: unknown, kind: "materi" | "tugas") {
  const data = object(input);
  if (!data) return null;
  const judul = text(data.judul, 200);
  const isi = optionalText(data.isi, 5000);
  if (!judul || isi === undefined) return null;
  if (kind === "materi") {
    const tautan = optionalLink(data.tautan);
    if (tautan === undefined || (!isi && !tautan)) return null;
    return { judul, isi, tautan, batasWaktu: null };
  }
  if (!isi || (data.batasWaktu !== null && typeof data.batasWaktu !== "string")) return null;
  let batasWaktu: Date | null = null;
  if (typeof data.batasWaktu === "string" && data.batasWaktu) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.batasWaktu)) return null;
    batasWaktu = new Date(data.batasWaktu);
    if (Number.isNaN(batasWaktu.getTime()) || batasWaktu.toISOString() !== data.batasWaktu) return null;
  }
  return { judul, isi, tautan: null, batasWaktu };
}

function optionalSubmissionPhoto(value: unknown): string | null | undefined {
  const checked = validateImageAttachment(value, { maxBytes: MAX_IMAGE_BYTES });
  return checked.ok ? checked.value : undefined;
}

export function parseSubmission(input: unknown) {
  const data = object(input);
  if (!data) return null;
  const rawJawaban = data.jawaban ?? data.jawabanTeks;
  const rawTautan = data.tautan ?? data.tautanUrl;
  const rawPhoto = data.attachmentPhotoUrl ?? data.fotoUrl ?? data.photoDataUrl;

  const jawaban = rawJawaban === undefined || rawJawaban === null ? null : optionalText(rawJawaban, 5000);
  const tautan = rawTautan === undefined || rawTautan === null ? null : optionalLink(rawTautan);
  const attachmentPhotoUrl = optionalSubmissionPhoto(rawPhoto);

  if (jawaban === undefined || tautan === undefined || attachmentPhotoUrl === undefined) return null;
  if (!jawaban && !tautan && !attachmentPhotoUrl) return null;
  return { jawaban, tautan, attachmentPhotoUrl };
}

export function parseGrade(input: unknown) {
  const data = object(input);
  if (!data || typeof data.nilai !== "number" || !Number.isFinite(data.nilai) || data.nilai < 0 || data.nilai > 100) return null;
  const catatanGuru = optionalText(data.catatanGuru, 2000);
  if (catatanGuru === undefined) return null;
  return { nilai: data.nilai, catatanGuru };
}
