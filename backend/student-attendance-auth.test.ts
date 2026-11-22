import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_ATTENDANCE_NOTE,
  buildMonthlyCalendarSummary,
  jakartaIsoDate,
  parseRequestedAccountPassword,
  recordStudentLoginAttendance,
  resolveStudentLoginUsername,
} from "./attendance-helpers.js";

test("parseRequestedAccountPassword defaults to 123456 and validates custom passwords", () => {
  assert.deepEqual(parseRequestedAccountPassword(undefined), { ok: true, password: "123456" });
  assert.deepEqual(parseRequestedAccountPassword(""), { ok: true, password: "123456" });
  assert.deepEqual(parseRequestedAccountPassword("pkbm2026"), { ok: true, password: "pkbm2026" });
  const tooShort = parseRequestedAccountPassword("12345");
  assert.equal(tooShort.ok, false);
});

test("resolveStudentLoginUsername prefers NISN and generates name-based username when NISN is empty", () => {
  const withNisn = resolveStudentLoginUsername({ nama: "Eva Lestari", nisn: "0012345678" });
  assert.equal(withNisn.username, "0012345678");
  assert.equal(withNisn.storeInAccountEmail, null);

  const withoutNisn = resolveStudentLoginUsername({ nama: "Eva Lestari", nisn: "" }, null, "4821");
  assert.equal(withoutNisn.username, "eva.lestari.4821");
  assert.equal(withoutNisn.storeInAccountEmail, "eva.lestari.4821");

  const existingAuto = resolveStudentLoginUsername({ nama: "Eva Lestari", nisn: "   " }, "eva.lestari.4821");
  assert.equal(existingAuto.username, "eva.lestari.4821");
  assert.equal(existingAuto.storeInAccountEmail, "eva.lestari.4821");
});

test("recordStudentLoginAttendance creates HADIR (Login Daring) once and never overwrites manual teacher status", async () => {
  const fixedNow = new Date("2026-11-21T02:30:00.000Z"); // 09:30 WIB on 2026-11-21
  assert.equal(jakartaIsoDate(fixedNow), "2026-11-21");

  let stored: { status: string; keterangan: string | null; waktuHadir: Date | null } | null = null;
  let createCalls = 0;

  const mockDb = {
    presensi: {
      findUnique: async () => stored,
      create: async ({ data }: { data: { status: string; keterangan: string | null; waktuHadir: Date | null } }) => {
        createCalls += 1;
        stored = { status: data.status, keterangan: data.keterangan, waktuHadir: data.waktuHadir };
        return stored;
      },
    },
    tahunAjaran: {
      findFirst: async () => ({ id: "ta-1" }),
      create: async () => ({ id: "ta-1" }),
    },
  } as unknown as Parameters<typeof recordStudentLoginAttendance>[0];

  // First login: no record yet -> auto-creates HADIR with "Login Daring"
  const first = await recordStudentLoginAttendance(mockDb, {
    sekolahId: "sch-1",
    siswaId: "sis-1",
    kelasId: "kls-1",
    now: fixedNow,
  });
  assert.equal(first.created, true);
  assert.equal(first.status, "HADIR");
  assert.equal(first.keterangan, LOGIN_ATTENDANCE_NOTE);
  assert.equal(createCalls, 1);

  // Subsequent login when teacher already set IZIN -> MUST NOT overwrite
  stored = { status: "IZIN", keterangan: "Acara keluarga", waktuHadir: null };
  const second = await recordStudentLoginAttendance(mockDb, {
    sekolahId: "sch-1",
    siswaId: "sis-1",
    kelasId: "kls-1",
    now: fixedNow,
  });
  assert.equal(second.created, false);
  assert.equal(second.status, "IZIN");
  assert.equal(second.keterangan, "Acara keluarga");
  assert.equal(createCalls, 1);
  assert.equal(stored.status, "IZIN");

  // Teacher set SAKIT -> still protected
  stored = { status: "SAKIT", keterangan: "Demam", waktuHadir: null };
  const third = await recordStudentLoginAttendance(mockDb, {
    sekolahId: "sch-1",
    siswaId: "sis-1",
    kelasId: "kls-1",
    now: fixedNow,
  });
  assert.equal(third.created, false);
  assert.equal(third.status, "SAKIT");
  assert.equal(createCalls, 1);
});

test("buildMonthlyCalendarSummary aggregates daily status counts for monthly calendar indicators", () => {
  const summary = buildMonthlyCalendarSummary(
    [
      { tanggal: new Date("2026-11-10T00:00:00.000Z"), status: "HADIR" },
      { tanggal: new Date("2026-11-10T00:00:00.000Z"), status: "HADIR" },
      { tanggal: new Date("2026-11-10T00:00:00.000Z"), status: "SAKIT" },
      { tanggal: new Date("2026-11-12T00:00:00.000Z"), status: "ALPA" },
    ],
    4,
  );
  assert.deepEqual(summary["2026-11-10"], { totalSiswa: 4, terisi: 3, hadir: 2, izin: 0, sakit: 1, alpa: 0 });
  assert.deepEqual(summary["2026-11-12"], { totalSiswa: 4, terisi: 1, hadir: 0, izin: 0, sakit: 0, alpa: 1 });
});
