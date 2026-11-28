export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"]);
export const ALLOWED_PDF_MIMES = new Set(["application/pdf"]);

const IMAGE_DATA_URL_REGEX = /^data:(image\/(?:jpeg|jpg|pjpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i;
const PDF_DATA_URL_REGEX = /^data:(application\/pdf);base64,([A-Za-z0-9+/=]+)$/i;

export function estimateBase64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function isBlockedPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const rfc1918 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (rfc1918) {
    const secondOctet = Number(rfc1918[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  return false;
}

export function validateSafeExternalUrl(
  raw: unknown,
  options?: { allowHttp?: boolean; allowRelative?: boolean; maxLength?: number },
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const maxLength = options?.maxLength ?? 2000;
  if (!trimmed || trimmed.length > maxLength) return null;
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return null;

  if (options?.allowRelative && trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.includes("\\")) return null;
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const allowedProtocol = options?.allowHttp
      ? parsed.protocol === "https:" || parsed.protocol === "http:"
      : parsed.protocol === "https:";
    if (!allowedProtocol) return null;
    if (parsed.username || parsed.password) return null;
    if (isBlockedPrivateHost(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export type AttachmentValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export function validateImageAttachment(
  raw: unknown,
  options?: { maxBytes?: number; allowRelative?: boolean; allowHttp?: boolean },
): AttachmentValidationResult {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Format lampiran gambar tidak valid." };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  const maxBytes = options?.maxBytes ?? MAX_IMAGE_BYTES;

  if (/^data:/i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    const match = compact.match(IMAGE_DATA_URL_REGEX);
    if (!match) {
      return {
        ok: false,
        error: "Hanya gambar berformat JPEG, PNG, atau WebP yang diperbolehkan.",
      };
    }
    const mime = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      return {
        ok: false,
        error: "Hanya gambar berformat JPEG, PNG, atau WebP yang diperbolehkan.",
      };
    }
    const byteSize = estimateBase64ByteLength(match[2]);
    if (byteSize <= 0) {
      return { ok: false, error: "Data gambar kosong atau rusak." };
    }
    if (byteSize > maxBytes) {
      const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
      return { ok: false, error: `Ukuran gambar melebihi batas maksimal ${mb} MB.` };
    }
    return { ok: true, value: compact };
  }

  const safeUrl = validateSafeExternalUrl(trimmed, {
    allowHttp: options?.allowHttp ?? false,
    allowRelative: options?.allowRelative ?? false,
  });
  if (!safeUrl) {
    return {
      ok: false,
      error: "Tautan gambar harus berupa URL HTTPS yang valid atau data gambar JPEG/PNG/WebP (maks. 3 MB).",
    };
  }
  return { ok: true, value: safeUrl };
}

export function validatePdfAttachment(
  raw: unknown,
  options?: { maxBytes?: number; allowRelative?: boolean; allowHttp?: boolean },
): AttachmentValidationResult {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Format berkas PDF tidak valid." };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  const maxBytes = options?.maxBytes ?? MAX_PDF_BYTES;

  if (/^data:/i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    const match = compact.match(PDF_DATA_URL_REGEX);
    if (!match) {
      return { ok: false, error: "Hanya berkas berformat PDF (application/pdf) yang diperbolehkan." };
    }
    const byteSize = estimateBase64ByteLength(match[2]);
    if (byteSize <= 0) {
      return { ok: false, error: "Data PDF kosong atau rusak." };
    }
    if (byteSize > maxBytes) {
      const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
      return { ok: false, error: `Ukuran berkas PDF melebihi batas maksimal ${mb} MB.` };
    }
    return { ok: true, value: compact };
  }

  const safeUrl = validateSafeExternalUrl(trimmed, {
    allowHttp: options?.allowHttp ?? false,
    allowRelative: options?.allowRelative ?? false,
  });
  if (!safeUrl) {
    return {
      ok: false,
      error: "Tautan modul PDF harus berupa URL HTTPS yang valid atau berkas PDF (maks. 15 MB).",
    };
  }
  return { ok: true, value: safeUrl };
}

export function validateDocumentAttachment(
  raw: unknown,
  options?: { allowRelative?: boolean; allowHttp?: boolean },
): AttachmentValidationResult {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Format berkas dokumen tidak valid." };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  if (/^data:application\/pdf;/i.test(trimmed)) {
    return validatePdfAttachment(trimmed, { maxBytes: MAX_PDF_BYTES });
  }
  if (/^data:/i.test(trimmed)) {
    return validateImageAttachment(trimmed, { maxBytes: MAX_IMAGE_BYTES });
  }
  const safeUrl = validateSafeExternalUrl(trimmed, {
    allowHttp: options?.allowHttp ?? false,
    allowRelative: options?.allowRelative ?? true,
  });
  if (!safeUrl) {
    return {
      ok: false,
      error: "Berkas harus berupa tautan HTTPS yang aman, gambar (JPEG/PNG/WebP maks. 3 MB), atau PDF (maks. 15 MB).",
    };
  }
  return { ok: true, value: safeUrl };
}

export function validateUploadMetadata(input: {
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "pdf";
}): { ok: true } | { ok: false; error: string } {
  const mime = (input.mimeType || "").trim().toLowerCase();
  const size = input.sizeBytes;
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Ukuran berkas tidak valid." };
  }
  if (input.kind === "image") {
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      return { ok: false, error: "Tipe gambar hanya boleh JPEG, PNG, atau WebP." };
    }
    if (size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Ukuran gambar maksimal 3 MB." };
    }
    return { ok: true };
  }
  if (!ALLOWED_PDF_MIMES.has(mime)) {
    return { ok: false, error: "Tipe dokumen hanya boleh application/pdf." };
  }
  if (size > MAX_PDF_BYTES) {
    return { ok: false, error: "Ukuran berkas PDF maksimal 15 MB." };
  }
  return { ok: true };
}
