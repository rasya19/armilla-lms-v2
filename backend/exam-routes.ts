import { Router } from "express";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";
import { answersInput, examInput } from "./exam-input.js";

type Session = { sekolahId: string; peran: "ADMIN" | "GURU" | "SISWA"; guruId: string | null; siswaId: string | null; kelasId: string | null };

const SENSITIVE_CBT_KEYS = new Set([
  "benar",
  "isCorrect",
  "correctAnswer",
  "answerKey",
  "kunciJawaban",
  "kunciEsai",
  "explanation",
  "pembahasan",
  "tokenKode",
  "tokenHash",
]);

/**
 * Defense-in-depth sanitizer: recursively strips any answer-key, correctness flag,
 * explanation, or exam token fields before sending exam questions to a student.
 */
export function sanitizeStudentExamPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStudentExamPayload(item)) as unknown as T;
  }
  if (value instanceof Date || value === null || typeof value !== "object") {
    return value;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_CBT_KEYS.has(key)) continue;
    clean[key] = sanitizeStudentExamPayload(entry);
  }
  return clean as T;
}

function isAttemptFinalized(attempt: { dikumpulkanPada?: Date | null; status?: string | null } | null | undefined): boolean {
  if (!attempt) return false;
  if (attempt.dikumpulkanPada) return true;
  const normalizedStatus = typeof attempt.status === "string" ? attempt.status.trim().toUpperCase() : "";
  return normalizedStatus === "SELESAI" || normalizedStatus === "COMPLETED";
}

export function examRoutes(getSession: (req: Request) => Promise<Session | null>, today: () => Date) {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: "Sesi tidak valid." });
      res.locals.exam = session;
      next();
    } catch (error) { console.error("Gagal memeriksa sesi ujian:", error); return res.status(503).json({ error: "Sesi ujian tidak tersedia." }); }
  });
  const examWhere = (s: Session, id: string) => ({
    id, sekolahId: s.sekolahId, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: { sekolahId: s.sekolahId },
    ...(s.peran === "GURU" ? { guruId: s.guruId ?? "" } : s.peran === "SISWA" ? { kelasId: s.kelasId ?? "", dipublikasikan: true } : {}),
  });
  router.get("/jadwal/:kelasId", async (req, res) => {
    const s: Session = res.locals.exam;
    if (s.peran === "SISWA") return res.status(403).json({ error: "Akses ditolak." });
    try {
      const rows = await prisma.jadwalPelajaran.findMany({ where: { sekolahId: s.sekolahId, kelasId: req.params.kelasId, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId, status: "Aktif" }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: { sekolahId: s.sekolahId }, ...(s.peran === "GURU" ? { guruId: s.guruId ?? "" } : {}) }, select: { id: true, mapel: { select: { nama: true } }, guru: { select: { nama: true } }, tahunAjaran: { select: { nama: true, semester: true } } }, take: 2001 });
      if (rows.length > 2000) return res.status(409).json({ error: "Terlalu banyak jadwal." });
      return res.json({ rows });
    } catch (error) { console.error("Gagal memuat jadwal ujian:", error); return res.status(503).json({ error: "Jadwal ujian belum tersedia." }); }
  });
  router.get("/saya", async (_req, res) => {
    const s: Session = res.locals.exam;
    if (s.peran !== "SISWA" || !s.siswaId) return res.status(403).json({ error: "Hanya siswa yang dapat mengakses daftar ujian ini." });
    if (!s.kelasId) {
      return res.json({ belumDitempatkan: true, kelas: null, rows: [] });
    }
    try {
      const [kelas, rawRows] = await Promise.all([
        prisma.kelas.findFirst({ where: { id: s.kelasId, sekolahId: s.sekolahId }, select: { id: true, nama: true } }),
        prisma.ujian.findMany({
          where: {
            sekolahId: s.sekolahId,
            kelasId: s.kelasId,
            dipublikasikan: true,
            kelas: { sekolahId: s.sekolahId },
            guru: { sekolahId: s.sekolahId },
            mapel: { sekolahId: s.sekolahId },
            tahunAjaran: { sekolahId: s.sekolahId },
          },
          select: {
            id: true,
            kode: true,
            judul: true,
            mulai: true,
            selesai: true,
            durasiMenit: true,
            kkm: true,
            tokenKode: true,
            tampilNilai: true,
            mapel: { select: { nama: true } },
            guru: { select: { nama: true } },
            tahunAjaran: { select: { nama: true, semester: true } },
            _count: { select: { soal: true } },
            percobaan: {
              where: { siswaId: s.siswaId },
              select: { dimulaiPada: true, dikumpulkanPada: true, nilai: true, nilaiOverride: true, catatanGuru: true },
            },
          },
          orderBy: { mulai: "desc" },
          take: 200,
        }),
      ]);
      const rows = rawRows.map(({ tokenKode, _count, percobaan, ...rest }) => ({
        ...rest,
        percobaan: percobaan.map((p) => ({
          ...p,
          nilai: rest.tampilNilai || p.nilaiOverride !== null ? p.nilai : null,
          nilaiOverride: rest.tampilNilai || p.nilaiOverride !== null ? p.nilaiOverride : null,
        })),
        butuhToken: Boolean(tokenKode && tokenKode.trim().length > 0),
        jumlahSoal: _count.soal,
      }));
      return res.json({ belumDitempatkan: !kelas, kelas, rows });
    } catch (error) {
      console.error("Gagal memuat ujian siswa:", error);
      return res.status(503).json({ error: "Daftar ujian CBT belum tersedia." });
    }
  });
  router.get("/kelas/:kelasId", async (req, res) => {
    const s: Session = res.locals.exam;
    if (s.peran === "SISWA" && s.kelasId !== req.params.kelasId) return res.status(404).json({ error: "Kelas tidak ditemukan." });
    try {
      const kelas = await prisma.kelas.findFirst({ where: { id: req.params.kelasId, sekolahId: s.sekolahId }, select: { id: true } });
      if (!kelas) return res.status(404).json({ error: "Kelas tidak ditemukan." });
      const rawRows = await prisma.ujian.findMany({ where: { sekolahId: s.sekolahId, kelasId: kelas.id, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: { sekolahId: s.sekolahId }, ...(s.peran === "GURU" ? { guruId: s.guruId ?? "" } : s.peran === "SISWA" ? { dipublikasikan: true } : {}) }, select: { id: true, judul: true, mulai: true, selesai: true, durasiMenit: true, tampilNilai: true, mapel: { select: { nama: true } }, percobaan: { where: { siswaId: s.peran === "SISWA" ? s.siswaId ?? "" : "" }, select: { dikumpulkanPada: true, nilai: true, nilaiOverride: true } } }, orderBy: { mulai: "desc" }, take: 501 });
      if (rawRows.length > 500) return res.status(409).json({ error: "Terlalu banyak ujian." });
      const rows = s.peran === "SISWA"
        ? rawRows.map((row) => ({
            ...row,
            percobaan: row.percobaan.map((p) => ({
              ...p,
              nilai: row.tampilNilai || p.nilaiOverride !== null ? p.nilai : null,
              nilaiOverride: row.tampilNilai || p.nilaiOverride !== null ? p.nilaiOverride : null,
            })),
          }))
        : rawRows;
      return res.json({ rows });
    } catch (error) { console.error("Gagal memuat ujian:", error); return res.status(503).json({ error: "Ujian belum tersedia." }); }
  });
  router.post("/", async (req, res) => {
    const s: Session = res.locals.exam;
    if (s.peran === "SISWA" || (s.peran === "GURU" && !s.guruId)) return res.status(403).json({ error: "Akses ditolak." });
    const data = examInput(req.body);
    if (!data) return res.status(400).json({ error: "Periksa jadwal, waktu, durasi, dan soal ujian." });
    try {
      const jadwal = await prisma.jadwalPelajaran.findFirst({ where: { id: data.jadwalId, sekolahId: s.sekolahId, kelas: { sekolahId: s.sekolahId }, guru: { sekolahId: s.sekolahId, status: "Aktif" }, mapel: { sekolahId: s.sekolahId }, tahunAjaran: { sekolahId: s.sekolahId }, ...(s.peran === "GURU" ? { guruId: s.guruId ?? "" } : {}) }, select: { kelasId: true, guruId: true, mapelId: true, tahunAjaranId: true } });
      if (!jadwal) return res.status(404).json({ error: "Jadwal tidak ditemukan." });
      const exam = await prisma.ujian.create({ data: { sekolahId: s.sekolahId, ...jadwal, kode: randomBytes(16).toString("hex"), judul: data.judul, mulai: data.mulai, selesai: data.selesai, durasiMenit: data.durasiMenit, kkm: 75, dipublikasikan: true, soal: { create: data.soal.map((question, index) => ({ urutan: index + 1, teks: question.teks, opsi: { create: question.opsi.map((text, i) => ({ kode: "ABCD"[i], teks: text, benar: question.benar === "ABCD"[i] })) } })) } }, select: { id: true } });
      return res.status(201).json(exam);
    } catch (error) { console.error("Gagal membuat ujian:", error); return res.status(503).json({ error: "Ujian belum dapat dibuat." }); }
  });
  router.post("/:ujianId/mulai", async (req, res) => {
    const s: Session = res.locals.exam;
    if (s.peran !== "SISWA" || !s.siswaId || !s.kelasId) return res.status(403).json({ error: "Hanya siswa dapat memulai ujian." });
    const submittedToken = typeof req.body?.token === "string" ? req.body.token.trim().toUpperCase() : "";
    try {
      const result = await prisma.$transaction(async (tx) => {
        const students = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Siswa" WHERE "id" = ${s.siswaId} AND "sekolahId" = ${s.sekolahId} AND "kelasId" = ${s.kelasId} AND "status" = 'Aktif' FOR UPDATE`;
        if (!students.length) return { status: 409, error: "Penempatan kelas berubah." };
        const exam = await tx.ujian.findFirst({ where: { ...examWhere(s, req.params.ujianId), tahunAjaran: { sekolahId: s.sekolahId, mulai: { lte: today() }, selesai: { gte: today() } } }, select: { id: true, judul: true, mulai: true, selesai: true, durasiMenit: true, tokenKode: true, soal: { orderBy: { urutan: "asc" }, select: { id: true, urutan: true, teks: true, opsi: { orderBy: { kode: "asc" }, select: { kode: true, teks: true } } } } } });
        if (!exam) return { status: 409, error: "Ujian tidak ditemukan." };
        if (exam.soal.length === 0) return { status: 409, error: "Paket ujian ini belum memiliki butir soal." };
        const now = new Date();
        if (now < exam.mulai || now > exam.selesai) return { status: 409, error: "Ujian tidak sedang berlangsung." };
        let attempt = await tx.percobaanUjian.findUnique({ where: { ujianId_siswaId: { ujianId: exam.id, siswaId: s.siswaId ?? "" } } });
        if (isAttemptFinalized(attempt)) return { status: 409, error: "Ujian sudah dikumpulkan." };
        if (!attempt) {
          const requiredToken = typeof exam.tokenKode === "string" ? exam.tokenKode.trim().toUpperCase() : "";
          if (requiredToken && submittedToken !== requiredToken) {
            return { status: 403, error: "Token ujian tidak sesuai. Minta token aktif dari tutor atau proktor." };
          }
          attempt = await tx.percobaanUjian.create({ data: { ujianId: exam.id, siswaId: s.siswaId ?? "" } });
        }
        const deadline = new Date(Math.min(exam.selesai.getTime(), attempt.dimulaiPada.getTime() + exam.durasiMenit * 60000));
        if (now > deadline) return { status: 409, error: "Waktu pengerjaan telah berakhir." };
        const safeExam = sanitizeStudentExamPayload(exam);
        return { exam: { ...safeExam, deadline, siswaId: s.siswaId } };
      });
      if ("error" in result) return res.status(result.status).json({ error: result.error });
      return res.json(result.exam);
    } catch (error) { console.error("Gagal memulai ujian:", error); return res.status(503).json({ error: "Ujian belum dapat dimulai." }); }
  });
      router.post("/:ujianId/kumpulkan", async (req, res) => {
        const s: Session = res.locals.exam;
        if (s.peran !== "SISWA" || !s.siswaId || !s.kelasId) return res.status(403).json({ error: "Hanya siswa dapat mengumpulkan ujian." });
        const answers = answersInput(req.body?.jawaban);
        if (!answers) return res.status(400).json({ error: "Jawaban tidak valid." });
        const graceMs = req.body?.autoSubmit === true ? 60_000 : 0;
        try {
          const result = await prisma.$transaction(async (tx) => {
            const students = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Siswa" WHERE "id" = ${s.siswaId} AND "sekolahId" = ${s.sekolahId} AND "kelasId" = ${s.kelasId} AND "status" = 'Aktif' FOR UPDATE`;
            if (!students.length) return { kind: "missing" as const };
            const exam = await tx.ujian.findFirst({ where: examWhere(s, req.params.ujianId), select: { id: true, mulai: true, selesai: true, durasiMenit: true, tampilNilai: true, soal: { select: { id: true, opsi: { select: { id: true, kode: true, benar: true } } } } } });
            if (!exam) return { kind: "missing" as const };
            const attempt = await tx.percobaanUjian.findUnique({ where: { ujianId_siswaId: { ujianId: exam.id, siswaId: students[0].id } } });
            if (!attempt || isAttemptFinalized(attempt)) return { kind: "submitted" as const };
            const now = new Date();
            const deadlineMs = Math.min(exam.selesai.getTime(), attempt.dimulaiPada.getTime() + exam.durasiMenit * 60000);
            if (now < exam.mulai || now.getTime() > deadlineMs + graceMs) return { kind: "expired" as const };
            if (Object.keys(answers).some((id) => !exam.soal.some((question) => question.id === id))) return { kind: "invalid" as const };
            const values = exam.soal.map((question) => {
              const option = answers[question.id] ? question.opsi.find((item) => item.kode === answers[question.id]) : null;
              if (answers[question.id] && !option) throw new Error("INVALID_ANSWER");
              return { soalId: question.id, opsiId: option?.id ?? null, benar: option?.benar ?? false };
            });
            const score = exam.soal.length ? Math.round(values.filter((value) => value.benar).length / exam.soal.length * 10000) / 100 : 0;
            await tx.jawabanUjian.createMany({ data: values.map(({ soalId, opsiId }) => ({ percobaanId: attempt.id, soalId, opsiId })) });
            await tx.percobaanUjian.update({ where: { id: attempt.id }, data: { status: "SELESAI", dikumpulkanPada: now, nilai: score } });
            return { kind: "saved" as const, nilai: exam.tampilNilai ? score : null };
          });
          if (result.kind === "missing") return res.status(404).json({ error: "Ujian tidak ditemukan." });
          if (result.kind === "invalid") return res.status(400).json({ error: "Jawaban tidak sesuai soal." });
          if (result.kind === "submitted") return res.status(409).json({ error: "Ujian belum dimulai atau sudah dikumpulkan. Periksa kembali status ujian." });
          if (result.kind === "expired") return res.status(409).json({ error: "Waktu ujian telah berakhir. Hubungi guru untuk bantuan." });
          return res.json({ success: true, nilai: result.nilai });
        } catch (error) {
          if (error instanceof Error && error.message === "INVALID_ANSWER") return res.status(400).json({ error: "Jawaban tidak sesuai soal." });
          console.error("Gagal mengumpulkan ujian:", error); return res.status(503).json({ error: "Pengumpulan belum dapat dipastikan. Periksa status sebelum mencoba lagi." });
        }
      });
      router.get("/:ujianId/rekap", async (req, res) => {
        const s: Session = res.locals.exam;
        if (s.peran === "SISWA") return res.status(403).json({ error: "Akses ditolak." });
        try {
          const exam = await prisma.ujian.findFirst({ where: examWhere(s, req.params.ujianId), select: { id: true, judul: true, kelasId: true, soal: { orderBy: { urutan: "asc" }, select: { id: true, teks: true, urutan: true, opsi: { orderBy: { kode: "asc" }, select: { id: true, kode: true, teks: true, benar: true } } } } } });
          if (!exam) return res.status(404).json({ error: "Ujian tidak ditemukan." });
          const students = await prisma.siswa.findMany({ where: { sekolahId: s.sekolahId, kelasId: exam.kelasId, status: "Aktif" }, select: { id: true, nama: true, nisn: true }, orderBy: [{ nama: "asc" }, { id: "asc" }], take: 2001 });
          if (students.length > 2000) return res.status(409).json({ error: "Terlalu banyak siswa." });
          const attempts = await prisma.percobaanUjian.findMany({ where: { ujianId: exam.id, siswaId: { in: students.map((student) => student.id) } }, select: { siswaId: true, dikumpulkanPada: true, nilai: true, nilaiOverride: true, catatanGuru: true, jawaban: { select: { soalId: true, opsi: { select: { kode: true } } } } } });
          return res.json({ judul: exam.judul, soal: exam.soal, rows: students.map((student) => {
            const hasil = attempts.find((attempt) => attempt.siswaId === student.id);
            const benar = hasil?.jawaban.filter((answer) => exam.soal.some((question) => question.id === answer.soalId && question.opsi.some((option) => option.kode === answer.opsi?.kode && option.benar))).length ?? 0;
            const terjawab = hasil?.jawaban.filter((answer) => answer.opsi !== null).length ?? 0;
            return { ...student, hasil: hasil ? { ...hasil, jumlahBenar: benar, jumlahSalah: terjawab - benar, nilaiAkhir: hasil.nilaiOverride ?? hasil.nilai } : null };
          }) });
        } catch (error) { console.error("Gagal memuat rekap ujian:", error); return res.status(503).json({ error: "Rekap ujian belum tersedia." }); }
      });
      router.put("/:ujianId/hasil/:siswaId", async (req, res) => {
        const s: Session = res.locals.exam;
        if (s.peran === "SISWA" || (s.peran === "GURU" && !s.guruId)) return res.status(403).json({ error: "Akses ditolak." });
        const hasAnswers = req.body?.jawabanJson !== undefined;
        const hasOverride = req.body?.nilaiOverride !== undefined;
        const hasNote = req.body?.catatanGuru !== undefined;
        const incoming = hasAnswers ? answersInput(req.body.jawabanJson) : null;
        const override: unknown = req.body?.nilaiOverride;
        const note: unknown = req.body?.catatanGuru;
        if ((!hasAnswers && !hasOverride && !hasNote) || (hasAnswers && !incoming) || (hasOverride && override !== null && (typeof override !== "number" || !Number.isFinite(override) || override < 0 || override > 100)) || (hasNote && (typeof note !== "string" || note.length > 2000))) return res.status(400).json({ error: "Jawaban, nilai, atau catatan tidak valid." });
        try {
          const result = await prisma.$transaction(async (tx) => {
            const exam = await tx.ujian.findFirst({ where: examWhere(s, req.params.ujianId), select: { id: true, kelasId: true, soal: { select: { id: true, opsi: { select: { id: true, kode: true, benar: true } } } } } });
            if (!exam) return false;
            const students = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Siswa" WHERE "id" = ${req.params.siswaId} AND "sekolahId" = ${s.sekolahId} AND "kelasId" = ${exam.kelasId} AND "status" = 'Aktif' FOR UPDATE`;
            if (!students.length) return false;
            const previous = await tx.percobaanUjian.findUnique({ where: { ujianId_siswaId: { ujianId: exam.id, siswaId: students[0].id } }, include: { jawaban: { select: { soalId: true, opsi: { select: { kode: true } } } } } });
            const answers = incoming ?? Object.fromEntries((previous?.jawaban ?? []).map((answer) => [answer.soalId, answer.opsi?.kode ?? null]));
            if (Object.keys(answers).some((id) => !exam.soal.some((question) => question.id === id))) throw new Error("INVALID_ANSWER");
            const values = exam.soal.map((question) => {
              const selected = answers[question.id] ? question.opsi.find((option) => option.kode === answers[question.id]) : null;
              if (answers[question.id] && !selected) throw new Error("INVALID_ANSWER");
              return { soalId: question.id, opsiId: selected?.id ?? null, benar: selected?.benar ?? false };
            });
            const score = exam.soal.length ? Math.round(values.filter((value) => value.benar).length / exam.soal.length * 10000) / 100 : 0;
            const scoreOverride = hasOverride ? (typeof override === "number" ? override : null) : previous?.nilaiOverride ?? null;
            const comment = hasNote && typeof note === "string" ? note.trim() || null : previous?.catatanGuru ?? null;
            const attempt = await tx.percobaanUjian.upsert({ where: { ujianId_siswaId: { ujianId: exam.id, siswaId: students[0].id } }, create: { ujianId: exam.id, siswaId: students[0].id, dikumpulkanPada: new Date(), nilai: score, nilaiOverride: scoreOverride, catatanGuru: comment }, update: { dikumpulkanPada: new Date(), nilai: score, nilaiOverride: scoreOverride, catatanGuru: comment } });
            await tx.jawabanUjian.deleteMany({ where: { percobaanId: attempt.id } });
            await tx.jawabanUjian.createMany({ data: values.map(({ soalId, opsiId }) => ({ percobaanId: attempt.id, soalId, opsiId })) });
            return true;
          });
          if (!result) return res.status(404).json({ error: "Ujian atau siswa tidak ditemukan." });
          return res.json({ success: true });
        } catch (error) {
          if (error instanceof Error && error.message === "INVALID_ANSWER") return res.status(400).json({ error: "Jawaban tidak sesuai soal." });
          console.error("Gagal menyimpan nilai ujian:", error); return res.status(503).json({ error: "Nilai ujian belum dapat dipastikan." });
        }
      });
      router.delete("/:ujianId/hasil/:siswaId/reset", async (req, res) => {
        const s: Session = res.locals.exam;
        if (s.peran === "SISWA" || (s.peran === "GURU" && !s.guruId)) return res.status(403).json({ error: "Akses ditolak." });
        try {
          const result = await prisma.$transaction(async (tx) => {
            const exam = await tx.ujian.findFirst({ where: examWhere(s, req.params.ujianId), select: { id: true, kelasId: true } });
            if (!exam) return false;
            const students = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Siswa" WHERE "id" = ${req.params.siswaId} AND "sekolahId" = ${s.sekolahId} AND "kelasId" = ${exam.kelasId} AND "status" = 'Aktif' FOR UPDATE`;
            if (!students.length) return false;
            const attempt = await tx.percobaanUjian.findUnique({ where: { ujianId_siswaId: { ujianId: exam.id, siswaId: students[0].id } }, select: { id: true } });
            if (!attempt) return false;
            await tx.jawabanUjian.deleteMany({ where: { percobaanId: attempt.id } });
            await tx.percobaanUjian.delete({ where: { id: attempt.id } });
            return true;
          });
          if (!result) return res.status(404).json({ error: "Ujian, siswa, atau hasil tidak ditemukan." });
          return res.json({ success: true });
        } catch (error) { console.error("Gagal mereset ujian:", error); return res.status(503).json({ error: "Reset ujian belum dapat dipastikan." }); }
      });
  return router;
}
