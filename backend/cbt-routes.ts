import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  resolveAuthorizedSchool,
  resolveTeacherScope,
  type SchoolContextResolver,
} from "./school-modules-shared.js";

function generateExamToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let token = "";
  for (let i = 0; i < 6; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}

export function tahap2CbtRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  async function canTeacherAccessExam(
    session: { sekolahId: string; peran: "ADMIN" | "GURU" | "SISWA"; guruId?: string | null },
    ujian: { guruId: string; kelasId: string; mapelId: string },
  ): Promise<boolean> {
    if (session.peran !== "GURU" || !session.guruId) return true;
    if (ujian.guruId === session.guruId) return true;
    const scope = await resolveTeacherScope(session.sekolahId, session.guruId);
    if (scope.isWaliKelas) return true;
    return scope.assignedKelasIds.includes(ujian.kelasId) && scope.assignedMapelIds.includes(ujian.mapelId);
  }

  // ==========================================
  // 1. PAKET UJIAN & JADWAL CBT (REGULER+)
  // ==========================================
  router.get("/cbt/ujian", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;
      const teacherScope = peran === "GURU" && sessionGuruId ? await resolveTeacherScope(sekolahId, sessionGuruId) : null;
      const restrictToAssigned = Boolean(teacherScope && !teacherScope.isWaliKelas);

      const [ujian, kelas, mapel, guru, tahunAjaran, settings] = await Promise.all([
        prisma.ujian.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned && sessionGuruId
              ? {
                  OR: [
                    { guruId: sessionGuruId },
                    ...(teacherScope!.assignedKelasIds.length && teacherScope!.assignedMapelIds.length
                      ? [{ kelasId: { in: teacherScope!.assignedKelasIds }, mapelId: { in: teacherScope!.assignedMapelIds } }]
                      : []),
                  ],
                }
              : {}),
          },
          include: {
            kelas: { select: { id: true, nama: true } },
            mapel: { select: { id: true, nama: true } },
            guru: { select: { id: true, nama: true } },
            _count: { select: { soal: true, percobaan: true } },
          },
          orderBy: [{ mulai: "desc" }, { id: "desc" }],
          take: 200,
        }),
        prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedKelasIds } } : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.mapel.findMany({
          where: {
            sekolahId,
            ...(restrictToAssigned ? { id: { in: teacherScope!.assignedMapelIds } } : {}),
          },
          select: { id: true, nama: true, kkm: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.guru.findMany({
          where: {
            sekolahId,
            status: "Aktif",
            ...(peran === "GURU" && sessionGuruId ? { id: sessionGuruId } : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
        prisma.tahunAjaran.findMany({ where: { sekolahId }, select: { id: true, nama: true, semester: true }, orderBy: { mulai: "desc" }, take: 100 }),
        prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null),
      ]);

      return res.json({
        ujian,
        kelas,
        mapel,
        guru,
        tahunAjaran,
        pengaturan: settings ?? {
          sekolahId,
          acakUrutanSoal: true,
          acakOpsiJawaban: true,
          tampilkanNilaiLangsung: true,
          batasToleransiKeluarTab: 3,
          kkmDefault: 75,
          wajibToken: true,
        },
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Skema CBT belum dimigrasi pada database." });
      }
      console.error("Gagal memuat ujian CBT:", error);
      return res.status(503).json({ error: "Data ujian CBT belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const judul = cleanText(req.body?.judul, 180);
      const kelasId = cleanText(req.body?.kelasId, 100);
      const mapelId = cleanText(req.body?.mapelId, 100);
      let guruId = peran === "GURU" && sessionGuruId ? sessionGuruId : cleanText(req.body?.guruId, 100);
      let tahunAjaranId = cleanText(req.body?.tahunAjaranId, 100);
      const durasiMenit = cleanInt(req.body?.durasiMenit, 5, 360, 60);
      const kkm = Math.max(0, Math.min(100, Number(req.body?.kkm ?? 75)));
      const mulaiRaw = cleanText(req.body?.mulai, 40);
      const selesaiRaw = cleanText(req.body?.selesai, 40);
      const dipublikasikan = Boolean(req.body?.dipublikasikan);

      if (!judul || !kelasId || !mapelId) {
        return res.status(400).json({ error: "Judul ujian, kelas target, dan mata pelajaran wajib diisi." });
      }

      if (peran === "GURU" && sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas && (!scope.assignedKelasIds.includes(kelasId) || !scope.assignedMapelIds.includes(mapelId))) {
          return res.status(403).json({ error: "Anda hanya dapat membuat ujian untuk kelas dan mata pelajaran yang Anda ampu." });
        }
      }

      if (!guruId) {
        const firstGuru = await prisma.guru.findFirst({ where: { sekolahId, status: "Aktif" }, select: { id: true } });
        if (!firstGuru) return res.status(400).json({ error: "Tambahkan minimal satu guru aktif terlebih dahulu." });
        guruId = firstGuru.id;
      }

      if (!tahunAjaranId) {
        const firstYear = await prisma.tahunAjaran.findFirst({ where: { sekolahId }, orderBy: { mulai: "desc" }, select: { id: true } });
        if (firstYear) {
          tahunAjaranId = firstYear.id;
        } else {
          const yearNow = new Date().getUTCFullYear();
          const createdYear = await prisma.tahunAjaran.create({
            data: {
              sekolahId,
              nama: `${yearNow}/${yearNow + 1}`,
              semester: "Ganjil",
              mulai: new Date(`${yearNow}-07-01T00:00:00.000Z`),
              selesai: new Date(`${yearNow + 1}-06-30T00:00:00.000Z`),
            },
            select: { id: true },
          });
          tahunAjaranId = createdYear.id;
        }
      }

      const [kelas, mapel, guru, year] = await Promise.all([
        prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } }),
        prisma.mapel.findFirst({ where: { id: mapelId, sekolahId }, select: { id: true } }),
        prisma.guru.findFirst({ where: { id: guruId, sekolahId }, select: { id: true } }),
        prisma.tahunAjaran.findFirst({ where: { id: tahunAjaranId, sekolahId }, select: { id: true } }),
      ]);
      if (!kelas || !mapel || !guru || !year) {
        return res.status(400).json({ error: "Referensi kelas, mapel, guru, atau tahun ajaran tidak ditemukan." });
      }

      const now = new Date();
      const mulai = mulaiRaw ? new Date(mulaiRaw) : now;
      const selesai = selesaiRaw ? new Date(selesaiRaw) : new Date(mulai.getTime() + 2 * 60 * 60 * 1000);
      if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime()) || selesai <= mulai) {
        return res.status(400).json({ error: "Rentang waktu mulai & selesai ujian tidak valid." });
      }

      const settings = await prisma.cbtPengaturan.findUnique({ where: { sekolahId } }).catch(() => null);
      const tokenKode = generateExamToken();
      const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
      const kode = cleanText(req.body?.kode, 40).toUpperCase() || `CBT-${randomBytes(3).toString("hex").toUpperCase()}`;

      const created = await prisma.ujian.create({
        data: {
          sekolahId,
          tahunAjaranId,
          kelasId,
          mapelId,
          guruId,
          kode,
          judul,
          durasiMenit,
          mulai,
          selesai,
          kkm: Number.isFinite(kkm) ? kkm : (settings?.kkmDefault ?? 75),
          tokenKode,
          tokenHash,
          acakSoal: settings?.acakUrutanSoal ?? true,
          acakOpsi: settings?.acakOpsiJawaban ?? true,
          tampilNilai: settings?.tampilkanNilaiLangsung ?? true,
          toleransiKeluarTab: settings?.batasToleransiKeluarTab ?? 3,
          dipublikasikan,
        },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { soal: true, percobaan: true } },
        },
      });
      return res.status(201).json({ ujian: created, message: "Paket ujian CBT dibuat." });
    } catch (error) {
      console.error("Gagal membuat paket ujian CBT:", error);
      return res.status(503).json({ error: "Paket ujian CBT belum dapat disimpan." });
    }
  });

  router.patch("/cbt/ujian/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const existing = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (peran === "GURU" && sessionGuruId && existing.guruId !== sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengubah ujian ini." });
      }

      const data: Record<string, unknown> = {};
      if (typeof req.body?.judul === "string" && req.body.judul.trim()) data.judul = req.body.judul.trim().slice(0, 180);
      if (req.body?.durasiMenit !== undefined) data.durasiMenit = cleanInt(req.body.durasiMenit, 5, 360, existing.durasiMenit);
      if (req.body?.kkm !== undefined && Number.isFinite(Number(req.body.kkm))) data.kkm = Math.max(0, Math.min(100, Number(req.body.kkm)));
      if (typeof req.body?.kelasId === "string" && req.body.kelasId.trim()) {
        const kelas = await prisma.kelas.findFirst({ where: { id: req.body.kelasId, sekolahId }, select: { id: true } });
        if (!kelas) return res.status(400).json({ error: "Kelas target tidak ditemukan." });
        data.kelasId = kelas.id;
      }
      if (typeof req.body?.mulai === "string") {
        const mulai = new Date(req.body.mulai);
        if (!Number.isNaN(mulai.getTime())) data.mulai = mulai;
      }
      if (typeof req.body?.selesai === "string") {
        const selesai = new Date(req.body.selesai);
        if (!Number.isNaN(selesai.getTime())) data.selesai = selesai;
      }
      if (typeof req.body?.dipublikasikan === "boolean") data.dipublikasikan = req.body.dipublikasikan;

      const updated = await prisma.ujian.update({
        where: { id: existing.id },
        data,
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          guru: { select: { id: true, nama: true } },
          _count: { select: { soal: true, percobaan: true } },
        },
      });
      return res.json({ ujian: updated, message: "Jadwal & detail ujian diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui ujian CBT:", error);
      return res.status(503).json({ error: "Ujian CBT belum dapat diperbarui." });
    }
  });

  router.post("/cbt/ujian/:id/token", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId } = auth.session;

      const target = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true } });
      if (!target) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (peran === "GURU" && sessionGuruId && target.guruId !== sessionGuruId) {
        const scope = await resolveTeacherScope(sekolahId, sessionGuruId);
        if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengganti token ujian ini." });
      }

      const tokenKode = generateExamToken();
      const tokenHash = createHash("sha256").update(tokenKode).digest("hex");
      const updated = await prisma.ujian.updateMany({
        where: { id: req.params.id, sekolahId },
        data: { tokenKode, tokenHash },
      });
      if (!updated.count) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      return res.json({ tokenKode, message: "Token sesi ujian baru berhasil digenerasi." });
    } catch (error) {
      console.error("Gagal mengganti token CBT:", error);
      return res.status(503).json({ error: "Token ujian belum dapat diperbarui." });
    }
  });

  router.delete("/cbt/ujian/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran === "GURU" && auth.session.guruId) {
        const target = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId: auth.session.sekolahId }, select: { guruId: true } });
        if (!target) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
        if (target.guruId !== auth.session.guruId) {
          const scope = await resolveTeacherScope(auth.session.sekolahId, auth.session.guruId);
          if (!scope.isWaliKelas) return res.status(403).json({ error: "Anda hanya dapat menghapus ujian yang Anda buat." });
        }
      }
      const deleted = await prisma.ujian.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      return res.json({ message: "Paket ujian CBT dihapus." });
    } catch (error) {
      console.error("Gagal menghapus ujian CBT:", error);
      return res.status(503).json({ error: "Paket ujian CBT belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2. BANK SOAL (PG A-E & ESAI)
  // ==========================================
  router.get("/cbt/ujian/:id/soal", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        select: { id: true, judul: true, kode: true, guruId: true, kelasId: true, mapelId: true },
      });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses ke bank soal ujian ini." });
      }

      const soal = await prisma.soalUjian.findMany({
        where: { ujianId: ujian.id },
        include: { opsi: { orderBy: { kode: "asc" } } },
        orderBy: { urutan: "asc" },
      });
      return res.json({ ujian, soal });
    } catch (error) {
      console.error("Gagal memuat bank soal:", error);
      return res.status(503).json({ error: "Daftar soal belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian/:id/soal", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk menambah soal pada ujian ini." });
      }

      const tipe = req.body?.tipe === "ESAI" ? "ESAI" : "PG";
      const teks = cleanText(req.body?.teks, 2000);
      const bobot = cleanInt(req.body?.bobot, 1, 100, 10);
      const kunciEsai = cleanText(req.body?.kunciEsai, 1000) || null;
      const pembahasan = cleanText(req.body?.pembahasan, 1000) || null;

      if (!teks) return res.status(400).json({ error: "Teks pertanyaan wajib diisi." });

      const rawOpsi = Array.isArray(req.body?.opsi) ? req.body.opsi : [];
      const opsiList: Array<{ kode: string; teks: string; benar: boolean }> = [];
      if (tipe === "PG") {
        const codes = ["A", "B", "C", "D", "E"];
        for (let i = 0; i < codes.length; i++) {
          const entry = rawOpsi.find((o: unknown) => typeof o === "object" && o !== null && (o as Record<string, unknown>).kode === codes[i]) as Record<string, unknown> | undefined;
          const optText = entry ? cleanText(entry.teks, 500) : "";
          if (optText) {
            opsiList.push({ kode: codes[i], teks: optText, benar: Boolean(entry?.benar) });
          }
        }
        if (opsiList.length < 2 || !opsiList.some((o) => o.benar)) {
          return res.status(400).json({ error: "Soal pilihan ganda minimal 2 opsi jawaban dan 1 kunci benar." });
        }
      }

      const lastSoal = await prisma.soalUjian.findFirst({
        where: { ujianId: ujian.id },
        orderBy: { urutan: "desc" },
        select: { urutan: true },
      });
      const nextUrutan = (lastSoal?.urutan ?? 0) + 1;

      const created = await prisma.soalUjian.create({
        data: {
          ujianId: ujian.id,
          urutan: nextUrutan,
          tipe,
          teks,
          bobot,
          kunciEsai,
          pembahasan,
          ...(opsiList.length ? { opsi: { create: opsiList } } : {}),
        },
        include: { opsi: { orderBy: { kode: "asc" } } },
      });

      return res.status(201).json({ soal: created, message: "Butir soal ditambahkan." });
    } catch (error) {
      console.error("Gagal menambah soal CBT:", error);
      return res.status(503).json({ error: "Butir soal belum dapat disimpan." });
    }
  });

  router.delete("/cbt/ujian/:id/soal/:soalId", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk menghapus soal pada ujian ini." });
      }

      const deleted = await prisma.soalUjian.deleteMany({
        where: { id: req.params.soalId, ujianId: ujian.id },
      });
      if (!deleted.count) return res.status(404).json({ error: "Soal tidak ditemukan." });
      return res.json({ message: "Butir soal dihapus." });
    } catch (error) {
      console.error("Gagal menghapus soal CBT:", error);
      return res.status(503).json({ error: "Butir soal belum dapat dihapus." });
    }
  });

  // ==========================================
  // 3. MONITORING UJIAN LIVE & PENGATURAN CBT
  // ==========================================
  router.get("/cbt/ujian/:id/monitoring", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const ujian = await prisma.ujian.findFirst({
        where: { id: req.params.id, sekolahId },
        include: {
          kelas: { select: { id: true, nama: true } },
          mapel: { select: { id: true, nama: true } },
          _count: { select: { soal: true } },
        },
      });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk memantau ujian ini." });
      }

      const [students, attempts] = await Promise.all([
        prisma.siswa.findMany({
          where: { sekolahId, kelasId: ujian.kelasId, status: "Aktif" },
          select: { id: true, nama: true, nisn: true },
          orderBy: { nama: "asc" },
        }),
        prisma.percobaanUjian.findMany({
          where: { ujianId: ujian.id },
          include: { _count: { select: { jawaban: true } } },
        }),
      ]);

      const attemptMap = new Map(attempts.map((a) => [a.siswaId, a]));
      const peserta = students.map((student) => {
        const attempt = attemptMap.get(student.id);
        const status = attempt
          ? attempt.dikumpulkanPada
            ? "SELESAI"
            : attempt.status || "SEDANG_MENGERJAKAN"
          : "BELUM_MULAI";
        return {
          siswaId: student.id,
          nama: student.nama,
          nisn: student.nisn,
          percobaanId: attempt?.id ?? null,
          status,
          dimulaiPada: attempt?.dimulaiPada ?? null,
          dikumpulkanPada: attempt?.dikumpulkanPada ?? null,
          terjawab: attempt?._count.jawaban ?? 0,
          totalSoal: ujian._count.soal,
          nilai: attempt?.nilai ?? null,
          tabViolations: attempt?.tabViolations ?? 0,
        };
      });

      return res.json({ ujian, peserta });
    } catch (error) {
      console.error("Gagal memuat monitoring CBT:", error);
      return res.status(503).json({ error: "Data monitoring ujian belum dapat dimuat." });
    }
  });

  router.post("/cbt/ujian/:id/reset-peserta", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100);
      if (!siswaId) return res.status(400).json({ error: "ID peserta wajib diisi." });

      const ujian = await prisma.ujian.findFirst({ where: { id: req.params.id, sekolahId }, select: { id: true, guruId: true, kelasId: true, mapelId: true } });
      if (!ujian) return res.status(404).json({ error: "Paket ujian tidak ditemukan." });
      if (!await canTeacherAccessExam(auth.session, ujian)) {
        return res.status(403).json({ error: "Anda tidak memiliki akses untuk mereset peserta pada ujian ini." });
      }

      await prisma.percobaanUjian.deleteMany({
        where: { ujianId: ujian.id, siswaId },
      });
      return res.json({ message: "Sesi ujian peserta direset; peserta dapat memulai ulang." });
    } catch (error) {
      console.error("Gagal mereset sesi peserta CBT:", error);
      return res.status(503).json({ error: "Sesi peserta belum dapat direset." });
    }
  });

  router.get("/cbt/pengaturan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const settings = await prisma.cbtPengaturan.findUnique({ where: { sekolahId } });
      return res.json({
        pengaturan: settings ?? {
          sekolahId,
          acakUrutanSoal: true,
          acakOpsiJawaban: true,
          tampilkanNilaiLangsung: true,
          batasToleransiKeluarTab: 3,
          kkmDefault: 75,
          wajibToken: true,
        },
      });
    } catch (error) {
      console.error("Gagal memuat pengaturan CBT:", error);
      return res.status(503).json({ error: "Pengaturan CBT belum dapat dimuat." });
    }
  });

  router.patch("/cbt/pengaturan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran !== "ADMIN") {
        return res.status(403).json({ error: "Pengaturan kebijakan CBT hanya dapat diubah oleh Admin Sekolah." });
      }
      const { sekolahId } = auth.session;

      const payload = {
        acakUrutanSoal: typeof req.body?.acakUrutanSoal === "boolean" ? req.body.acakUrutanSoal : true,
        acakOpsiJawaban: typeof req.body?.acakOpsiJawaban === "boolean" ? req.body.acakOpsiJawaban : true,
        tampilkanNilaiLangsung: typeof req.body?.tampilkanNilaiLangsung === "boolean" ? req.body.tampilkanNilaiLangsung : true,
        batasToleransiKeluarTab: cleanInt(req.body?.batasToleransiKeluarTab, 0, 20, 3),
        kkmDefault: Math.max(0, Math.min(100, Number(req.body?.kkmDefault ?? 75))),
        wajibToken: typeof req.body?.wajibToken === "boolean" ? req.body.wajibToken : true,
      };

      const saved = await prisma.cbtPengaturan.upsert({
        where: { sekolahId },
        create: { sekolahId, ...payload },
        update: payload,
      });
      return res.json({ pengaturan: saved, message: "Pengaturan aturan CBT disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan pengaturan CBT:", error);
      return res.status(503).json({ error: "Pengaturan CBT belum dapat disimpan." });
    }
  });

  return router;
}
