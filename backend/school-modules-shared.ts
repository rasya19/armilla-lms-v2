import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { hasPlanAccess, normalizeTenantPlan, type TenantPlan } from "./plan-utils.js";

export type SchoolSessionInfo = {
  sekolahId: string;
  nama: string;
  peran: "ADMIN" | "GURU" | "SISWA";
  guruId?: string | null;
};

export type SchoolContextResolver = (req: Request) => Promise<SchoolSessionInfo | null>;

export type TeacherScope = {
  isWaliKelas: boolean;
  waliKelasIds: string[];
  assignedKelasIds: string[];
  assignedMapelIds: string[];
  kelasMapelMap: Map<string, Set<string>>;
};

export async function resolveTeacherScope(sekolahId: string, guruId: string): Promise<TeacherScope> {
  const [allClasses, allMapel, schedules] = await Promise.all([
    prisma.kelas.findMany({
      where: { sekolahId },
      select: { id: true, waliGuruId: true },
      take: 500,
    }),
    prisma.mapel.findMany({
      where: { sekolahId },
      select: { id: true },
      take: 500,
    }),
    prisma.jadwalPelajaran.findMany({
      where: { sekolahId, guruId },
      select: { kelasId: true, mapelId: true },
      take: 2000,
    }),
  ]);

  const waliKelasIds = allClasses.filter((k) => k.waliGuruId === guruId).map((k) => k.id);
  const kelasSet = new Set<string>(allClasses.map((k) => k.id));
  const mapelSet = new Set<string>(allMapel.map((m) => m.id));
  const kelasMapelMap = new Map<string, Set<string>>();

  for (const row of schedules) {
    kelasSet.add(row.kelasId);
    mapelSet.add(row.mapelId);
    let mSet = kelasMapelMap.get(row.kelasId);
    if (!mSet) {
      mSet = new Set<string>();
      kelasMapelMap.set(row.kelasId, mSet);
    }
    mSet.add(row.mapelId);
  }

  return {
    isWaliKelas: waliKelasIds.length > 0,
    waliKelasIds,
    assignedKelasIds: [...kelasSet],
    assignedMapelIds: [...mapelSet],
    kelasMapelMap,
  };
}

export async function resolveAuthorizedSchool(
  req: Request,
  getSchoolSession: SchoolContextResolver,
  requiredPlan: TenantPlan = "basic",
): Promise<
  | { ok: true; session: SchoolSessionInfo; plan: TenantPlan }
  | { ok: false; status: number; error: string }
> {
  const session = await getSchoolSession(req);
  if (!session?.sekolahId) {
    return { ok: false, status: 401, error: "Sesi tidak valid." };
  }
  const school = await prisma.sekolah.findUnique({
    where: { id: session.sekolahId },
    select: { plan: true },
  });
  const plan = normalizeTenantPlan(school?.plan);
  if (!hasPlanAccess(plan, requiredPlan)) {
    const label = requiredPlan === "pro" ? "Paket Pro" : "Paket Reguler";
    return {
      ok: false,
      status: 403,
      error: `Fitur ini membutuhkan ${label}. Hubungi pengelola untuk upgrade paket.`,
    };
  }
  return { ok: true, session, plan };
}

export function isPrismaMissingSchema(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/")) return !trimmed.startsWith("//");
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function cleanInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}
