import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  normalizeIndonesianPhone,
  parseSubscriptionOrderId,
  verifyMidtransSignature,
} from "./notification-payment.js";
import {
  offloadDataUrlToSupabaseStorage,
  parseValidatedDataUrl,
} from "./storage-upload.js";

test("storage-upload validates JPEG/PNG/PDF magic bytes and rejects forged payloads", () => {
  // Valid minimal JPEG header FF D8 FF E0
  const validJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const parsed = parseValidatedDataUrl(validJpeg);
  assert.ok(parsed);
  assert.equal(parsed.ext, "jpg");
  assert.equal(parsed.mime, "image/jpeg");

  // Forged SVG/HTML disguised as image/jpeg
  const forged = "data:image/jpeg;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+";
  assert.equal(parseValidatedDataUrl(forged), null);

  // Valid PDF header %PDF
  const validPdf = "data:application/pdf;base64,JVBERi0xLjQ=";
  const parsedPdf = parseValidatedDataUrl(validPdf);
  assert.ok(parsedPdf);
  assert.equal(parsedPdf.ext, "pdf");
});

test("offloadDataUrlToSupabaseStorage falls back safely when env is unset", async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const validJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const out = await offloadDataUrlToSupabaseStorage({
      value: validJpeg,
      sekolahId: "school-1",
      category: "tugas",
    });
    assert.equal(out, validJpeg);
  } finally {
    if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
    if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});

test("WhatsApp phone normalization and Midtrans signature/order parsing", () => {
  assert.equal(normalizeIndonesianPhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizeIndonesianPhone("+62 819 1822 6387"), "6281918226387");
  assert.equal(normalizeIndonesianPhone("123"), null);

  assert.deepEqual(parseSubscriptionOrderId("SUB-pkbm-maju-pro-a1b2c3d4"), {
    slug: "pkbm-maju",
    plan: "pro",
  });
  assert.equal(parseSubscriptionOrderId("INVALID-ORDER"), null);

  const serverKey = "SB-Mid-server-secret";
  const orderId = "SUB-pkbm-maju-pro-a1b2c3d4";
  const statusCode = "200";
  const grossAmount = "2000000.00";
  const validSig = createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");

  assert.equal(verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey: validSig, serverKey }), true);
  assert.equal(verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey: "deadbeef", serverKey }), false);
});
