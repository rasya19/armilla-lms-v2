import { Router } from "express";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { parseAcademicYear, parseSchedule, parseSubject } from "./academic-input.js";

export function academicRoutes(schoolForCookie: (cookie: string | undefined) => Promise<string | null>) {
  const router = Router();

  router.use(async (req, res, next) => {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Pengaturan akademik belum tersedia untuk produksi." });
    try {
      const sekolahId = await schoolForCookie(req.headers.cookie);
      if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
      res.locals.sekolahId = sekolahId;
      next();
    } catch (error) {
      console.error("Gagal memeriksa sesi akademik:", error);
      return res.status(503).json({ error: "Sesi sekolah belum tersedia." });
    }
  });

  router.get("/", async (_req, res) => {
    try {
      const sekolahId: string = res.locals.sekolahId;
      const [tahun, mapel, kelas, guru, jadwal] = await Promise.all([
        prisma.tahunAjaran.findMany({ where: { sekolahId }, select: { id: true, nama: true, semester: true, mulai: true, selesai: true }, orderBy: [{ mulai: "desc" }, { id: "asc" }], take: 501 }),
        prisma.mapel.findMany({ where: { sekolahId }, select: { id: true, nama: true, kkm: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
        prisma.guru.findMany({ where: { sekolahId, status: "Aktif" }, select: { id: true, nama: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 501 }),
        prisma.jadwalPelajaran.findMany({ where: { sekolahId }, select: { id: true, tahunAjaranId: true, kelasId: true, mapelId: true, guruId: true, hari: true, jamMulai: true, jamSelesai: true }, orderBy: [{ hari: "asc" }, { jamMulai: "asc" }, { id: "asc" }], take: 2001 }),
      ]);
      if (tahun.length > 500 || mapel.length > 500 || kelas.length > 500 || guru.length > 500 || jadwal.length > 2000) return res.status(409).json({ error: "Batas data akademik untuk uji lokal terlampaui." });
      return res.json({ tahun, mapel, kelas, guru, jadwal });
    } catch (error) {
      console.error("Gagal memuat data akademik:", error);
      return res.status(503).json({ error: "Data akademik belum dapat dimuat." });
    }
  });

  router.post("/tahun", async (req, res) => {
    const data = parseAcademicYear(req.body);
    if (!data) return res.status(400).json({ error: "Periksa nama, semester, dan tanggal tahun ajaran." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
        if (await tx.tahunAjaran.count({ where: { sekolahId } }) >= 500) throw new Error("LIMIT");
        return tx.tahunAjaran.create({ data: { ...data, sekolahId } });
      });
      return res.status(201).json({ id: result.id });
    } catch (error) {
      if (error instanceof Error && error.message === "LIMIT") return res.status(409).json({ error: "Batas 500 tahun ajaran tercapai." });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Nama tahun ajaran dan semester sudah ada." });
      console.error("Gagal menyimpan tahun ajaran:", error);
      return res.status(503).json({ error: "Tahun ajaran belum dapat disimpan." });
    }
  });

  router.patch("/tahun/:id", async (req, res) => {
    const data = parseAcademicYear(req.body);
    if (!data) return res.status(400).json({ error: "Periksa nama, semester, dan tanggal tahun ajaran." });
    try {
      const result = await prisma.tahunAjaran.updateMany({ where: { id: req.params.id, sekolahId: res.locals.sekolahId }, data });
      if (!result.count) return res.status(404).json({ error: "Tahun ajaran tidak ditemukan." });
      return res.json({ message: "Tahun ajaran diperbarui." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Nama tahun ajaran dan semester sudah ada." });
      console.error("Gagal memperbarui tahun ajaran:", error);
      return res.status(503).json({ error: "Tahun ajaran belum dapat diperbarui." });
    }
  });

  router.post("/mapel", async (req, res) => {
    const data = parseSubject(req.body);
    if (!data) return res.status(400).json({ error: "Periksa nama mata pelajaran dan KKM (0–100)." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
        if (await tx.mapel.count({ where: { sekolahId } }) >= 500) throw new Error("LIMIT");
        return tx.mapel.create({ data: { ...data, sekolahId, kode: randomBytes(16).toString("hex") } });
      });
      return res.status(201).json({ id: result.id });
    } catch (error) {
      if (error instanceof Error && error.message === "LIMIT") return res.status(409).json({ error: "Batas 500 mata pelajaran tercapai." });
      console.error("Gagal menyimpan mata pelajaran:", error);
      return res.status(503).json({ error: "Mata pelajaran belum dapat disimpan." });
    }
  });

  router.patch("/mapel/:id", async (req, res) => {
    const data = parseSubject(req.body);
    if (!data) return res.status(400).json({ error: "Periksa nama mata pelajaran dan KKM (0–100)." });
    try {
      const result = await prisma.mapel.updateMany({ where: { id: req.params.id, sekolahId: res.locals.sekolahId }, data });
      if (!result.count) return res.status(404).json({ error: "Mata pelajaran tidak ditemukan." });
      return res.json({ message: "Mata pelajaran diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui mata pelajaran:", error);
      return res.status(503).json({ error: "Mata pelajaran belum dapat diperbarui." });
    }
  });

  router.post("/jadwal", async (req, res) => {
    const data = parseSchedule(req.body);
    if (!data) return res.status(400).json({ error: "Periksa tahun ajaran, kelas, guru, mata pelajaran, hari, dan jam." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Sekolah" WHERE "id" = ${sekolahId} FOR UPDATE`;
        const [year, klass, subject, teacher] = await Promise.all([
          tx.tahunAjaran.findFirst({ where: { id: data.tahunAjaranId, sekolahId }, select: { id: true } }),
          tx.kelas.findFirst({ where: { id: data.kelasId, sekolahId }, select: { id: true } }),
          tx.mapel.findFirst({ where: { id: data.mapelId, sekolahId }, select: { id: true } }),
          tx.guru.findFirst({ where: { id: data.guruId, sekolahId, status: "Aktif" }, select: { id: true } }),
        ]);
        if (!year || !klass || !subject || !teacher) throw new Error("INVALID_REFERENCE");
        if (await tx.jadwalPelajaran.count({ where: { sekolahId } }) >= 2000) throw new Error("LIMIT");
        if (await tx.jadwalPelajaran.findFirst({ where: { ...data, sekolahId }, select: { id: true } })) throw new Error("DUPLICATE");
        return tx.jadwalPelajaran.create({ data: { ...data, sekolahId }, select: { id: true } });
      });
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_REFERENCE") return res.status(400).json({ error: "Data akademik atau guru aktif tidak ditemukan di sekolah ini." });
      if (error instanceof Error && error.message === "LIMIT") return res.status(409).json({ error: "Batas 2000 jadwal tercapai." });
      if (error instanceof Error && error.message === "DUPLICATE") return res.status(409).json({ error: "Jadwal yang sama sudah ada." });
      console.error("Gagal menyimpan jadwal:", error);
      return res.status(503).json({ error: "Jadwal belum dapat disimpan." });
    }
  });

  router.delete("/jadwal/:id", async (req, res) => {
    try {
      const result = await prisma.jadwalPelajaran.deleteMany({ where: { id: req.params.id, sekolahId: res.locals.sekolahId } });
      if (!result.count) return res.status(404).json({ error: "Jadwal tidak ditemukan." });
      return res.json({ message: "Jadwal dihapus." });
    } catch (error) {
      console.error("Gagal menghapus jadwal:", error);
      return res.status(503).json({ error: "Jadwal belum dapat dihapus." });
    }
  });

  return router;
}
