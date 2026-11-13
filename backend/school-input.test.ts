import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseApplicant, parseTeacher } from "./school-input.js";

test("validates teacher with optional NUPTK", () => {
  const teacher = { nama: " Guru Uji ", nuptk: "", mapelUtama: "Matematika", email: " TEST@example.invalid ", telepon: "08123456789" };
  assert.deepEqual(parseTeacher(teacher), { nama: "Guru Uji", nuptk: null, mapelUtama: "Matematika", email: "test@example.invalid", telepon: "08123456789" });
  assert.equal(parseTeacher({ ...teacher, nuptk: "123" }), null);
  assert.ok(parseTeacher({ ...teacher, nuptk: "1234567890123456" }));
  assert.equal(parseTeacher({ ...teacher, email: "salah" }), null);
});

test("validates PPDB applicant fields", () => {
  const applicant = { nama: "Calon Uji", email: "TEST@example.invalid", telepon: "08123456789", alamat: "Alamat uji", jenjang: "SMA" };
  assert.equal(parseApplicant(applicant)?.email, "test@example.invalid");
  assert.equal(parseApplicant({ ...applicant, alamat: " " }), null);
  assert.equal(parseApplicant({ ...applicant, telepon: "abc" }), null);
  assert.equal(parseApplicant(null), null);
});
