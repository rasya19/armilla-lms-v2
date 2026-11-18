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

test("validates and normalizes Dapodik fields without changing blank optional values", () => {
  const parsed = parseStudentImport([{ nama: " Siswa Uji ", nisn: "0123456789", nik: "1234567890123456", jenisKelamin: "L", tanggalLahir: "2000-02-29", tempatLahir: " Kota ", namaAyah: " Ayah ", alamatLengkap: " Jalan " }]);
  assert.deepEqual(parsed, { rows: [{ nama: "Siswa Uji", nisn: "0123456789", nik: "1234567890123456", jenisKelamin: "L", tanggalLahir: new Date("2000-02-29T00:00:00Z"), tempatLahir: "Kota", namaAyah: "Ayah", alamatLengkap: "Jalan" }] });
  for (const extra of [{ tanggalLahir: "2023-02-29" }, { tanggalMasuk: "01/01/2024" }, { nik: "123" }, { jenisKelamin: "X" }, { namaIbu: 123 }, { teleponAyah: "bukan nomor" }, { namaWali: "a".repeat(201) }]) {
    assert.ok("error" in parseStudentImport([{ nama: "Siswa Uji", nisn: "0123456789", ...extra }]));
  }
});
