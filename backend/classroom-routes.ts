import { Router } from "express";
import type { Request } from "express";
import { prisma } from "./db.js";

export type ClassroomSession = { sekolahId: string; peran: "ADMIN" | "GURU" | "SISWA"; siswaId: string | null; kelasId: string | null; guruId?: string | null };
type GetSession = (req: Request) => Promise<ClassroomSession | null>;

export function classroomRoutes(getSession: GetSession, today: () => Date) {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: "Sesi tidak valid atau password awal belum diganti." });
      res.locals.classroom = session;
      next();
    } catch (error) {
      console.error("Gagal memeriksa sesi ruang kelas:", error);
      return res.status(503).json({ error: "Sesi ruang kelas belum tersedia." });
    }
  });

  router.get("/", async (_req, res) => {
    const s: ClassroomSession = res.locals.classroom;
    if (s.peran === "SISWA" && !s.kelasId) return res.json({ rows: [] });
    try {
      const activeYear = { sekolahId: s.sekolahId, mulai: { lte: today() }, selesai: { gte: today() } };
      let classes = await prisma.kelas.findMany({ where: { sekolahId: s.sekolahId, ...(s.peran === "SISWA" ? { id: s.kelasId ?? "" } : {}) }, select: { id: true, nama: true, waliGuruId: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 });
      if (classes.length > 500) return res.status(409).json({ error: "Terlalu banyak kelas untuk ditampilkan." });
      if (s.peran === "GURU" && s.guruId) {
        const isWali = classes.some((item) => item.waliGuruId === s.guruId);
        if (!isWali) {
          const teacherSchedules = await prisma.jadwalPelajaran.findMany({
            where: { sekolahId: s.sekolahId, guruId: s.guruId },
            select: { kelasId: true },
            take: 2000,
          });
          const assignedIds = new Set(teacherSchedules.map((item) => item.kelasId));
          classes = classes.filter((item) => assignedIds.has(item.id));
        }
      }
      const ids = classes.map((item) => item.id);
      if (!ids.length) return res.json({ rows: [] });
      const [teachers, counts, schedules, tasks] = await Promise.all([
        prisma.guru.findMany({ where: { sekolahId: s.sekolahId, id: { in: classes.flatMap((item) => item.waliGuruId ? [item.waliGuruId] : []) } }, select: { id: true, nama: true } }),
        prisma.siswa.groupBy({ by: ["kelasId"], where: { sekolahId: s.sekolahId, status: "Aktif", kelasId: { in: ids } }, _count: { _all: true } }),
        prisma.jadwalPelajaran.findMany({ where: { sekolahId: s.sekolahId, kelasId: { in: ids }, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: activeYear }, select: { kelasId: true, mapelId: true }, take: 20001 }),
        prisma.tugas.groupBy({ by: ["kelasId"], where: { sekolahId: s.sekolahId, kelasId: { in: ids }, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: activeYear, OR: [{ batasWaktu: null }, { batasWaktu: { gte: new Date() } }] }, _count: { _all: true } }),
      ]);
      if (schedules.length > 20000) return res.status(409).json({ error: "Terlalu banyak jadwal untuk ringkasan kelas." });
      return res.json({ rows: classes.map((item) => ({
        id: item.id, nama: item.nama, wali: teachers.find((teacher) => teacher.id === item.waliGuruId)?.nama ?? null,
        jumlahSiswa: counts.find((count) => count.kelasId === item.id)?._count._all ?? 0,
        jumlahMapel: new Set(schedules.filter((schedule) => schedule.kelasId === item.id).map((schedule) => schedule.mapelId)).size,
        tugasAktif: tasks.find((task) => task.kelasId === item.id)?._count._all ?? 0,
      })) });
    } catch (error) {
      console.error("Gagal memuat lobi ruang kelas:", error);
      return res.status(503).json({ error: "Lobi ruang kelas belum dapat dimuat." });
    }
  });

  router.get("/:kelasId", async (req, res) => {
    const s: ClassroomSession = res.locals.classroom;
    const kelasId = req.params.kelasId;
    if (s.peran === "SISWA" && kelasId !== s.kelasId) return res.status(404).json({ error: "Kelas tidak ditemukan." });
    try {
      const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId: s.sekolahId }, select: { id: true, nama: true, waliGuruId: true } });
      if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan." });
      const [wali, students, schedules, attendance] = await Promise.all([
        kelas.waliGuruId ? prisma.guru.findFirst({ where: { id: kelas.waliGuruId, sekolahId: s.sekolahId }, select: { nama: true } }) : Promise.resolve(null),
        prisma.siswa.findMany({ where: { sekolahId: s.sekolahId, kelasId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 2001 }),
        prisma.jadwalPelajaran.findMany({ where: { sekolahId: s.sekolahId, kelasId, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: { sekolahId: s.sekolahId, mulai: { lte: today() }, selesai: { gte: today() } } }, select: { mapel: { select: { id: true, nama: true } }, guru: { select: { id: true, nama: true } } }, take: 2001 }),
        s.peran === "SISWA" && s.siswaId ? prisma.presensi.findUnique({ where: { sekolahId_siswaId_tanggal: { sekolahId: s.sekolahId, siswaId: s.siswaId, tanggal: today() } }, select: { status: true } }) : Promise.resolve(null),
      ]);
      if (students.length > 2000 || schedules.length > 2000) return res.status(409).json({ error: "Anggota atau jadwal kelas melebihi batas tampilan." });
      const mapel = [...new Map(schedules.map((item) => [item.mapel.id, item.mapel])).values()].sort((a, b) => a.nama.localeCompare(b.nama));
      const guru = [...new Map(schedules.map((item) => [item.guru.id, item.guru])).values()].sort((a, b) => a.nama.localeCompare(b.nama));
      return res.json({ id: kelas.id, nama: kelas.nama, wali: wali?.nama ?? null, siswa: students, guru, mapel, presensi: attendance?.status ?? null });
    } catch (error) {
      console.error("Gagal memuat ruang kelas:", error);
      return res.status(503).json({ error: "Ruang kelas belum dapat dimuat." });
    }
  });

  router.post("/:kelasId/hadir", async (req, res) => {
    const s: ClassroomSession = res.locals.classroom;
    if (s.peran !== "SISWA" || !s.siswaId || !s.kelasId || req.params.kelasId !== s.kelasId) return res.status(403).json({ error: "Hanya siswa di kelas ini dapat mengonfirmasi kehadiran." });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const students = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Siswa" WHERE "id" = ${s.siswaId} AND "sekolahId" = ${s.sekolahId} AND "kelasId" = ${s.kelasId} AND "status" = 'Aktif' FOR UPDATE`;
        if (!students.length) return { kind: "moved" as const };
        const kelas = await tx.kelas.findFirst({ where: { id: s.kelasId ?? "", sekolahId: s.sekolahId }, select: { id: true } });
        if (!kelas) return { kind: "moved" as const };
        const date = today();
        const prior = await tx.presensi.findUnique({ where: { sekolahId_siswaId_tanggal: { sekolahId: s.sekolahId, siswaId: s.siswaId ?? "", tanggal: date } }, select: { status: true } });
        if (prior) return { kind: "existing" as const, status: prior.status };
        const years = await tx.tahunAjaran.findMany({ where: { sekolahId: s.sekolahId, mulai: { lte: date }, selesai: { gte: date } }, select: { id: true }, take: 2 });
        if (years.length !== 1) return { kind: "year" as const };
        await tx.presensi.create({ data: { sekolahId: s.sekolahId, kelasId: kelas.id, siswaId: s.siswaId ?? "", tahunAjaranId: years[0].id, tanggal: date, status: "HADIR", waktuHadir: new Date() } });
        return { kind: "created" as const, status: "HADIR" as const };
      });
      if (result.kind === "moved") return res.status(409).json({ error: "Penempatan kelas berubah. Muat ulang halaman." });
      if (result.kind === "year") return res.status(409).json({ error: "Konfirmasi hadir memerlukan tepat satu tahun ajaran aktif. Hubungi operator sekolah." });
      return res.json({ status: result.status, sudahAda: result.kind === "existing" });
    } catch (error) {
      console.error("Gagal mencatat kehadiran:", error);
      return res.status(503).json({ error: "Kehadiran belum dapat dipastikan. Muat ulang untuk memeriksa." });
    }
  });
  return router;
}
