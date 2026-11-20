export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export class FetchTimeoutError extends Error {
  constructor(message = "Koneksi ke server melebihi batas waktu (timeout). Silakan coba lagi.") {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

export function isCallerAborted(error: unknown, callerSignal?: AbortSignal): boolean {
  if (callerSignal?.aborted) return true;
  if (error instanceof DOMException && error.name === "AbortError" && callerSignal?.aborted) {
    return true;
  }
  return false;
}

export function describeFetchError(
  error: unknown,
  fallback = "Permintaan ke server gagal. Silakan coba lagi.",
): string {
  if (error instanceof FetchTimeoutError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return "Server tidak dapat dihubungi. Periksa koneksi jaringan Anda lalu coba lagi.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const callerSignal = init.signal ?? undefined;
  if (callerSignal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut && !callerSignal?.aborted) {
      throw new FetchTimeoutError();
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}
