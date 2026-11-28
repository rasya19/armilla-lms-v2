import { randomUUID } from "crypto";

type ParsedDataUrl = {
  mime: string;
  ext: string;
  buffer: Buffer;
};

const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function hasValidMagicBytes(mime: string, buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/pjpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === "image/png") {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === "image/webp") {
    return buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mime === "application/pdf") {
    return buf.subarray(0, 4).toString("ascii") === "%PDF";
  }
  return false;
}

export function parseValidatedDataUrl(raw: string): ParsedDataUrl | null {
  const compact = raw.trim().replace(/\s+/g, "");
  const match = compact.match(/^data:(image\/(?:jpeg|jpg|pjpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = ALLOWED_MIME_EXT[mime];
  if (!ext) return null;
  const buffer = Buffer.from(match[2], "base64");
  const maxBytes = mime === "application/pdf" ? 15 * 1024 * 1024 : 3 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > maxBytes) return null;
  if (!hasValidMagicBytes(mime, buffer)) return null;
  return { mime: mime === "image/jpg" || mime === "image/pjpeg" ? "image/jpeg" : mime, ext, buffer };
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function buildTenantObjectPath(sekolahId: string, category: "tugas" | "verval", ext: string): string {
  const safeTenant = sekolahId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "tenant";
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${safeTenant}/${category}/${ym}/${randomUUID()}.${ext}`;
}

/**
 * Uploads a validated base64 data URL to Supabase Storage when configured,
 * returning a lightweight public HTTPS URL to save PostgreSQL egress & storage.
 * Falls back safely to the original data URL when Supabase Storage env vars are not set.
 */
export async function offloadDataUrlToSupabaseStorage(options: {
  value: string | null | undefined;
  sekolahId: string;
  category: "tugas" | "verval";
}): Promise<string | null> {
  const raw = options.value?.trim() ?? "";
  if (!raw) return null;
  if (!/^data:/i.test(raw)) return raw;
  if (!isSupabaseStorageConfigured()) return raw;

  const parsed = parseValidatedDataUrl(raw);
  if (!parsed) return raw;

  const baseUrl = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "lms-uploads").trim();
  const objectPath = buildTenantObjectPath(options.sekolahId, options.category, parsed.ext);

  try {
    const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`;
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": parsed.mime,
        "x-upsert": "true",
      },
      body: new Uint8Array(parsed.buffer),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
    }

    // Attempt one-time bucket creation if bucket does not exist yet (404 / 400)
    if (response.status === 404 || response.status === 400) {
      await fetch(`${baseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
        signal: AbortSignal.timeout(8_000),
      }).catch(() => undefined);

      const retry = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": parsed.mime,
          "x-upsert": "true",
        },
        body: new Uint8Array(parsed.buffer),
        signal: AbortSignal.timeout(15_000),
      });
      if (retry.ok) {
        return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
      }
    }
  } catch (error) {
    console.warn("Upload ke Supabase Storage gagal, menggunakan fallback aman:", error instanceof Error ? error.message : "UnknownError");
  }

  return raw;
}
