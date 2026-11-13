import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { parseGrade, parseLearningContent, parseSubmission } from "./learning-input.js";

type LearningSession = { sekolahId: string; peran: "SISWA" | "GURU"; siswaId: string | null; kelasId: string | null; guruId: string | null; wajibGantiPassword: boolean };
type GetSession = (cookie: string | undefined) => Promise<LearningSession | null>;

export function learningRoutes(getSession: GetSession, today: () => Date) {
  const router = Router();
  router.use(async (req, res, next) => {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Materi dan tugas belum tersedia untuk produksi." });
    try {
      const session = await getSession(req.headers.cookie);
      if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
      if (session.wajibGantiPassword) return res.status(403).json({ error: "Ganti password awal sebelum mengakses LMS." });
      res.locals.learning = session;
      next();
    } catch (error) {
      console.error("Gagal memeriksa sesi pembelajaran:", error);
      return res.status(503).json({ error: "Sesi pembelajaran tidak tersedia." });
    }
  });
  const scope = (s: LearningSession) => ({
    sekolahId: s.sekolahId,
    ...(s.peran === "GURU" ? { guruId: s.guruId ?? "" } : { kelasId: s.kelasId ?? "" }),
    kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId },
    tahunAjaran: { sekolahId: s.sekolahId, mulai: { lte: today() }, selesai: { gte: today() } },
  });
  const page = (value: unknown) => value === undefined ? 1 : typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
  const select = { id: true, judul: true, createdAt: true, kelas: { select: { nama: true } }, mapel: { select: { nama: true } }, guru: { select: { nama: true } }, tahunAjaran: { select: { nama: true, semester: true } } } as const;

  router.get("/penugasan", async (_req, res) => {
    const s: LearningSession = res.locals.learning;
    if (s.peran !== "GURU" || !s.guruId) return res.status(403).json({ error: "Hanya guru dapat membuat materi dan tugas." });
    try {
      const rows = await prisma.jadwalPelajaran.findMany({
        where: { ...scope(s), guruId: s.guruId },
        select: { id: true, hari: true, jamMulai: true, jamSelesai: true, kelas: { select: { nama: true } }, mapel: { select: { nama: true } }, tahunAjaran: { select: { nama: true, semester: true } } },
        orderBy: [{ hari: "asc" }, { jamMulai: "asc" }, { id: "asc" }], take: 2001,
      });
      if (rows.length > 2000) return res.status(409).json({ error: "Terlalu banyak jadwal; hubungi admin sekolah." });
      return res.json({ rows });
    } catch (error) {
      console.error("Gagal memuat penugasan guru:", error);
      return res.status(503).json({ error: "Penugasan guru belum dapat dimuat." });
    }
  });

  router.get("/:kind(materi|tugas)", async (req, res) => {
    const s: LearningSession = res.locals.learning;
    const p = page(req.query.page);
    if (!p) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    try {
      const common = { where: scope(s), orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], skip: (p - 1) * 25, take: 26 };
      if (req.params.kind === "materi") {
        const rows = await prisma.materiAjar.findMany({ ...common, select: { ...select, deskripsi: true, tautan: true } });
        return res.json({ rows: rows.slice(0, 25), page: p, hasNext: rows.length > 25 });
      }
      const rows = await prisma.tugas.findMany({ ...common, select: { ...select, instruksi: true, batasWaktu: true, pengumpulan: { where: { siswaId: s.peran === "SISWA" ? s.siswaId ?? "" : "" }, select: { id: true, jawaban: true, tautan: true, dikumpulkanPada: true, nilai: true, catatanGuru: true } } } });
      return res.json({ rows: rows.slice(0, 25), page: p, hasNext: rows.length > 25 });
    } catch (error) {
      console.error("Gagal memuat materi atau tugas:", error);
      return res.status(503).json({ error: "Materi atau tugas belum dapat dimuat." });
    }
  });

  router.post("/:kind(materi|tugas)", async (req, res) => {
    const s: LearningSession = res.locals.learning;
    if (s.peran !== "GURU" || !s.guruId) return res.status(403).json({ error: "Hanya guru dapat membuat materi dan tugas." });
    const kind = req.params.kind === "materi" ? "materi" : "tugas";
    const data = parseLearningContent(req.body, kind);
    if (!data) return res.status(400).json({ error: "Periksa jadwal, judul, isi, tautan HTTPS, dan batas waktu." });
    try {
      const schedule = await prisma.jadwalPelajaran.findFirst({ where: { ...scope(s), id: data.jadwalId, guruId: s.guruId }, select: { tahunAjaranId: true, kelasId: true, mapelId: true } });
      if (!schedule) return res.status(404).json({ error: "Jadwal aktif tidak ditemukan." });
      const base = { ...schedule, sekolahId: s.sekolahId, guruId: s.guruId, judul: data.judul };
      const result = kind === "materi"
        ? await prisma.materiAjar.create({ data: { ...base, deskripsi: data.isi, tautan: data.tautan, jenis: "TEKS_TAUTAN" }, select: { id: true } })
        : await prisma.tugas.create({ data: { ...base, instruksi: data.isi, batasWaktu: data.batasWaktu }, select: { id: true } });
      return res.status(201).json(result);
    } catch (error) {
      console.error("Gagal membuat materi atau tugas:", error);
      return res.status(503).json({ error: "Materi atau tugas belum dapat disimpan." });
    }
  });

  router.post("/tugas/:id/pengumpulan", async (req, res) => {
    const s: LearningSession = res.locals.learning;
    if (s.peran !== "SISWA" || !s.siswaId || !s.kelasId) return res.status(403).json({ error: "Hanya siswa yang ditempatkan di kelas dapat mengumpulkan tugas." });
    const data = parseSubmission(req.body);
    if (!data) return res.status(400).json({ error: "Isi jawaban atau tautan HTTPS yang valid." });
    try {
      const task = await prisma.tugas.findFirst({ where: { ...scope(s), id: req.params.id }, select: { id: true } });
      if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan." });
      await prisma.pengumpulanTugas.create({ data: { ...data, tugasId: task.id, siswaId: s.siswaId } });
      return res.status(201).json({ message: "Tugas dikumpulkan." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "Tugas sudah dikumpulkan dan belum dapat diubah." });
      console.error("Gagal mengumpulkan tugas:", error);
      return res.status(503).json({ error: "Tugas belum dapat dikumpulkan." });
    }
  });

  router.get("/tugas/:id/pengumpulan", async (req, res) => {
    const s: LearningSession = res.locals.learning;
    if (s.peran !== "GURU" || !s.guruId) return res.status(403).json({ error: "Hanya guru pemilik tugas dapat melihat jawaban." });
    const p = page(req.query.page);
    if (!p) return res.status(400).json({ error: "Nomor halaman tidak valid." });
    try {
      const task = await prisma.tugas.findFirst({ where: { ...scope(s), id: req.params.id }, select: { id: true, kelasId: true, batasWaktu: true } });
      if (!task) return res.status(404).json({ error: "Tugas tidak ditemukan." });
      const rows = await prisma.pengumpulanTugas.findMany({
        where: { tugasId: task.id, siswa: { sekolahId: s.sekolahId } },
        select: { id: true, jawaban: true, tautan: true, dikumpulkanPada: true, nilai: true, catatanGuru: true, siswa: { select: { nama: true, nisn: true } } },
        orderBy: [{ dikumpulkanPada: "asc" }, { id: "asc" }], skip: (p - 1) * 25, take: 26,
      });
      return res.json({ rows: rows.slice(0, 25), page: p, hasNext: rows.length > 25, batasWaktu: task.batasWaktu });
    } catch (error) {
      console.error("Gagal memuat pengumpulan:", error);
      return res.status(503).json({ error: "Pengumpulan belum dapat dimuat." });
    }
  });

  router.patch("/tugas/:id/pengumpulan/:submissionId", async (req, res) => {
    const s: LearningSession = res.locals.learning;
    if (s.peran !== "GURU" || !s.guruId) return res.status(403).json({ error: "Hanya guru pemilik tugas dapat memberi nilai." });
    const data = parseGrade(req.body);
    if (!data) return res.status(400).json({ error: "Nilai harus antara 0 dan 100; komentar maksimal 2000 karakter." });
    try {
      const result = await prisma.pengumpulanTugas.updateMany({
        where: { id: req.params.submissionId, tugasId: req.params.id, siswa: { sekolahId: s.sekolahId }, tugas: scope(s) },
        data,
      });
      if (!result.count) return res.status(404).json({ error: "Tugas atau pengumpulan tidak ditemukan." });
      return res.json({ message: "Nilai disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan nilai tugas:", error);
      return res.status(503).json({ error: "Nilai belum dapat disimpan." });
    }
  });
  return router;
}
