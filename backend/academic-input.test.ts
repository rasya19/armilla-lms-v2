import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseAcademicYear, parseSchedule, parseSubject } from "./academic-input.js";

test("validates academic dates and semester", () => {
  const base = { nama: "2026/2027", semester: "Ganjil", mulai: "2026-07-01", selesai: "2026-12-31" };
  assert.ok(parseAcademicYear(base));
  for (const changes of [{ mulai: "2026-02-29" }, { mulai: "2027-01-01" }, { semester: "3" }, { nama: "" }, { mulai: "0000-01-01" }]) assert.equal(parseAcademicYear({ ...base, ...changes }), null);
});

test("validates subjects and schedules", () => {
  assert.deepEqual(parseSubject({ nama: " Matematika ", kkm: 75 }), { nama: "Matematika", kkm: 75 });
  for (const kkm of [-1, 101, 75.5, "75"]) assert.equal(parseSubject({ nama: "Uji", kkm }), null);
  const base = { tahunAjaranId: "t", kelasId: "k", mapelId: "m", guruId: "g", hari: 1, jamMulai: "08:00", jamSelesai: "09:00" };
  assert.ok(parseSchedule(base));
  for (const changes of [{ hari: 0 }, { hari: 8 }, { hari: "1" }, { jamMulai: "24:00" }, { jamSelesai: "08:00" }, { kelasId: "" }]) assert.equal(parseSchedule({ ...base, ...changes }), null);
});
