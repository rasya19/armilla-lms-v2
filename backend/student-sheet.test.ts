import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { mappedStudentRows, readStudentSheet } from "../frontend/src/components/studentImportData.js";
import { classMatchesPackage } from "../frontend/src/components/standardClasses.js";

test("pilihan kelas dibatasi sesuai rentang paket", () => {
  for (let grade = 1; grade <= 12; grade++) {
    const expected = grade <= 6 ? "Paket A" : grade <= 9 ? "Paket B" : "Paket C";
    for (const paket of ["Paket A", "Paket B", "Paket C"]) {
      assert.equal(classMatchesPackage(`Kelas ${grade}`, paket), paket === expected);
      assert.equal(classMatchesPackage(`${expected} Kelas ${grade} A`, paket), paket === expected);
    }
  }
  assert.equal(classMatchesPackage("Paket A Kelas 9", "Paket B"), false);
  assert.equal(classMatchesPackage("Kelas khusus", "Paket A"), false);
  assert.equal(classMatchesPackage("Kelas 9", ""), false);
});

test("Dapodik grouped headers map and preserve row numbers when NISN is missing", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Daftar Peserta Didik"], [], [], [],
    ["No", "Nama", "NISN", "JK", "Tanggal Lahir", "HP", "Telepon", "Data Ayah", "", "Data Ibu"],
    ["", "", "", "", "", "", "", "Nama", "NIK", "Nama"],
    [1, "Siswa Uji", "0123456789", "P", "2000-02-29", "08123456789", "021123456", "Ayah Uji", "1234567890123456", "Ibu Uji"],
    [2, "Siswa Tanpa NISN", "", "L"],
  ]);
  sheet["!merges"] = [
    ...[0, 1, 2, 3, 4, 5, 6, 9].map((c) => ({ s: { r: 4, c }, e: { r: 5, c } })),
    { s: { r: 4, c: 7 }, e: { r: 4, c: 8 } },
  ];
  const data = readStudentSheet(sheet, XLSX);
  assert.equal(data.mapping.namaAyah, "7");
  assert.equal(data.mapping.namaIbu, "9");
  assert.equal(data.mapping.telepon, "5");
  const mapped = mappedStudentRows(data.rows, data.mapping);
  assert.equal(mapped.ready.length, 1);
  assert.equal(mapped.ready[0].nisn, "0123456789");
  assert.equal(mapped.ready[0].namaAyah, "Ayah Uji");
  assert.deepEqual(mapped.readyNumbers, [7]);
  assert.deepEqual(mapped.skipped, [{ number: 8, nama: "Siswa Tanpa NISN" }]);
});

test("simple first-row import remains supported", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["NISN", "Nama", "Email"], ["0123456789", "Siswa Uji", "test@example.invalid"]]);
  const data = readStudentSheet(sheet, XLSX);
  assert.equal(mappedStudentRows(data.rows, data.mapping).ready[0].email, "test@example.invalid");
});
