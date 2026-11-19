import type { Registration } from "./school-registration.js";
import { RegistrationDeliveryError } from "./registration-delivery-error.js";

function registrationEndpoint(value: string | undefined, production: boolean): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.pathname !== "/api/lms-registrations" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (production
        ? url.protocol !== "https:"
        : url.protocol !== "https:" &&
          !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function forwardRegistrationToMaster(
  registrationId: string,
  data: Registration,
  options: {
    endpoint?: string;
    token?: string;
    production: boolean;
    fetcher?: typeof fetch;
  } = {
    endpoint: process.env.MASTER_ADMIN_REGISTRATION_URL,
    token: process.env.MASTER_ADMIN_REGISTRATION_TOKEN,
    production: process.env.NODE_ENV === "production",
  },
): Promise<void> {
  const endpoint = registrationEndpoint(options.endpoint, options.production);
  if (!endpoint || !options.token?.trim()) {
    throw new RegistrationDeliveryError(
      503,
      "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
      "Integrasi ke Rasyatech Admin belum dikonfigurasi.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await (options.fetcher || fetch)(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({
        registrationId,
        institutionName: data.namaSekolah,
        npsn: data.npsn,
        region: data.wilayah,
        adminName: data.namaKontak,
        adminEmail: data.emailKontak,
        adminPhone: data.teleponKontak,
        ...(data.paket
          ? {
              plan: data.paket,
              paket: data.paket,
              ...(typeof data.nominalTahunan === "number"
                ? { annualPrice: data.nominalTahunan, nominalTahunan: data.nominalTahunan }
                : {}),
            }
          : {}),
      }),
      signal: controller.signal,
    });
    const result: unknown = await response.json().catch(() => null);
    if (
      response.status === 409
    ) {
      throw new RegistrationDeliveryError(
        409,
        "MASTER_ADMIN_REGISTRATION_CONFLICT",
        "NPSN ini sudah terdaftar di Rasyatech Admin.",
      );
    }
    if (
      !response.ok ||
      typeof result !== "object" ||
      result === null ||
      !("success" in result) ||
      result.success !== true
    ) {
      throw new RegistrationDeliveryError(
        503,
        "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
        "Pendaftaran belum berhasil diteruskan ke Rasyatech Admin. Coba lagi nanti.",
      );
    }
  } catch (error) {
    if (error instanceof RegistrationDeliveryError) throw error;
    throw new RegistrationDeliveryError(
      503,
      "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
      controller.signal.aborted
        ? "Koneksi ke Rasyatech Admin timeout. Coba lagi nanti."
        : "Rasyatech Admin tidak dapat dihubungi. Coba lagi nanti.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export type { Registration };
