import { createHash, timingSafeEqual } from "crypto";
import { Router, type Request } from "express";
import { prisma } from "./db.js";
import { cleanText } from "./school-modules-shared.js";
import { normalizeTenantPlan, type TenantPlan } from "./plan-utils.js";
import {
  buildSubscriptionOrderId,
  createDuitkuInvoice,
  getDuitkuConfig,
  resolveTenantReturnUrl,
  settleSubscriptionPayment,
} from "./duitku-payment.js";

export const ANNUAL_PLAN_PRICES: Record<TenantPlan, { label: string; amount: number; days: number }> = {
  basic: { label: "Paket Basic (12 Bulan)", amount: 1_500_000, days: 365 },
  reguler: { label: "Paket Reguler (12 Bulan)", amount: 1_750_000, days: 365 },
  pro: { label: "Paket Pro (12 Bulan)", amount: 2_000_000, days: 365 },
};

export function normalizeIndonesianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 9 || digits.length > 16) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

/**
 * Sends a WhatsApp notification via configured Indonesian WA Gateway (e.g. Fonnte / Wablas / generic webhook).
 * Non-blocking and fails gracefully if gateway is not configured.
 */
export async function sendWhatsAppNotification(phone: string | null | undefined, message: string): Promise<boolean> {
  const gatewayUrl = process.env.WA_GATEWAY_URL?.trim();
  const gatewayToken = process.env.WA_GATEWAY_TOKEN?.trim();
  const target = normalizeIndonesianPhone(phone);
  if (!gatewayUrl || !gatewayToken || !target || !message.trim()) {
    return false;
  }
  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: gatewayToken,
      },
      body: JSON.stringify({
        target,
        phone: target,
        message: message.trim(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch (error) {
    console.warn("Notifikasi WhatsApp dilewati:", error instanceof Error ? error.message : "UnknownError");
    return false;
  }
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}): boolean {
  if (!input.orderId || !input.statusCode || !input.grossAmount || !input.signatureKey || !input.serverKey) {
    return false;
  }
  const expected = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signatureKey.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseSubscriptionOrderId(orderId: string): { slug: string; plan: TenantPlan } | null {
  // Format: SUB-<slug>-<plan>-<hex>
  const match = orderId.trim().match(/^SUB-([a-z0-9-]+)-(basic|reguler|pro)-[a-f0-9]{6,12}$/i);
  if (!match) return null;
  return { slug: match[1].toLowerCase(), plan: normalizeTenantPlan(match[2]) };
}

export function subscriptionBillingRoutes(
  getAdminSchoolId: (req: Request) => Promise<{ sekolahId: string; adminNama: string; adminEmail: string | null } | null>,
) {
  const router = Router();

  router.get("/status", async (req, res) => {
    try {
      const ctx = await getAdminSchoolId(req);
      if (!ctx) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });

      const [school, recentPayments] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: ctx.sekolahId },
          select: { id: true, nama: true, slug: true, plan: true, status: true, expiresAt: true, adminPhone: true },
        }),
        prisma.pembayaranLangganan.findMany({
          where: { sekolahId: ctx.sekolahId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            merchantOrderId: true,
            reference: true,
            provider: true,
            environment: true,
            plan: true,
            planLabel: true,
            amount: true,
            paymentMethod: true,
            paymentUrl: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        }),
      ]);
      if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });

      const now = Date.now();
      const daysRemaining = school.expiresAt
        ? Math.max(0, Math.ceil((school.expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)))
        : null;

      const duitku = getDuitkuConfig();
      const midtransReady = Boolean(process.env.MIDTRANS_SERVER_KEY?.trim());
      const paymentProvider = duitku.configured ? "duitku" : midtransReady ? "midtrans" : "manual";

      return res.json({
        sekolah: {
          ...school,
          plan: normalizeTenantPlan(school.plan),
          expiresAt: school.expiresAt ? school.expiresAt.toISOString() : null,
          daysRemaining,
        },
        paymentGatewayReady: duitku.configured || midtransReady,
        paymentProvider,
        duitkuEnv: duitku.configured ? duitku.environment : null,
        whatsappReady: Boolean(process.env.WA_GATEWAY_URL?.trim() && process.env.WA_GATEWAY_TOKEN?.trim()),
        plans: ANNUAL_PLAN_PRICES,
        riwayatPembayaran: recentPayments.map((item) => ({
          ...item,
          plan: normalizeTenantPlan(item.plan),
          paidAt: item.paidAt ? item.paidAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Gagal memuat status langganan:", error);
      return res.status(503).json({ error: "Status langganan belum tersedia." });
    }
  });

  router.post("/checkout", async (req, res) => {
    try {
      const ctx = await getAdminSchoolId(req);
      if (!ctx) return res.status(401).json({ error: "Sesi admin sekolah tidak valid." });

      const requestedPlan = normalizeTenantPlan(cleanText(req.body?.plan, 30) || "pro");
      const pricing = ANNUAL_PLAN_PRICES[requestedPlan];
      const school = await prisma.sekolah.findUnique({
        where: { id: ctx.sekolahId },
        select: { id: true, nama: true, slug: true, adminPhone: true },
      });
      if (!school) return res.status(404).json({ error: "Sekolah tidak ditemukan." });

      const orderId = buildSubscriptionOrderId(school.slug, requestedPlan);
      const duitku = getDuitkuConfig();
      const midtransKey = process.env.MIDTRANS_SERVER_KEY?.trim();
      const isProdMidtrans = process.env.MIDTRANS_IS_PRODUCTION === "true";

      const returnUrl = resolveTenantReturnUrl({
        slug: school.slug,
        orderId,
        requestOrigin: req.get("origin"),
        requestHost: req.get("host"),
        siteUrl: duitku.siteUrl,
      });
      const normalizedPhone = normalizeIndonesianPhone(school.adminPhone);
      const customerEmail = ctx.adminEmail || `admin@${school.slug}.pkbm.siput.id`;

      let paymentUrl: string | null = null;
      let snapToken: string | null = null;
      let reference: string | null = null;
      let provider: "DUITKU" | "MIDTRANS" | "MANUAL" = "MANUAL";
      let environment: "sandbox" | "production" = duitku.environment;
      let mode: "duitku" | "midtrans" | "manual-whatsapp" = "manual-whatsapp";
      let gatewayError: string | null = null;

      if (duitku.configured) {
        const invoiceRes = await createDuitkuInvoice({
          config: duitku,
          merchantOrderId: orderId,
          paymentAmount: pricing.amount,
          productDetails: `${pricing.label} - ${school.nama}`,
          customerVaName: ctx.adminNama || school.nama,
          email: customerEmail,
          phoneNumber: normalizedPhone,
          additionalParam: school.slug,
          merchantUserInfo: school.slug,
          returnUrl,
          expiryPeriodMinutes: 1440,
        });
        if (invoiceRes.ok && invoiceRes.paymentUrl) {
          paymentUrl = invoiceRes.paymentUrl;
          reference = invoiceRes.reference;
          provider = "DUITKU";
          environment = duitku.environment;
          mode = "duitku";
        } else {
          gatewayError = invoiceRes.error ?? "Gagal membuat invoice Duitku.";
          console.warn("Gagal membuat transaksi Duitku:", gatewayError);
        }
      } else if (midtransKey) {
        const snapBase = isProdMidtrans
          ? "https://app.midtrans.com/snap/v1/transactions"
          : "https://app.sandbox.midtrans.com/snap/v1/transactions";
        const authHeader = `Basic ${Buffer.from(`${midtransKey}:`).toString("base64")}`;
        try {
          const snapRes = await fetch(snapBase, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              transaction_details: {
                order_id: orderId,
                gross_amount: pricing.amount,
              },
              item_details: [
                {
                  id: `lms-${requestedPlan}-12m`,
                  price: pricing.amount,
                  quantity: 1,
                  name: `${pricing.label} - ${school.nama}`.slice(0, 50),
                },
              ],
              customer_details: {
                first_name: ctx.adminNama.slice(0, 50),
                email: ctx.adminEmail || undefined,
                phone: normalizedPhone || undefined,
              },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (snapRes.ok) {
            const snapJson = (await snapRes.json()) as { token?: string; redirect_url?: string };
            snapToken = snapJson.token ?? null;
            paymentUrl = snapJson.redirect_url ?? null;
            if (paymentUrl) {
              provider = "MIDTRANS";
              environment = isProdMidtrans ? "production" : "sandbox";
              mode = "midtrans";
            }
          }
        } catch (err) {
          console.warn("Gagal membuat transaksi Midtrans Snap:", err instanceof Error ? err.message : "UnknownError");
        }
      }

      const invoiceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.pembayaranLangganan.create({
        data: {
          sekolahId: school.id,
          merchantOrderId: orderId,
          reference,
          provider,
          environment,
          plan: requestedPlan,
          planLabel: pricing.label,
          durationDays: pricing.days,
          amount: pricing.amount,
          paymentUrl,
          status: "PENDING",
          customerName: ctx.adminNama,
          customerEmail,
          customerPhone: normalizedPhone,
          returnUrl,
          callbackUrl: provider === "DUITKU" ? duitku.callbackUrl : null,
          expiresAt: invoiceExpiresAt,
        },
      });

      if (school.adminPhone) {
        void sendWhatsAppNotification(
          school.adminPhone,
          `Halo ${ctx.adminNama}, tagihan aktivasi ${pricing.label} untuk ${school.nama} (ID: ${orderId}) sebesar Rp ${pricing.amount.toLocaleString("id-ID")} telah dibuat.${paymentUrl ? `\n\nBayar via QRIS/VA di sini: ${paymentUrl}` : ""}`,
        );
      }

      return res.status(201).json({
        orderId,
        reference,
        plan: requestedPlan,
        planLabel: pricing.label,
        amount: pricing.amount,
        paymentUrl,
        snapToken,
        provider,
        environment,
        mode,
        ...(gatewayError ? { gatewayNote: gatewayError } : {}),
        message: paymentUrl
          ? mode === "duitku"
            ? "Tautan pembayaran Duitku (QRIS / Virtual Account / E-Wallet) berhasil dibuat."
            : "Tautan pembayaran QRIS / Virtual Account berhasil dibuat."
          : "Invoice dibuat. Lanjutkan konfirmasi cepat melalui WhatsApp untuk aktivasi instan.",
      });
    } catch (error) {
      console.error("Gagal membuat checkout langganan:", error);
      return res.status(503).json({ error: "Checkout langganan belum dapat diproses." });
    }
  });

  return router;
}

export function paymentWebhookRoutes() {
  const router = Router();

  router.post("/midtrans", async (req, res) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
    if (!serverKey) {
      return res.status(503).json({ error: "MIDTRANS_SERVER_KEY belum dikonfigurasi." });
    }
    const orderId = typeof req.body?.order_id === "string" ? req.body.order_id.trim() : "";
    const statusCode = typeof req.body?.status_code === "string" ? req.body.status_code.trim() : "";
    const grossAmount = typeof req.body?.gross_amount === "string" ? req.body.gross_amount.trim() : "";
    const signatureKey = typeof req.body?.signature_key === "string" ? req.body.signature_key.trim() : "";
    const txStatus = typeof req.body?.transaction_status === "string" ? req.body.transaction_status.trim().toLowerCase() : "";
    const fraudStatus = typeof req.body?.fraud_status === "string" ? req.body.fraud_status.trim().toLowerCase() : "accept";

    if (!verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey, serverKey })) {
      return res.status(403).json({ error: "Tanda tangan webhook pembayaran tidak valid." });
    }

    const parsedOrder = parseSubscriptionOrderId(orderId);
    if (!parsedOrder) {
      return res.status(200).json({ ignored: true });
    }

    const isPaid = txStatus === "settlement" || (txStatus === "capture" && fraudStatus === "accept");
    if (!isPaid) {
      return res.status(200).json({ received: true, status: txStatus });
    }

    try {
      const existingPayment = await prisma.pembayaranLangganan.findUnique({
        where: { merchantOrderId: orderId },
        select: { id: true },
      });
      if (existingPayment) {
        const outcome = await settleSubscriptionPayment({
          merchantOrderId: orderId,
          resultCode: "00",
          amount: Number(grossAmount),
          paymentCode: typeof req.body?.payment_type === "string" ? req.body.payment_type : null,
          callbackPayload: { source: "midtrans-webhook", transaction_status: txStatus, fraud_status: fraudStatus },
          onActivated: ({ schoolName, adminPhone, plan, nextExpiry }) => {
            if (adminPhone) {
              void sendWhatsAppNotification(
                adminPhone,
                `Pembayaran diterima! Paket ${plan.toUpperCase()} untuk ${schoolName} kini aktif hingga ${nextExpiry.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. Terima kasih!`,
              );
            }
          },
        });
        if (outcome.ok === false) {
          return res.status(outcome.httpStatus).json({ error: outcome.error });
        }
        return res.json({ activated: outcome.status === "PAID", ...outcome });
      }

      const school = await prisma.sekolah.findUnique({
        where: { slug: parsedOrder.slug },
        select: { id: true, nama: true, expiresAt: true, adminPhone: true },
      });
      if (!school) {
        return res.status(404).json({ error: "Tenant sekolah tidak ditemukan." });
      }

      const now = new Date();
      const anchor = school.expiresAt && school.expiresAt > now ? school.expiresAt : now;
      const nextExpiry = new Date(anchor.getTime() + ANNUAL_PLAN_PRICES[parsedOrder.plan].days * 24 * 60 * 60 * 1000);

      await prisma.sekolah.update({
        where: { id: school.id },
        data: {
          plan: parsedOrder.plan,
          status: "ACTIVE",
          expiresAt: nextExpiry,
        },
      });

      if (school.adminPhone) {
        void sendWhatsAppNotification(
          school.adminPhone,
          `Pembayaran diterima! Paket ${parsedOrder.plan.toUpperCase()} untuk ${school.nama} kini aktif hingga ${nextExpiry.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. Terima kasih!`,
        );
      }

      return res.json({ activated: true, sekolahId: school.id, plan: parsedOrder.plan, expiresAt: nextExpiry.toISOString() });
    } catch (error) {
      console.error("Gagal memproses webhook pembayaran Midtrans:", error);
      return res.status(503).json({ error: "Webhook belum dapat diproses." });
    }
  });

  return router;
}

/**
 * Vercel Cron endpoint for automated Trial / Subscription expiry reminders (H-7, H-3, H-1) via WhatsApp.
 * Secured with Authorization: Bearer <CRON_SECRET> (fails closed if unset).
 */
export function trialReminderCronRoute() {
  const router = Router();

  const handler = async (req: Request, res: import("express").Response) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret || cronSecret.length < 16) {
      return res.status(503).json({ error: "CRON_SECRET belum dikonfigurasi." });
    }
    const authHeader = req.get("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const a = Buffer.from(cronSecret, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: "Token cron tidak valid." });
    }

    try {
      const now = new Date();
      const maxWindow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
      const expiringSchools = await prisma.sekolah.findMany({
        where: {
          status: "ACTIVE",
          expiresAt: { gt: now, lte: maxWindow },
        },
        select: { id: true, nama: true, slug: true, expiresAt: true, adminPhone: true },
        take: 500,
      });

      const reminderDays = new Set([1, 3, 7]);
      let sent = 0;
      let skipped = 0;

      for (const school of expiringSchools) {
        if (!school.expiresAt || !school.adminPhone) {
          skipped += 1;
          continue;
        }
        const daysLeft = Math.ceil((school.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (!reminderDays.has(daysLeft)) {
          skipped += 1;
          continue;
        }
        const endDateStr = school.expiresAt.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        });
        const ok = await sendWhatsAppNotification(
          school.adminPhone,
          `Pengingat Masa Aktif (${daysLeft} hari lagi): Masa uji coba / langganan ${school.nama} akan berakhir pada ${endDateStr}. Silakan masuk ke portal admin untuk memperpanjang paket via QRIS / Virtual Account agar layanan tetap aktif tanpa gangguan.`,
        );
        if (ok) sent += 1;
        else skipped += 1;
      }

      return res.json({ checked: expiringSchools.length, sent, skipped });
    } catch (error) {
      console.error("Gagal menjalankan cron pengingat masa aktif:", error);
      return res.status(503).json({ error: "Pengingat masa aktif belum dapat dijalankan." });
    }
  };

  router.get("/trial-reminders", handler);
  router.post("/trial-reminders", handler);
  return router;
}
