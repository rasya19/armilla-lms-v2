import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildSubscriptionOrderId,
  cancelPendingSubscriptionInvoice,
  checkDuitkuTransactionStatus,
  createDuitkuInvoice,
  createDuitkuPopSignature,
  createDuitkuStatusSignature,
  DUITKU_ENDPOINTS,
  getDuitkuConfig,
  normalizeDuitkuEnv,
  resolveTenantReturnUrl,
  verifyDuitkuCallbackSignature,
  type CancelInvoiceDb,
} from "./duitku-payment.js";
import { parseSubscriptionOrderId } from "./notification-payment.js";

test("getDuitkuConfig reads env vars cleanly without hardcoded secrets", () => {
  const unconfigured = getDuitkuConfig({
    DUITKU_MERCHANT_CODE: "DS38515",
    DUITKU_ENV: "sandbox",
  });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.merchantCode, "DS38515");
  assert.equal(unconfigured.environment, "sandbox");
  assert.equal(unconfigured.siteUrl, "https://pkbm.siput.id");
  assert.equal(unconfigured.callbackUrl, "https://pkbm.siput.id/api/payment/callback");

  const prod = getDuitkuConfig({
    DUITKU_MERCHANT_CODE: "DS38515",
    DUITKU_API_KEY: "test-secret-key",
    DUITKU_ENV: "production",
  });
  assert.equal(prod.configured, true);
  assert.equal(prod.environment, "production");
  assert.equal(prod.callbackUrl, "https://pkbm.siput.id/api/payment/callback");

  assert.equal(normalizeDuitkuEnv("PROD"), "production");
  assert.equal(normalizeDuitkuEnv("sandbox"), "sandbox");
  assert.equal(normalizeDuitkuEnv(undefined), "sandbox");
});

test("Duitku POP SHA256, status MD5, and callback MD5 signatures validate strictly", () => {
  const merchantCode = "DS38515";
  const apiKey = "super-secret-api-key";
  const timestamp = "1732464000000";
  const merchantOrderId = "SUB-pkbm-harapan-pro-a1b2c3d4";
  const amount = "2000000";

  const expectedPop = createHash("sha256").update(`${merchantCode}${timestamp}${apiKey}`).digest("hex");
  assert.equal(createDuitkuPopSignature(merchantCode, timestamp, apiKey), expectedPop);

  const expectedStatus = createHash("md5").update(`${merchantCode}${merchantOrderId}${apiKey}`).digest("hex");
  assert.equal(createDuitkuStatusSignature(merchantCode, merchantOrderId, apiKey), expectedStatus);

  const expectedCallback = createHash("md5").update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`).digest("hex");
  assert.equal(
    verifyDuitkuCallbackSignature({
      merchantCode,
      amount,
      merchantOrderId,
      signature: expectedCallback,
      apiKey,
    }),
    true,
  );
  assert.equal(
    verifyDuitkuCallbackSignature({
      merchantCode,
      amount,
      merchantOrderId,
      signature: expectedCallback.toUpperCase(),
      apiKey,
    }),
    true,
  );
  // Tampered amount must fail
  assert.equal(
    verifyDuitkuCallbackSignature({
      merchantCode,
      amount: "1000",
      merchantOrderId,
      signature: expectedCallback,
      apiKey,
    }),
    false,
  );
  // Wrong API key must fail
  assert.equal(
    verifyDuitkuCallbackSignature({
      merchantCode,
      amount,
      merchantOrderId,
      signature: expectedCallback,
      apiKey: "wrong-key",
    }),
    false,
  );
});

test("buildSubscriptionOrderId stays within Duitku 50-char limit and white-label returnUrl targets tenant subdomain", () => {
  const longOrderId = buildSubscriptionOrderId("pkbm-harapan-bangsa-nusantara-jaya-sekali", "reguler");
  assert.ok(longOrderId.length <= 50, `Expected <= 50 chars, got ${longOrderId.length}`);
  assert.ok(parseSubscriptionOrderId(longOrderId));

  const fromSubdomain = resolveTenantReturnUrl({
    slug: "pkbm-harapan",
    orderId: "SUB-pkbm-harapan-pro-1234abcd",
    requestOrigin: "https://pkbm-harapan.pkbm.siput.id",
    siteUrl: "https://pkbm.siput.id",
  });
  assert.equal(
    fromSubdomain,
    "https://pkbm-harapan.pkbm.siput.id/?payment=return&orderId=SUB-pkbm-harapan-pro-1234abcd",
  );

  const fallbackSubdomain = resolveTenantReturnUrl({
    slug: "pkbm-cahaya",
    orderId: "SUB-pkbm-cahaya-basic-abcdef12",
    siteUrl: "https://pkbm.siput.id",
  });
  assert.equal(
    fallbackSubdomain,
    "https://pkbm-cahaya.pkbm.siput.id/?payment=return&orderId=SUB-pkbm-cahaya-basic-abcdef12",
  );
});

test("createDuitkuInvoice and checkDuitkuTransactionStatus send correct headers, payload, and endpoints", async () => {
  const config = getDuitkuConfig({
    DUITKU_MERCHANT_CODE: "DS38515",
    DUITKU_API_KEY: "unit-test-secret",
    DUITKU_ENV: "sandbox",
  });

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: Record<string, unknown> = {};

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (capturedUrl.includes("createInvoice")) {
      return new Response(
        JSON.stringify({
          merchantCode: "DS38515",
          reference: "D261124TEST001",
          paymentUrl: "https://sandbox.duitku.com/topup/v2/TopUpCreditCardPayment.aspx?reference=D261124TEST001",
          statusCode: "00",
          statusMessage: "SUCCESS",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        merchantOrderId: "SUB-pkbm-test-pro-11223344",
        reference: "D261124TEST001",
        amount: "2000000",
        statusCode: "00",
        statusMessage: "SUCCESS",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const invoice = await createDuitkuInvoice(
    {
      config,
      merchantOrderId: "SUB-pkbm-test-pro-11223344",
      paymentAmount: 2_000_000,
      productDetails: "Paket Pro (12 Bulan) - PKBM Test",
      customerVaName: "Admin PKBM Test",
      email: "admin@pkbm-test.pkbm.siput.id",
      phoneNumber: "6281234567890",
      additionalParam: "pkbm-test",
      merchantUserInfo: "pkbm-test",
      returnUrl: "https://pkbm-test.pkbm.siput.id/?payment=return&orderId=SUB-pkbm-test-pro-11223344",
    },
    mockFetch,
  );

  assert.equal(invoice.ok, true);
  assert.equal(invoice.reference, "D261124TEST001");
  assert.equal(capturedUrl, DUITKU_ENDPOINTS.sandbox.createInvoice);
  assert.equal(capturedHeaders["x-duitku-merchantcode"], "DS38515");
  assert.ok(capturedHeaders["x-duitku-timestamp"]);
  assert.equal(
    capturedHeaders["x-duitku-signature"],
    createDuitkuPopSignature("DS38515", capturedHeaders["x-duitku-timestamp"], "unit-test-secret"),
  );
  assert.equal(capturedBody.callbackUrl, "https://pkbm.siput.id/api/payment/callback");
  assert.equal(capturedBody.paymentAmount, 2_000_000);

  const status = await checkDuitkuTransactionStatus(config, "SUB-pkbm-test-pro-11223344", mockFetch);
  assert.equal(status.ok, true);
  assert.equal(status.statusCode, "00");
  assert.equal(capturedUrl, DUITKU_ENDPOINTS.sandbox.transactionStatus);
  assert.equal(
    capturedBody.signature,
    createDuitkuStatusSignature("DS38515", "SUB-pkbm-test-pro-11223344", "unit-test-secret"),
  );
});

test("cancelPendingSubscriptionInvoice enforces tenant ownership and only deletes PENDING invoices", async () => {
  const rows = [
    { id: "inv-pending", sekolahId: "tenant-a", merchantOrderId: "SUB-pkbm-a-pro-1111aaaa", status: "PENDING" },
    { id: "inv-paid", sekolahId: "tenant-a", merchantOrderId: "SUB-pkbm-a-pro-2222bbbb", status: "PAID" },
    { id: "inv-other", sekolahId: "tenant-b", merchantOrderId: "SUB-pkbm-b-basic-3333cccc", status: "PENDING" },
    { id: "inv-failed", sekolahId: "tenant-a", merchantOrderId: "SUB-pkbm-a-reguler-4444dddd", status: "FAILED" },
  ];

  const mockDb: CancelInvoiceDb = {
    pembayaranLangganan: {
      findFirst: async ({ where }) => {
        const keys = where.OR.map((item) => ("merchantOrderId" in item ? item.merchantOrderId : item.id));
        return rows.find((r) => keys.includes(r.merchantOrderId) || keys.includes(r.id)) ?? null;
      },
      deleteMany: async ({ where }) => {
        const idx = rows.findIndex(
          (r) => r.id === where.id && r.sekolahId === where.sekolahId && r.status === where.status,
        );
        if (idx === -1) return { count: 0 };
        rows.splice(idx, 1);
        return { count: 1 };
      },
    },
  };

  // 1. Missing order -> 404
  const notFound = await cancelPendingSubscriptionInvoice(
    { sekolahId: "tenant-a", orderId: "SUB-tidak-ada-pro-00000000" },
    mockDb,
  );
  assert.equal(notFound.ok, false);
  if (notFound.ok === false) assert.equal(notFound.httpStatus, 404);

  // 2. Wrong tenant -> 403
  const forbidden = await cancelPendingSubscriptionInvoice(
    { sekolahId: "tenant-a", orderId: "SUB-pkbm-b-basic-3333cccc" },
    mockDb,
  );
  assert.equal(forbidden.ok, false);
  if (forbidden.ok === false) assert.equal(forbidden.httpStatus, 403);

  // 3. Already PAID -> 409
  const paid = await cancelPendingSubscriptionInvoice(
    { sekolahId: "tenant-a", orderId: "SUB-pkbm-a-pro-2222bbbb" },
    mockDb,
  );
  assert.equal(paid.ok, false);
  if (paid.ok === false) assert.equal(paid.httpStatus, 409);

  // 4. Non-pending (FAILED) -> 409
  const failed = await cancelPendingSubscriptionInvoice(
    { sekolahId: "tenant-a", orderId: "SUB-pkbm-a-reguler-4444dddd" },
    mockDb,
  );
  assert.equal(failed.ok, false);
  if (failed.ok === false) assert.equal(failed.httpStatus, 409);

  // 5. Owned PENDING invoice -> deleted successfully
  const success = await cancelPendingSubscriptionInvoice(
    { sekolahId: "tenant-a", orderId: "SUB-pkbm-a-pro-1111aaaa" },
    mockDb,
  );
  assert.deepEqual(success, { ok: true, deletedOrderId: "SUB-pkbm-a-pro-1111aaaa" });
  assert.equal(rows.some((r) => r.id === "inv-pending"), false);
});
