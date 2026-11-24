import { useEffect, useState } from "react";

/**
 * Strictly validates an external HTTP(S) URL without embedded credentials.
 * Blocks javascript:, data:, vbscript:, file:, and malformed URLs.
 */
export function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export type SafePreviewTarget =
  | { kind: "pdf"; safeUrl: string }
  | { kind: "image"; safeUrl: string }
  | { kind: "link"; safeUrl: string }
  | { kind: "invalid" };

/**
 * Classifies and sanitizes a document preview URL (PDF/image data URL or HTTP(S) URL).
 * Prevents XSS bypasses such as `javascript:alert(1)//.pdf` or `data:text/html,...#.pdf`.
 */
export function classifySafePreviewUrl(raw: string | null | undefined): SafePreviewTarget {
  if (typeof raw !== "string") return { kind: "invalid" };
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid" };

  if (/^data:application\/pdf;base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    if (compact.length <= 2_500_000) {
      return { kind: "pdf", safeUrl: compact };
    }
    return { kind: "invalid" };
  }

  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    if (compact.length <= 2_500_000) {
      return { kind: "image", safeUrl: compact };
    }
    return { kind: "invalid" };
  }

  const httpUrl = sanitizeHttpUrl(trimmed);
  if (!httpUrl) return { kind: "invalid" };

  try {
    const pathname = new URL(httpUrl).pathname.toLowerCase();
    if (pathname.endsWith(".pdf")) {
      return { kind: "pdf", safeUrl: httpUrl };
    }
    if (/\.(png|jpe?g|webp|gif)$/i.test(pathname)) {
      return { kind: "image", safeUrl: httpUrl };
    }
  } catch {
    return { kind: "invalid" };
  }

  return { kind: "link", safeUrl: httpUrl };
}

/**
 * Shared helper for optional dev-sandbox role headers.
 */
export function buildSandboxHeaders(
  sandboxRole?: "ADMIN" | "GURU" | "SISWA",
  extra?: Record<string, string>,
): Record<string, string> | undefined {
  if (!sandboxRole && !extra) return undefined;
  return {
    ...(extra ?? {}),
    ...(sandboxRole ? { "X-Dev-Sandbox-Role": sandboxRole } : {}),
  };
}

/**
 * Debounces rapidly changing values (e.g. search queries) to prevent per-keystroke API storms.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
