import { Router } from "express";
import type { Request } from "express";
import { prisma } from "./db.js";
import { readSchoolKopSurat } from "./kop-surat-helper.js";
import { cleanInt, cleanText, resolveAuthorizedSchool, type SchoolSessionInfo } from "./school-modules-shared.js";

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function buildNextNomorSurat(
  lastNomorSurat: string | null | undefined,
  lastNomorUrut: number,
  nextNomorUrut: number,
  tahun: number,
  now: Date = new Date(),
): string {
  const paddedNext = String(nextNomorUrut).padStart(3, "0");
  const romanMonth = ROMAN_MONTHS[now.getMonth()] ?? "I";

  if (lastNomorSurat && lastNomorSurat.trim()) {
    const trimmed = lastNomorSurat.trim();
    const lastStr = String(lastNomorUrut);
    const paddedLast = lastStr.padStart(3, "0");
    // Try replacing the padded or exact sequence number token inside the school's existing format
    if (lastNomorUrut > 0) {
      const paddedRegex = new RegExp(`(^|[^0-9])(${paddedLast})([^0-9]|$)`);
      if (paddedRegex.test(trimmed)) {
        return trimmed.replace(paddedRegex, `$1${paddedNext}$3`);
      }
      const exactRegex = new RegExp(`(^|[^0-9])(${lastStr})([^0-9]|$)`);
      if (exactRegex.test(trimmed)) {
        const replacement = lastStr.length >= 2 ? String(nextNomorUrut).padStart(lastStr.length, "0") : String(nextNomorUrut);
        return trimmed.replace(exactRegex, `$1${replacement}$3`);
      }
    }
  }

  return `${paddedNext}/PKBM/${romanMonth}/${tahun}`;
}

function parseDateOnly(raw: unknown): Date {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
    const parsed = new Date(`${raw.trim().slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function mailAgendaRoutes(
  getSchoolSession: (req: Request) => Promise<SchoolSessionInfo | null>,
) {
  const router = Router();

  // GET /api/sekolah/agenda-surat/next-keluar?tahun=2026 — Baca nomor urut terakhir Surat Keluar untuk Transkrip Nilai
  router.get("/agenda-surat/next-keluar", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const currentYear = new Date().getFullYear();
      const rawYear = typeof req.query.tahun === "string" ? req.query.tahun.trim() : "";
      const tahun = /^\d{4}$/.test(rawYear) ? Number(rawYear) : currentYear;

      const lastKeluar = await prisma.agendaSurat.findFirst({
        where: { sekolahId, jenis: "KELUAR", tahun },
        orderBy: [{ nomorUrut: "desc" }, { createdAt: "desc" }],
        select: { id: true, nomorUrut: true, nomorSurat: true, tanggalSurat: true, perihal: true },
      });

      const lastNomorUrut = lastKeluar?.nomorUrut ?? 0;
      const nextNomorUrut = lastNomorUrut + 1;
      const suggestedNomorSurat = buildNextNomorSurat(
        lastKeluar?.nomorSurat,
        lastNomorUrut,
        nextNomorUrut,
        tahun,
      );

      return res.json({
        tahun,
        lastNomorUrut,
        nextNomorUrut,
        lastNomorSurat: lastKeluar?.nomorSurat ?? null,
        lastPerihal: lastKeluar?.perihal ?? null,
        suggestedNomorSurat,
      });
    } catch (error) {
      console.error("Gagal membaca nomor surat keluar terakhir:", error);
      return res.status(503).json({ error: "Nomor surat keluar terakhir belum dapat dimuat." });
    }
  });

  // GET /api/sekolah/agenda-surat?jenis=KELUAR|MASUK|ALL&tahun=2026&q=...
  router.get("/agenda-surat", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const currentYear = new Date().getFullYear();
      const rawYear = typeof req.query.tahun === "string" ? req.query.tahun.trim() : "";
      const tahun = /^\d{4}$/.test(rawYear) ? Number(rawYear) : currentYear;
      const rawJenis = typeof req.query.jenis === "string" ? req.query.jenis.trim().toUpperCase() : "ALL";
      const jenisFilter = rawJenis === "MASUK" || rawJenis === "KELUAR" ? rawJenis : null;
      const q = cleanText(req.query.q, 100);

      const [school, kopSurat, rows, lastMasuk, lastKeluar, yearsRaw] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, slug: true, npsn: true, alamatSekolah: true, kabupatenKota: true, namaKepalaSekolah: true },
        }),
        readSchoolKopSurat(sekolahId),
        prisma.agendaSurat.findMany({
          where: {
            sekolahId,
            tahun,
            ...(jenisFilter ? { jenis: jenisFilter } : {}),
            ...(q
              ? {
                  OR: [
                    { nomorSurat: { contains: q, mode: "insensitive" } },
                    { pengirimTujuan: { contains: q, mode: "insensitive" } },
                    { perihal: { contains: q, mode: "insensitive" } },
                    { keterangan: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: [{ nomorUrut: "desc" }, { createdAt: "desc" }],
          take: 1000,
        }),
        prisma.agendaSurat.findFirst({
          where: { sekolahId, jenis: "MASUK", tahun },
          orderBy: [{ nomorUrut: "desc" }],
          select: { nomorUrut: true, nomorSurat: true },
        }),
        prisma.agendaSurat.findFirst({
          where: { sekolahId, jenis: "KELUAR", tahun },
          orderBy: [{ nomorUrut: "desc" }],
          select: { nomorUrut: true, nomorSurat: true },
        }),
        prisma.agendaSurat.findMany({
          where: { sekolahId },
          select: { tahun: true },
          distinct: ["tahun"],
          orderBy: { tahun: "desc" },
          take: 20,
        }),
      ]);

      const yearSet = new Set<number>([currentYear, tahun]);
      for (const y of yearsRaw) yearSet.add(y.tahun);
      const availableYears = Array.from(yearSet).sort((a, b) => b - a);

      const lastMasukNo = lastMasuk?.nomorUrut ?? 0;
      const lastKeluarNo = lastKeluar?.nomorUrut ?? 0;

      return res.json({
        sekolah: {
          nama: school?.nama ?? "PKBM",
          slug: school?.slug ?? "",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
        },
        kopSurat,
        tahun,
        availableYears,
        nextMasuk: {
          lastNomorUrut: lastMasukNo,
          nextNomorUrut: lastMasukNo + 1,
          suggestedNomorSurat: buildNextNomorSurat(lastMasuk?.nomorSurat, lastMasukNo, lastMasukNo + 1, tahun),
        },
        nextKeluar: {
          lastNomorUrut: lastKeluarNo,
          nextNomorUrut: lastKeluarNo + 1,
          suggestedNomorSurat: buildNextNomorSurat(lastKeluar?.nomorSurat, lastKeluarNo, lastKeluarNo + 1, tahun),
        },
        rows: rows.map((r) => ({
          id: r.id,
          jenis: r.jenis,
          tahun: r.tahun,
          nomorUrut: r.nomorUrut,
          nomorSurat: r.nomorSurat,
          tanggalSurat: r.tanggalSurat.toISOString().slice(0, 10),
          pengirimTujuan: r.pengirimTujuan,
          perihal: r.perihal,
          keterangan: r.keterangan,
        })),
      });
    } catch (error) {
      console.error("Gagal memuat agenda surat:", error);
      return res.status(503).json({ error: "Agenda surat belum dapat dimuat." });
    }
  });

  // POST /api/sekolah/agenda-surat — Tambah Surat Masuk atau Surat Keluar (otomatis atau manual nomor urut)
  router.post("/agenda-surat", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const rawJenis = cleanText(req.body?.jenis, 10).toUpperCase();
      const jenis: "MASUK" | "KELUAR" = rawJenis === "MASUK" ? "MASUK" : "KELUAR";
      const tanggalSurat = parseDateOnly(req.body?.tanggalSurat);
      const tahun = cleanInt(req.body?.tahun, 2000, 2100, tanggalSurat.getUTCFullYear());
      const pengirimTujuan = cleanText(req.body?.pengirimTujuan, 200);
      const perihal = cleanText(req.body?.perihal, 300);
      const keterangan = cleanText(req.body?.keterangan, 500) || null;

      if (!pengirimTujuan || !perihal) {
        return res.status(400).json({
          error: `${jenis === "MASUK" ? "Pengirim" : "Tujuan surat"} dan perihal wajib diisi.`,
        });
      }

      const last = await prisma.agendaSurat.findFirst({
        where: { sekolahId, jenis, tahun },
        orderBy: [{ nomorUrut: "desc" }],
        select: { nomorUrut: true, nomorSurat: true },
      });
      const lastNo = last?.nomorUrut ?? 0;

      const rawUrut = req.body?.nomorUrut;
      const nomorUrut =
        rawUrut !== undefined && rawUrut !== null && String(rawUrut).trim() !== ""
          ? cleanInt(rawUrut, 1, 999999, lastNo + 1)
          : lastNo + 1;

      const rawNomorSurat = cleanText(req.body?.nomorSurat, 120);
      const nomorSurat = rawNomorSurat || buildNextNomorSurat(last?.nomorSurat, lastNo, nomorUrut, tahun);

      const created = await prisma.agendaSurat.create({
        data: {
          sekolahId,
          jenis,
          tahun,
          nomorUrut,
          nomorSurat,
          tanggalSurat,
          pengirimTujuan,
          perihal,
          keterangan,
        },
      });

      return res.status(201).json({
        message: `${jenis === "MASUK" ? "Surat Masuk" : "Surat Keluar"} No. Urut ${created.nomorUrut} berhasil dicatat.`,
        entry: {
          ...created,
          tanggalSurat: created.tanggalSurat.toISOString().slice(0, 10),
        },
      });
    } catch (error) {
      console.error("Gagal mencatat agenda surat:", error);
      return res.status(503).json({ error: "Agenda surat belum dapat disimpan." });
    }
  });

  // DELETE /api/sekolah/agenda-surat/:id
  router.delete("/agenda-surat/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const id = cleanText(req.params.id, 100);
      if (!id) return res.status(400).json({ error: "ID surat tidak valid." });

      const deleted = await prisma.agendaSurat.deleteMany({
        where: { id, sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Data surat tidak ditemukan." });
      return res.json({ message: "Entri agenda surat dihapus." });
    } catch (error) {
      console.error("Gagal menghapus agenda surat:", error);
      return res.status(503).json({ error: "Agenda surat belum dapat dihapus." });
    }
  });

  return router;
}
