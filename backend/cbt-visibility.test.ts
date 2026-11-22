import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCHIVED_OR_UNAVAILABLE_ERROR,
  detectBankJenjang,
  detectPublicBankKategori,
  isBankCloneable,
  normalizeBankVisibility,
  parseBankVisibilityStrict,
} from "./cbt-routes.js";

test("parseBankVisibilityStrict accepts only PRIVATE, PUBLIC, and ARCHIVED", () => {
  assert.equal(parseBankVisibilityStrict("PRIVATE"), "PRIVATE");
  assert.equal(parseBankVisibilityStrict("public"), "PUBLIC");
  assert.equal(parseBankVisibilityStrict("  archived "), "ARCHIVED");
  assert.equal(parseBankVisibilityStrict("SHARED"), null);
  assert.equal(parseBankVisibilityStrict(""), null);
  assert.equal(parseBankVisibilityStrict(null), null);
});

test("normalizeBankVisibility defaults safely to PRIVATE", () => {
  assert.equal(normalizeBankVisibility(undefined), "PRIVATE");
  assert.equal(normalizeBankVisibility("invalid"), "PRIVATE");
  assert.equal(normalizeBankVisibility("PUBLIC"), "PUBLIC");
});

test("isBankCloneable strictly blocks PRIVATE, ARCHIVED, and missing banks", () => {
  assert.equal(isBankCloneable({ visibility: "PUBLIC" }), true);
  assert.equal(isBankCloneable({ visibility: "PRIVATE" }), false);
  assert.equal(isBankCloneable({ visibility: "ARCHIVED" }), false);
  assert.equal(isBankCloneable(null), false);
  assert.equal(isBankCloneable(undefined), false);
  assert.equal(
    ARCHIVED_OR_UNAVAILABLE_ERROR,
    "Bank soal ini sudah diarsipkan atau tidak tersedia untuk publik",
  );
});

test("detectBankJenjang classifies Paket A, B, C accurately", () => {
  assert.equal(detectBankJenjang("Paket A Kelas 6", "Latihan IPA"), "PAKET_A");
  assert.equal(detectBankJenjang("Kelas 8B", "UTS Matematika"), "PAKET_B");
  assert.equal(detectBankJenjang("Paket C Kelas 12", "UPK Bahasa Indonesia"), "PAKET_C");
  assert.equal(detectBankJenjang("Kelas Khusus", "Keterampilan"), "LAINNYA");
});

test("detectPublicBankKategori distinguishes Latihan, UTS, UAS, and Ujian Akhir", () => {
  assert.equal(detectPublicBankKategori("UTS-AB12", "Matematika"), "UTS");
  assert.equal(detectPublicBankKategori("AS-CD34", "Asesmen Sumatif IPA"), "UAS");
  assert.equal(detectPublicBankKategori("UA-EF56", "Ujian Akhir Kelas Akhir"), "UJIAN_AKHIR");
  assert.equal(detectPublicBankKategori("CBT-9999", "Latihan Harian Bab 1"), "LATIHAN");
});
