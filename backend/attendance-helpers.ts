import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_ACCOUNT_PASSWORD, isValidPasswordLength } from "./password.js";

export const LOGIN_ATTENDANCE_NOTE = "Login Daring";

export type AttendanceStatusCode = "HADIR" | "SAKIT" | "IZIN" | "ALPA";

export type StudentTodayAttendance = {
  tanggal: string;
  status: AttendanceStatusCode | null;
  keterangan: string | null;
  waktuHadir: string | null;
  created: boolean;
};

export type CalendarDaySummary = {
  totalSiswa: number;
  terisi: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
};

export function jakartaIsoDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function jakartaDate(now: Date = new Date()): Date {
  return new Date(`${jakartaIsoDate(now)}T00:00:00.000Z`);
}

export function parseRequestedAccountPassword(
  raw: unknown,
  fallback: string = DEFAULT_ACCOUNT_PASSWORD,
): { ok: boolean; password: string; error?: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, password: fallback };
  }
  if (typeof raw !== "string") {
    return { ok: false, password: "", error: "Format kata sandi tidak valid." };
  }
  if (raw.trim() === "") {
    return { ok: true, password: fallback };
  }
  if (!isValidPasswordLength(raw)) {
    return { ok: false, password: "", error: "Kata sandi harus terdiri dari 6–1024 karakter." };
  }
  return { ok: true, password: raw };
}

export function generateStudentUsernameFromName(nama: string, suffix?: string): string {
  const cleaned = nama
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
  const base = (cleaned || "siswa").slice(0, 18).replace(/\.+$/, "");
  const code = (suffix ?? randomBytes(2).toString("hex")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "0001";
  return `${base}.${code}`;
}

export function resolveStudentLoginUsername(
  siswa: { nama: string; nisn: string | null | undefined },
  existingAccountEmail?: string | null,
  suffix?: string,
): { username: string; storeInAccountEmail: string | null } {
  const trimmedNisn = typeof siswa.nisn === "string" ? siswa.nisn.trim() : "";
  if (trimmedNisn.length > 0) {
    return {
      username: trimmedNisn,
      storeInAccountEmail: existingAccountEmail ? existingAccountEmail.trim().toLowerCase() : null,
    };
  }
  const existing = typeof existingAccountEmail === "string" ? existingAccountEmail.trim().toLowerCase() : "";
  if (existing.length > 0) {
    return { username: existing, storeInAccountEmail: existing };
  }
  const generated = generateStudentUsernameFromName(siswa.nama, suffix);
  return { username: generated, storeInAccountEmail: generated };
}

type AttendanceDbLike = Pick<PrismaClient, "presensi" | "tahunAjaran">;

export async function recordStudentLoginAttendance(
  db: AttendanceDbLike,
  params: {
    sekolahId: string;
    siswaId: string;
    kelasId: string | null | undefined;
    now?: Date;
  },
): Promise<StudentTodayAttendance> {
  const now = params.now ?? new Date();
  const today = jakartaDate(now);
  const tanggal = today.toISOString().slice(0, 10);

  const existing = await db.presensi.findUnique({
    where: {
      sekolahId_siswaId_tanggal: {
        sekolahId: params.sekolahId,
        siswaId: params.siswaId,
        tanggal: today,
      },
    },
    select: { status: true, keterangan: true, waktuHadir: true },
  });

  // Protect manual teacher/admin entries (or earlier check-ins) from ever being overwritten
  if (existing) {
    return {
      tanggal,
      status: existing.status as AttendanceStatusCode,
      keterangan: existing.keterangan ?? null,
      waktuHadir: existing.waktuHadir ? existing.waktuHadir.toISOString() : null,
      created: false,
    };
  }

  if (!params.kelasId) {
    return {
      tanggal,
      status: null,
      keterangan: null,
      waktuHadir: null,
      created: false,
    };
  }

  let year =
    (await db.tahunAjaran.findFirst({
      where: { sekolahId: params.sekolahId, mulai: { lte: today }, selesai: { gte: today } },
      select: { id: true },
    })) ??
    (await db.tahunAjaran.findFirst({
      where: { sekolahId: params.sekolahId },
      orderBy: { mulai: "desc" },
      select: { id: true },
    }));

  if (!year) {
    const yearNum = today.getUTCFullYear();
    try {
      year = await db.tahunAjaran.create({
        data: {
          sekolahId: params.sekolahId,
          nama: `${yearNum}/${yearNum + 1}`,
          semester: "Ganjil",
          mulai: new Date(`${yearNum}-01-01T00:00:00.000Z`),
          selesai: new Date(`${yearNum}-12-31T23:59:59.000Z`),
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        year = await db.tahunAjaran.findFirst({
          where: { sekolahId: params.sekolahId },
          orderBy: { mulai: "desc" },
          select: { id: true },
        });
      } else {
        throw error;
      }
    }
  }

  if (!year?.id) {
    return {
      tanggal,
      status: null,
      keterangan: null,
      waktuHadir: null,
      created: false,
    };
  }

  try {
    const created = await db.presensi.create({
      data: {
        sekolahId: params.sekolahId,
        tahunAjaranId: year.id,
        kelasId: params.kelasId,
        siswaId: params.siswaId,
        tanggal: today,
        status: "HADIR",
        keterangan: LOGIN_ATTENDANCE_NOTE,
        waktuHadir: now,
      },
      select: { status: true, keterangan: true, waktuHadir: true },
    });
    return {
      tanggal,
      status: (created?.status as AttendanceStatusCode | undefined) ?? "HADIR",
      keterangan: created?.keterangan ?? LOGIN_ATTENDANCE_NOTE,
      waktuHadir: created?.waktuHadir ? created.waktuHadir.toISOString() : now.toISOString(),
      created: true,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await db.presensi.findUnique({
        where: {
          sekolahId_siswaId_tanggal: {
            sekolahId: params.sekolahId,
            siswaId: params.siswaId,
            tanggal: today,
          },
        },
        select: { status: true, keterangan: true, waktuHadir: true },
      });
      if (raced) {
        return {
          tanggal,
          status: raced.status as AttendanceStatusCode,
          keterangan: raced.keterangan ?? null,
          waktuHadir: raced.waktuHadir ? raced.waktuHadir.toISOString() : null,
          created: false,
        };
      }
    }
    throw error;
  }
}

export function buildMonthlyCalendarSummary(
  records: Array<{ tanggal: Date; status: string }>,
  totalSiswa: number,
): Record<string, CalendarDaySummary> {
  const map: Record<string, CalendarDaySummary> = {};
  for (const row of records) {
    const key = row.tanggal.toISOString().slice(0, 10);
    if (!map[key]) {
      map[key] = { totalSiswa, terisi: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    }
    const entry = map[key];
    entry.terisi += 1;
    if (row.status === "HADIR") entry.hadir += 1;
    else if (row.status === "IZIN") entry.izin += 1;
    else if (row.status === "SAKIT") entry.sakit += 1;
    else if (row.status === "ALPA") entry.alpa += 1;
  }
  return map;
}
