import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseStudentImport } from "./student-import.js";

test("valid student rows preserve leading zero and omit blank contacts", () => {
  assert.deepEqual(parseStudentImport([{ nisn: " 0123456789 ", nama: " Siswa Uji ", email: "", telepon: " " }]), { rows: [{ nisn: "0123456789", nama: "Siswa Uji" }] });
  assert.deepEqual(parseStudentImport([{ nisn: "1234567890", nama: "Nama Uji", email: " TEST@example.invalid ", telepon: "08123456789" }]), { rows: [{ nisn: "1234567890", nama: "Nama Uji", email: "test@example.invalid", telepon: "08123456789" }] });
});

test("reject invalid and repeated student rows", () => {
  for (const data of [[], [{}], [{ nisn: "123", nama: "Siswa Uji" }], [{ nisn: "1234567890", nama: " " }], [{ nisn: "1234567890", nama: "Nama", email: "invalid" }], [{ nisn: "1234567890", nama: "Nama", telepon: "wrong" }], [{ nisn: "1234567890", nama: "Nama" }, { nisn: "1234567890", nama: "Nama lain" }], Array(501).fill({ nisn: "1234567890", nama: "Nama" })]) {
    assert.ok("error" in parseStudentImport(data));
  }
});
