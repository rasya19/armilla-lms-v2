import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Router, type Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { normalizeTenantPlan, type TenantPlan } from "./plan-utils.js";
import { cleanText } from "./school-modules-shared.js";

export type DuitkuEnvironment = "sandbox" | "production";

export interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  environment: DuitkuEnvironment;
  siteUrl: string;
  callbackUrl: string;
  configured: boolean;
}

export const DUITKU_ENDPOINTS: Record<DuitkuEnvironment, { createInvoice: string; transactionStatus: string }> = {
  sandbox: {
    createInvoice: "https://api-sandbox.duitku.com/api/merchant/createInvoice",
    transactionStatus: "https://sandbox.duitku.com/webapi/api/merchant/transactionStatus",
  },
  production: {
    createInvoice: "https://api-prod.duitku.com/api/merchant/createInvoice",
    transactionStatus: "https://passport.duitku.com/webapi/api/merchant/transactionStatus",
  },
};

export function normalizeDuitkuEnv(raw: string | undefined): DuitkuEnvironment {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value === "production" || value === "prod" || value === "live") {
    return "production";
  }
  return "sandbox";
}

function normalizeSiteUrl(raw: string | undefined): string {
  const candidate = raw?.trim() || "https://pkbm.siput.id";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin;
    }
  } catch {
    // fallback to default SIPUT PKBM URL
  }
  return "https://pkbm.siput.id";
}

export function getDuitkuConfig(env: NodeJS.ProcessEnv = process.env): DuitkuConfig {
  const merchantCode = env.DUITKU_MERCHANT_CODE?.trim() || "";
  const apiKey = env.DUITKU_API_KEY?.trim() || "";
  const environment = normalizeDuitkuEnv(env.DUITKU_ENV);
  const siteUrl = normalizeSiteUrl(env.DUITKU_SITE_URL || env.APP_ORIGIN || "https://pkbm.siput.id");
  const callbackUrl = env.DUITKU_CALLBACK_URL?.trim() || `${siteUrl}/api/payment/callback`;

  return {
    merchantCode,
    apiKey,
    environment,
    siteUrl,
    callbackUrl,
    configured: Boolean(merchantCode && apiKey),
  };
}

/**
 * Generates Duitku POP x-duitku-signature: SHA256(merchantCode + timestamp + apiKey).
 */
export function createDuitkuPopSignature(merchantCode: string, timestamp: string, apiKey: string): string {
  return createHash("sha256").update(`${merchantCode}${timestamp}${apiKey}`).digest("hex");
}

/**
 * Generates Duitku Transaction Status signature: MD5(merchantCode + merchantOrderId + apiKey).
 */
export function createDuitkuStatusSignature(merchantCode: string, merchantOrderId: string, apiKey: string): string {
  return createHash("md5").update(`${merchantCode}${merchantOrderId}${apiKey}`).digest("hex");
}

/**
 * Verifies Duitku callback signature: MD5(merchantCode + amount + merchantOrderId + apiKey).
 */
export function verifyDuitkuCallbackSignature(input: {
  merchantCode: string;
  amount: string;
  merchantOrderId: string;
  signature: string;
  apiKey: string;
}): boolean {
  if (!input.merchantCode || !input.amount || !input.merchantOrderId || !input.signature || !input.apiKey) {
    return false;
  }
  const expected = createHash("md5")
    .update(`${input.merchantCode}${input.amount}${input.merchantOrderId}${input.apiKey}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Generates a unique Duitku-safe merchantOrderId (max 50 characters).
 * Format: SUB-<slug-prefix>-<plan>-<8-hex>
 */
export function buildSubscriptionOrderId(slug: string, plan: TenantPlan): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 26) || "tenant";
  const suffix = randomBytes(4).toString("hex");
  return `SUB-${safeSlug}-${plan}-${suffix}`;
}

/**
 * Builds white-label tenant return URL so school admins return to their own subdomain after payment.
 */
export function resolveTenantReturnUrl(input: {
  slug: string;
  orderId: string;
  requestOrigin?: string | null;
  requestHost?: string | null;
  siteUrl?: string;
}): string {
  const baseSiteUrl = normalizeSiteUrl(input.siteUrl);
  const query = `/?payment=return&orderId=${encodeURIComponent(input.orderId)}`;

  if (input.requestOrigin) {
    try {
      const parsed = new URL(input.requestOrigin);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname) {
        return `${parsed.origin}${query}`;
      }
    } catch {
      // ignore invalid origin
    }
  }

  if (input.requestHost) {
    const cleanHost = input.requestHost.trim().toLowerCase();
    if (/^[a-z0-9.-]+(?::\d+)?$/.test(cleanHost)) {
      const proto = cleanHost.startsWith("localhost") || cleanHost.startsWith("127.0.0.1") ? "http" : "https";
      return `${proto}://${cleanHost}${query}`;
    }
  }

  try {
    const base = new URL(baseSiteUrl);
    const rootDomain = base.hostname.replace(/^www\./, "");
    const safeSlug = input.slug.trim().toLowerCase();
    if (safeSlug && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(safeSlug)) {
      return `${base.protocol}//${safeSlug}.${rootDomain}${query}`;
    }
  } catch {
    // ignore
  }

  return `${baseSiteUrl}${query}`;
}

export interface CreateDuitkuInvoiceInput {
  config: DuitkuConfig;
  merchantOrderId: string;
  paymentAmount: number;
  productDetails: string;
  customerVaName: string;
  email: string;
  phoneNumber?: string | null;
  additionalParam?: string;
  merchantUserInfo?: string;
  returnUrl: string;
  expiryPeriodMinutes?: number;
}

export interface CreateDuitkuInvoiceResult {
  ok: boolean;
  paymentUrl: string | null;
  reference: string | null;
  statusCode: string | null;
  statusMessage: string | null;
  error?: string;
}

export async function createDuitkuInvoice(
  input: CreateDuitkuInvoiceInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateDuitkuInvoiceResult> {
  if (!input.config.configured) {
    return {
      ok: false,
      paymentUrl: null,
      reference: null,
      statusCode: null,
      statusMessage: null,
      error: "DUITKU_MERCHANT_CODE atau DUITKU_API_KEY belum dikonfigurasi.",
    };
  }

  const endpoint = DUITKU_ENDPOINTS[input.config.environment].createInvoice;
  const timestamp = String(Date.now());
  const signature = createDuitkuPopSignature(input.config.merchantCode, timestamp, input.config.apiKey);

  const payload = {
    paymentAmount: Math.round(input.paymentAmount),
    merchantOrderId: input.merchantOrderId,
    productDetails: input.productDetails.slice(0, 255),
    additionalParam: (input.additionalParam ?? "").slice(0, 255),
    merchantUserInfo: (input.merchantUserInfo ?? "").slice(0, 255),
    customerVaName: (input.customerVaName || "Admin Lembaga").slice(0, 20),
    email: input.email,
    phoneNumber: input.phoneNumber || "",
    itemDetails: [
      {
        name: input.productDetails.slice(0, 50),
        price: Math.round(input.paymentAmount),
        quantity: 1,
      },
    ],
    callbackUrl: input.config.callbackUrl,
    returnUrl: input.returnUrl,
    expiryPeriod: input.expiryPeriodMinutes ?? 1440,
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-duitku-signature": signature,
        "x-duitku-timestamp": timestamp,
        "x-duitku-merchantcode": input.config.merchantCode,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json().catch(() => null)) as {
      paymentUrl?: string;
      reference?: string;
      statusCode?: string;
      statusMessage?: string;
      Message?: string;
    } | null;

    if (!response.ok || !data?.paymentUrl) {
      return {
        ok: false,
        paymentUrl: null,
        reference: data?.reference ?? null,
        statusCode: data?.statusCode ?? String(response.status),
        statusMessage: data?.statusMessage ?? data?.Message ?? null,
        error: data?.statusMessage || data?.Message || `Duitku mengembalikan status HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      paymentUrl: data.paymentUrl,
      reference: data.reference ?? null,
      statusCode: data.statusCode ?? "00",
      statusMessage: data.statusMessage ?? "SUCCESS",
    };
  } catch (error) {
    return {
      ok: false,
      paymentUrl: null,
      reference: null,
      statusCode: null,
      statusMessage: null,
      error: error instanceof Error ? error.message : "Gagal menghubungi layanan Duitku.",
    };
  }
}

export async function checkDuitkuTransactionStatus(
  config: DuitkuConfig,
  merchantOrderId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  ok: boolean;
  statusCode: string | null;
  statusMessage: string | null;
  amount: string | null;
  reference: string | null;
  error?: string;
}> {
  if (!config.configured) {
    return {
      ok: false,
      statusCode: null,
      statusMessage: null,
      amount: null,
      reference: null,
      error: "Konfigurasi Duitku belum lengkap.",
    };
  }

  const endpoint = DUITKU_ENDPOINTS[config.environment].transactionStatus;
  const signature = createDuitkuStatusSignature(config.merchantCode, merchantOrderId, config.apiKey);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchantCode: config.merchantCode,
        merchantOrderId,
        signature,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json().catch(() => null)) as {
      statusCode?: string;
      statusMessage?: string;
      amount?: string | number;
      reference?: string;
      Message?: string;
    } | null;

    if (!response.ok || !data) {
      return {
        ok: false,
        statusCode: null,
        statusMessage: data?.Message ?? null,
        amount: null,
        reference: null,
        error: data?.Message || `Duitku status check HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      statusCode: typeof data.statusCode === "string" ? data.statusCode : null,
      statusMessage: typeof data.statusMessage === "string" ? data.statusMessage : null,
      amount: data.amount !== undefined && data.amount !== null ? String(data.amount) : null,
      reference: typeof data.reference === "string" ? data.reference : null,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      statusMessage: null,
      amount: null,
      reference: null,
      error: error instanceof Error ? error.message : "Gagal memeriksa status transaksi Duitku.",
    };
  }
}

export interface SettlePaymentInput {
  merchantOrderId: string;
  resultCode: string;
  amount: number | null;
  reference?: string | null;
  paymentCode?: string | null;
  publisherOrderId?: string | null;
  settlementDate?: string | null;
  callbackPayload?: Record<string, unknown>;
  fallbackPlanDays?: (plan: TenantPlan) => number;
  onActivated?: (info: {
    sekolahId: string;
    schoolName: string;
    adminPhone: string | null;
    plan: TenantPlan;
    nextExpiry: Date;
    merchantOrderId: string;
    amount: number;
  }) => Promise<void> | void;
}

export type SettlePaymentOutcome =
  | { ok: true; status: "PAID"; alreadyPaid: boolean; sekolahId: string; plan: TenantPlan; expiresAt: string }
  | { ok: true; status: "FAILED" | "EXPIRED" | "PENDING"; sekolahId: string }
  | { ok: false; httpStatus: number; error: string };

export async function settleSubscriptionPayment(input: SettlePaymentInput): Promise<SettlePaymentOutcome> {
  const existing = await prisma.pembayaranLangganan.findUnique({
    where: { merchantOrderId: input.merchantOrderId },
    include: {
      sekolah: {
        select: { id: true, nama: true, slug: true, expiresAt: true, adminPhone: true },
      },
    },
  });

  if (!existing) {
    return { ok: false, httpStatus: 404, error: "Transaksi pembayaran tidak ditemukan." };
  }

  if (input.amount !== null && Number.isFinite(input.amount) && Math.round(input.amount) !== existing.amount) {
    return { ok: false, httpStatus: 400, error: "Nominal pembayaran tidak sesuai dengan tagihan." };
  }

  if (existing.status === "PAID") {
    return {
      ok: true,
      status: "PAID",
      alreadyPaid: true,
      sekolahId: existing.sekolahId,
      plan: normalizeTenantPlan(existing.plan),
      expiresAt: existing.sekolah.expiresAt ? existing.sekolah.expiresAt.toISOString() : new Date().toISOString(),
    };
  }

  const normalizedCode = input.resultCode.trim();
  const safePayload = input.callbackPayload
    ? (JSON.parse(JSON.stringify(input.callbackPayload)) as Prisma.InputJsonValue)
    : undefined;

  if (normalizedCode === "00") {
    const plan = normalizeTenantPlan(existing.plan);
    const durationDays = existing.durationDays > 0 ? existing.durationDays : (input.fallbackPlanDays?.(plan) ?? 365);

    const txResult = await prisma.$transaction(async (tx) => {
      const current = await tx.pembayaranLangganan.findUnique({
        where: { id: existing.id },
        select: { status: true, sekolahId: true },
      });
      if (!current) {
        return null;
      }
      if (current.status === "PAID") {
        const currentSchool = await tx.sekolah.findUnique({
          where: { id: current.sekolahId },
          select: { expiresAt: true },
        });
        return {
          alreadyPaid: true,
          nextExpiry: currentSchool?.expiresAt ?? new Date(),
        };
      }

      const school = await tx.sekolah.findUnique({
        where: { id: current.sekolahId },
        select: { id: true, nama: true, expiresAt: true, adminPhone: true },
      });
      if (!school) return null;

      const now = new Date();
      const anchor = school.expiresAt && school.expiresAt > now ? school.expiresAt : now;
      const nextExpiry = new Date(anchor.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await tx.pembayaranLangganan.update({
        where: { id: existing.id },
        data: {
          status: "PAID",
          resultCode: normalizedCode,
          reference: input.reference || existing.reference,
          paymentMethod: input.paymentCode || existing.paymentMethod,
          publisherOrderId: input.publisherOrderId || existing.publisherOrderId,
          settlementDate: input.settlementDate || existing.settlementDate,
          paidAt: now,
          ...(safePayload ? { callbackPayload: safePayload } : {}),
        },
      });

      await tx.sekolah.update({
        where: { id: school.id },
        data: {
          plan,
          status: "ACTIVE",
          expiresAt: nextExpiry,
        },
      });

      return {
        alreadyPaid: false,
        nextExpiry,
        schoolName: school.nama,
        adminPhone: school.adminPhone,
      };
    });

    if (!txResult) {
      return { ok: false, httpStatus: 404, error: "Tenant sekolah tidak ditemukan." };
    }

    if (!txResult.alreadyPaid && input.onActivated) {
      await input.onActivated({
        sekolahId: existing.sekolahId,
        schoolName: txResult.schoolName ?? existing.sekolah.nama,
        adminPhone: txResult.adminPhone ?? existing.sekolah.adminPhone,
        plan,
        nextExpiry: txResult.nextExpiry,
        merchantOrderId: existing.merchantOrderId,
        amount: existing.amount,
      });
    }

    return {
      ok: true,
      status: "PAID",
      alreadyPaid: txResult.alreadyPaid,
      sekolahId: existing.sekolahId,
      plan,
      expiresAt: txResult.nextExpiry.toISOString(),
    };
  }

  // Duitku callback resultCode "01" = Failed; Transaction Status "02" = Cancelled/Expired; "01" in check status = Pending
  const nextStatus: "FAILED" | "EXPIRED" = normalizedCode === "02" ? "EXPIRED" : "FAILED";
  await prisma.pembayaranLangganan.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      resultCode: normalizedCode,
      reference: input.reference || existing.reference,
      paymentMethod: input.paymentCode || existing.paymentMethod,
      ...(safePayload ? { callbackPayload: safePayload } : {}),
    },
  });

  return {
    ok: true,
    status: nextStatus,
    sekolahId: existing.sekolahId,
  };
}

function readCallbackString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * Duitku Callback Route: POST /api/payment/callback
 * Full URL for SIPUT PKBM: https://pkbm.siput.id/api/payment/callback
 */
export function duitkuCallbackRoutes(options?: {
  onActivated?: SettlePaymentInput["onActivated"];
}) {
  const router = Router();

  router.post("/callback", async (req, res) => {
    const config = getDuitkuConfig();
    if (!config.configured) {
      return res.status(503).json({ error: "Konfigurasi Duitku belum lengkap." });
    }

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const merchantCode = readCallbackString(body, "merchantCode");
    const amountRaw = readCallbackString(body, "amount");
    const merchantOrderId = readCallbackString(body, "merchantOrderId");
    const resultCode = readCallbackString(body, "resultCode");
    const reference = readCallbackString(body, "reference") || null;
    const paymentCode = readCallbackString(body, "paymentCode") || null;
    const publisherOrderId = readCallbackString(body, "publisherOrderId") || null;
    const settlementDate = readCallbackString(body, "settlementDate") || null;
    const signature =
      readCallbackString(body, "signature") ||
      (typeof req.get("x-duitku-signature") === "string" ? req.get("x-duitku-signature")!.trim() : "");

    if (!merchantCode || !amountRaw || !merchantOrderId || !signature) {
      return res.status(400).json({ error: "Parameter callback Duitku tidak lengkap." });
    }

    if (merchantCode !== config.merchantCode) {
      return res.status(403).json({ error: "Merchant code tidak cocok." });
    }

    if (
      !verifyDuitkuCallbackSignature({
        merchantCode,
        amount: amountRaw,
        merchantOrderId,
        signature,
        apiKey: config.apiKey,
      })
    ) {
      return res.status(403).json({ error: "Signature callback Duitku tidak valid." });
    }

    const parsedAmount = Number(amountRaw);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Nominal callback tidak valid." });
    }

    // Strip signature before storing payload in DB audit trail
    const sanitizedPayload: Record<string, unknown> = { ...body };
    delete sanitizedPayload.signature;

    try {
      const outcome = await settleSubscriptionPayment({
        merchantOrderId,
        resultCode: resultCode || "01",
        amount: parsedAmount,
        reference,
        paymentCode,
        publisherOrderId,
        settlementDate,
        callbackPayload: sanitizedPayload,
        onActivated: options?.onActivated,
      });

      if (outcome.ok === false) {
        return res.status(outcome.httpStatus).json({ error: outcome.error });
      }

      return res.status(200).json({
        received: true,
        merchantOrderId,
        ...outcome,
      });
    } catch (error) {
      console.error("Gagal memproses callback pembayaran Duitku:", error);
      return res.status(503).json({ error: "Callback pembayaran belum dapat diproses." });
    }
  });

  return router;
}

/**
 * Master Admin Payment Monitoring Routes: /api/master/pembayaran
 */
export function masterPaymentRoutes(
  getMasterSession: (req: Request) => Promise<{ akunId: string; nama: string } | null>,
  options?: {
    onActivated?: SettlePaymentInput["onActivated"];
  },
) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const master = await getMasterSession(req);
      if (!master) return res.status(401).json({ error: "Sesi Master Admin tidak valid." });

      const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "25"), 10) || 25));
      const statusFilter = cleanText(req.query.status, 20).toUpperCase();
      const envFilter = cleanText(req.query.env, 20).toLowerCase();
      const q = cleanText(req.query.q, 80);

      const where: Prisma.PembayaranLanggananWhereInput = {};
      if (statusFilter && ["PENDING", "PAID", "FAILED", "EXPIRED"].includes(statusFilter)) {
        where.status = statusFilter;
      }
      if (envFilter && ["sandbox", "production"].includes(envFilter)) {
        where.environment = envFilter;
      }
      if (q) {
        where.OR = [
          { merchantOrderId: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { sekolah: { nama: { contains: q, mode: "insensitive" } } },
          { sekolah: { slug: { contains: q, mode: "insensitive" } } },
          { sekolah: { npsn: { contains: q, mode: "insensitive" } } },
        ];
      }

      const [items, total, paidAgg, statusCounts] = await Promise.all([
        prisma.pembayaranLangganan.findMany({
          where,
          include: {
            sekolah: {
              select: {
                id: true,
                nama: true,
                slug: true,
                npsn: true,
                plan: true,
                status: true,
                expiresAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.pembayaranLangganan.count({ where }),
        prisma.pembayaranLangganan.aggregate({
          where: { status: "PAID" },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.pembayaranLangganan.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
      ]);

      const countsByStatus: Record<string, number> = {};
      for (const row of statusCounts) {
        countsByStatus[row.status] = row._count._all;
      }

      const config = getDuitkuConfig();

      return res.json({
        config: {
          provider: "DUITKU",
          configured: config.configured,
          merchantCode: config.merchantCode || null,
          environment: config.environment,
          siteUrl: config.siteUrl,
          callbackUrl: config.callbackUrl,
        },
        summary: {
          totalTransactions: Object.values(countsByStatus).reduce((sum, n) => sum + n, 0),
          paidCount: paidAgg._count._all,
          pendingCount: countsByStatus.PENDING ?? 0,
          failedCount: (countsByStatus.FAILED ?? 0) + (countsByStatus.EXPIRED ?? 0),
          totalRevenue: paidAgg._sum.amount ?? 0,
        },
        items: items.map((item) => ({
          id: item.id,
          merchantOrderId: item.merchantOrderId,
          reference: item.reference,
          publisherOrderId: item.publisherOrderId,
          provider: item.provider,
          environment: item.environment,
          plan: normalizeTenantPlan(item.plan),
          planLabel: item.planLabel,
          durationDays: item.durationDays,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          paymentUrl: item.paymentUrl,
          status: item.status,
          resultCode: item.resultCode,
          customerName: item.customerName,
          customerEmail: item.customerEmail,
          customerPhone: item.customerPhone,
          settlementDate: item.settlementDate,
          paidAt: item.paidAt ? item.paidAt.toISOString() : null,
          expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          sekolah: {
            id: item.sekolah.id,
            nama: item.sekolah.nama,
            slug: item.sekolah.slug,
            npsn: item.sekolah.npsn,
            plan: normalizeTenantPlan(item.sekolah.plan),
            status: item.sekolah.status,
            expiresAt: item.sekolah.expiresAt ? item.sekolah.expiresAt.toISOString() : null,
          },
        })),
        page,
        limit,
        total,
        hasNext: page * limit < total,
      });
    } catch (error) {
      console.error("Gagal memuat daftar pembayaran Master Admin:", error);
      return res.status(503).json({ error: "Data pembayaran langganan belum tersedia." });
    }
  });

  router.post("/:id/cek-status", async (req, res) => {
    try {
      const master = await getMasterSession(req);
      if (!master) return res.status(401).json({ error: "Sesi Master Admin tidak valid." });

      const id = cleanText(req.params.id, 64);
      if (!id) return res.status(400).json({ error: "ID pembayaran tidak valid." });

      const payment = await prisma.pembayaranLangganan.findUnique({
        where: { id },
      });
      if (!payment) return res.status(404).json({ error: "Data pembayaran tidak ditemukan." });
      if (payment.status === "PAID") {
        return res.json({ synced: false, status: "PAID", message: "Pembayaran sudah berstatus LUNAS." });
      }
      if (payment.provider !== "DUITKU") {
        return res.status(400).json({ error: "Sinkronisasi otomatis hanya mendukung transaksi Duitku." });
      }

      const config = getDuitkuConfig();
      if (!config.configured) {
        return res.status(503).json({ error: "DUITKU_MERCHANT_CODE dan DUITKU_API_KEY belum dikonfigurasi." });
      }

      const statusRes = await checkDuitkuTransactionStatus(config, payment.merchantOrderId);
      if (!statusRes.ok || !statusRes.statusCode) {
        return res.status(502).json({ error: statusRes.error || "Gagal memeriksa status ke Duitku." });
      }

      // Duitku Transaction Status codes: "00" = Success, "01" = Process/Pending, "02" = Cancelled/Expired
      if (statusRes.statusCode === "01") {
        return res.json({
          synced: false,
          status: "PENDING",
          statusCode: statusRes.statusCode,
          message: statusRes.statusMessage || "Transaksi masih menunggu pembayaran.",
        });
      }

      const parsedAmount = statusRes.amount ? Number(statusRes.amount) : null;
      const outcome = await settleSubscriptionPayment({
        merchantOrderId: payment.merchantOrderId,
        resultCode: statusRes.statusCode,
        amount: parsedAmount,
        reference: statusRes.reference,
        callbackPayload: {
          source: "master-status-sync",
          statusCode: statusRes.statusCode,
          statusMessage: statusRes.statusMessage,
          amount: statusRes.amount,
          reference: statusRes.reference,
        },
        onActivated: options?.onActivated,
      });

      if (outcome.ok === false) {
        return res.status(outcome.httpStatus).json({ error: outcome.error });
      }

      return res.json({
        synced: true,
        ...outcome,
        message:
          outcome.status === "PAID"
            ? "Pembayaran terkonfirmasi LUNAS dan paket tenant otomatis diperbarui."
            : "Status transaksi diperbarui dari Duitku.",
      });
    } catch (error) {
      console.error("Gagal menyinkronkan status pembayaran Duitku:", error);
      return res.status(503).json({ error: "Pemeriksaan status Duitku gagal diproses." });
    }
  });

  return router;
}
