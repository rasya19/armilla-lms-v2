import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseRegistration } from "./school-registration.js";

const valid = { namaSekolah: " Sekolah Uji ", npsn: "12345678", namaKontak: " Penguji ", emailKontak: " TEST@example.invalid ", teleponKontak: "+62 12345678" };

test("school registration normalizes input", () => {
  assert.deepEqual(parseRegistration(valid), { namaSekolah: "Sekolah Uji", npsn: "12345678", namaKontak: "Penguji", emailKontak: "test@example.invalid", teleponKontak: "+62 12345678" });
  assert.equal(parseRegistration({ ...valid, npsn: "" })?.npsn, null);
  assert.equal(parseRegistration({ ...valid, npsn: "p1234567" })?.npsn, "P1234567");
  assert.equal(parseRegistration({ ...valid, npsn: "K1234567" })?.npsn, "K1234567");
});

test("school registration rejects malformed input", () => {
  assert.equal(parseRegistration(null), null);
  assert.equal(parseRegistration({ ...valid, npsn: "123" }), null);
  assert.equal(parseRegistration({ ...valid, npsn: "P123456" }), null);
  assert.equal(parseRegistration({ ...valid, npsn: "P12345678" }), null);
  assert.equal(parseRegistration({ ...valid, npsn: "X1234567" }), null);
  assert.equal(parseRegistration({ ...valid, npsn: "P12345X7" }), null);
  assert.equal(parseRegistration({ ...valid, emailKontak: "invalid" }), null);
  assert.equal(parseRegistration({ ...valid, teleponKontak: "abcdef" }), null);
  assert.equal(parseRegistration({ ...valid, namaSekolah: " " }), null);
  assert.equal(parseRegistration({ ...valid, namaKontak: "a".repeat(121) }), null);
});
