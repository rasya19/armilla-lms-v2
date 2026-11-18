import { Router } from "express";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { parseTeacher } from "./school-input.js";
import { parseStudentImport } from "./student-import.js";
import { parsePlacement } from "./class-input.js";

export function schoolManagementRoutes(schoolForRequest: (req: Request) => Promise<string | null>) {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const sekolahId = await schoolForRequest(req);
      if (!sekolahId) return res.status(401).json({ error: "Sesi tidak valid." });
      res.locals.sekolahId = sekolahId;
      next();
    } catch (error) {
      console.error("Gagal memeriksa sesi sekolah:", error);
      return res.status(503).json({ error: "Sesi sekolah belum tersedia." });
    }
  });

  router.post("/siswa", async (req, res) => {
    const parsed = parseStudentImport([req.body]);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const placement = req.body?.kelasId === undefined ? { kelasId: null } : parsePlacement({ kelasId: req.body.kelasId, expectedKelasId: null });
    if (!placement) return res.status(400).json({ error: "Kelas awal tidak valid." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const data = { ...parsed.rows[0], sekolahId, status: "Aktif" };
      if (placement.kelasId) {
        const kelasId = placement.kelasId;
        const created = await prisma.$transaction(async (tx) => {
          const kelas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Kelas" WHERE "id" = ${kelasId} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
          if (!kelas.length) return false;
          await tx.siswa.create({ data: { ...data, kelasId } });
          return true;
        });
        if (!created) return res.status(400).json({ error: "Kelas awal tidak ditemukan di sekolah ini." });
      } else {
        await prisma.siswa.create({ data });
      }
      return res.status(201).json({ message: "Data siswa disimpan. Akun siswa belum dibuat." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "NISN sudah terdaftar. Periksa data atau hubungi master admin." });
      console.error("Gagal menyimpan data siswa:", error);
      return res.status(503).json({ error: "Data siswa belum dapat disimpan." });
    }
  });

  router.get("/:jenis(guru|siswa)/:id", async (req, res) => {
    try {
      const where = { id: req.params.id, sekolahId: res.locals.sekolahId as string };
      const data = req.params.jenis === "guru"
        ? await prisma.guru.findFirst({ where, select: { nama: true, nuptk: true, email: true, telepon: true, mapelUtama: true } })
        : await prisma.siswa.findFirst({ where, select: { nama: true, nisn: true, kelasId: true, status: true, email: true, telepon: true, nik: true, tempatLahir: true, tanggalLahir: true, jenisKelamin: true, jenjang: true, tanggalMasuk: true, jalurPendaftaran: true, namaAyah: true, teleponAyah: true, pekerjaanAyah: true, namaIbu: true, teleponIbu: true, pekerjaanIbu: true, namaWali: true, teleponWali: true, pekerjaanWali: true, alamatLengkap: true } });
      if (!data) return res.status(404).json({ error: "Data tidak ditemukan di sekolah ini." });
      return res.json(data);
    } catch (error) {
      console.error("Gagal memuat detail:", error);
      return res.status(503).json({ error: "Detail belum dapat dimuat." });
    }
  });

  router.patch("/:jenis(guru|siswa)/:id", async (req, res) => {
    const teacher = req.params.jenis === "guru" ? parseTeacher(req.body) : null;
    const parsedStudent = req.params.jenis === "siswa" ? parseStudentImport([req.body]) : null;
    const student = parsedStudent && "rows" in parsedStudent ? parsedStudent.rows[0] : null;
    if (!teacher && !student) return res.status(400).json({ error: "Periksa kembali nama, identitas, email, dan telepon." });
    const data = teacher ? { kind: "guru" as const, value: teacher } : student ? { kind: "siswa" as const, value: student } : null;
    if (!data) return res.status(400).json({ error: "Data tidak valid." });
    const hasPlacement = data.kind === "siswa" && (Object.prototype.hasOwnProperty.call(req.body, "kelasId") || Object.prototype.hasOwnProperty.call(req.body, "expectedKelasId"));
    const placement = hasPlacement ? parsePlacement(req.body) : null;
    if (hasPlacement && !placement) return res.status(400).json({ error: "Penempatan kelas tidak valid." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const id = req.params.id;
      const updated = await prisma.$transaction(async (tx) => {
        if (placement?.kelasId) {
          const kelas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Kelas" WHERE "id" = ${placement.kelasId} AND "sekolahId" = ${sekolahId} FOR UPDATE`;
          if (!kelas.length) throw new Error("INVALID_CLASS");
        }
        const where = { id, sekolahId };
        const optionalStudentFields = ["nik", "tempatLahir", "tanggalLahir", "jenisKelamin", "jenjang", "tanggalMasuk", "jalurPendaftaran", "namaAyah", "teleponAyah", "pekerjaanAyah", "namaIbu", "teleponIbu", "pekerjaanIbu", "namaWali", "teleponWali", "pekerjaanWali", "alamatLengkap"] as const;
        const extra = data.kind === "siswa" ? Object.fromEntries(optionalStudentFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field)).map((field) => [field, data.value[field] ?? null])) : {};
        const result = data.kind === "guru"
          ? await tx.guru.updateMany({ where, data: data.value })
          : await tx.siswa.updateMany({ where: { ...where, ...(placement ? { status: "Aktif", kelasId: placement.expectedKelasId } : {}) }, data: { ...data.value, ...extra, email: data.value.email ?? null, telepon: data.value.telepon ?? null, ...(placement ? { kelasId: placement.kelasId } : {}) } });
        if (!result.count) {
          if (placement) throw new Error("PLACEMENT_CONFLICT");
          return false;
        }
        const account = await tx.akun.findFirst({ where: data.kind === "guru" ? { guruId: id } : { siswaId: id }, select: { id: true, sekolahId: true, peran: true } });
        if (account) {
          if (account.sekolahId !== sekolahId || account.peran !== (data.kind === "guru" ? "GURU" : "SISWA")) throw new Error("ACCOUNT_CONFLICT");
          await tx.akun.update({ where: { id: account.id }, data: { nama: data.value.nama, ...(data.kind === "guru" ? { email: data.value.email } : {}) } });
          await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        return true;
      });
      if (!updated) return res.status(404).json({ error: "Data tidak ditemukan di sekolah ini." });
      return res.json({ message: "Data diperbarui." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "NISN, NUPTK, atau email akun sudah terdaftar." });
      if (error instanceof Error && error.message === "INVALID_CLASS") return res.status(400).json({ error: "Kelas tidak ditemukan di sekolah ini." });
      if (error instanceof Error && error.message === "PLACEMENT_CONFLICT") return res.status(409).json({ error: "Siswa tidak aktif, tidak ditemukan, atau kelasnya sudah berubah. Muat ulang data sebelum mencoba lagi." });
      if (error instanceof Error && error.message === "ACCOUNT_CONFLICT") return res.status(409).json({ error: "Data akun tidak sesuai dengan sekolah. Hubungi pengelola." });
      console.error("Gagal memperbarui data:", error);
      return res.status(503).json({ error: "Data belum dapat diperbarui." });
    }
  });

  router.patch("/:jenis(guru|siswa)/:id/status", async (req, res) => {
    const status = req.body?.status;
    if (status !== "Aktif" && status !== "Nonaktif") return res.status(400).json({ error: "Status tidak valid." });
    try {
      const sekolahId: string = res.locals.sekolahId;
      const id = req.params.id;
      const updated = await prisma.$transaction(async (tx) => {
        const where = { id, sekolahId };
        const result = req.params.jenis === "guru" ? await tx.guru.updateMany({ where, data: { status } }) : await tx.siswa.updateMany({ where, data: { status } });
        if (!result.count) return false;
        const account = await tx.akun.findFirst({ where: req.params.jenis === "guru" ? { guruId: id, sekolahId } : { siswaId: id, sekolahId }, select: { id: true } });
        if (account) await tx.sesiAkun.updateMany({ where: { akunId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
        return true;
      });
      if (!updated) return res.status(404).json({ error: "Data tidak ditemukan di sekolah ini." });
      return res.json({ message: status === "Aktif" ? "Data diaktifkan." : "Data dinonaktifkan; riwayat tetap tersimpan." });
    } catch (error) {
      console.error("Gagal mengubah status:", error);
      return res.status(503).json({ error: "Status belum dapat diubah." });
    }
  });

  return router;
}
