import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { headers, readScheduleSheet } from "../frontend/src/components/scheduleImportData.js";

test("schedule spreadsheet resolves references, Excel times, and ambiguous names", () => {
  const references = {
    tahun: [{ id: "y", nama: "2026/2027", semester: "Ganjil" }],
    kelas: [{ id: "k", nama: "Kelas 9" }],
    mapel: [{ id: "m", nama: "Matematika" }],
    guru: [{ id: "g1", nama: "Guru" }, { id: "g2", nama: "Guru" }],
  };
  const columns = [headers[6], ...headers.slice(0, 6), headers[7]];
  const sheet = XLSX.utils.aoa_to_sheet([
    columns,
    [8 / 24, "2026/2027", "Ganjil", "Kelas 9", "Matematika", "g1", "Senin", 9 / 24],
    [8 / 24, "2026/2027", "Ganjil", "Kelas 9", "Matematika", "Guru", "Senin", 9 / 24],
    ["10:00", "2026/2027", "Genap", "Kelas 9", "Matematika", "g1", "Senin", "09:00"],
  ]);
  const rows = readScheduleSheet(sheet, XLSX, references);
  assert.deepEqual(rows[0].schedule, { tahunAjaranId: "y", kelasId: "k", mapelId: "m", guruId: "g1", hari: 1, jamMulai: "08:00", jamSelesai: "09:00" });
  assert.match(rows[1].error, /Guru aktif/);
  assert.match(rows[2].error, /Tahun ajaran/);
  assert.throws(() => readScheduleSheet(XLSX.utils.aoa_to_sheet([["Kelas"]]), XLSX, references), /Kolom/);
  sheet["!fullref"] = "A1:H502";
  assert.throws(() => readScheduleSheet(sheet, XLSX, references), /500/);
});
