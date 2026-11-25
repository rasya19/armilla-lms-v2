import { Router } from "express";
import type { Request } from "express";
import { prisma } from "./db.js";
import { canAccessPlan } from "./plan-access.js";
import { readSchoolKopSurat } from "./kop-surat-helper.js";
import { cleanText, resolveAuthorizedSchool, type SchoolSessionInfo } from "./school-modules-shared.js";

function normalizeSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function formatWibDateParts(date: Date): { tanggal: string; waktu: string; iso: string } {
  const tanggal = date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const waktu = `${date.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  })} WIB`;
  return { tanggal, waktu, iso: date.toISOString() };
}

export function publicGuestbookRoutes() {
  const router = Router();

  // GET /api/buku-tamu/public/:slug — Info lembaga saat tamu scan QR Code
  router.get("/public/:slug", async (req, res) => {
    try {
      const slug = normalizeSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: "Alamat buku tamu tidak valid." });

      const school = await prisma.sekolah.findUnique({
        where: { slug },
        select: {
          id: true,
          nama: true,
          slug: true,
          npsn: true,
          alamatSekolah: true,
          kabupatenKota: true,
          plan: true,
          status: true,
        },
      });
      if (!school || school.status !== "ACTIVE") {
        return res.status(404).json({ error: "Lembaga PKBM tidak ditemukan atau sedang nonaktif." });
      }
      if (!canAccessPlan(school.plan, "reguler")) {
        return res.status(403).json({
          error: "Fitur Buku Tamu Digital QR hanya tersedia untuk lembaga pada Paket Reguler atau Pro.",
        });
      }

      const settings = await prisma.websiteSettings
        .findUnique({ where: { school_id: school.id }, select: { logo_url: true } })
        .catch(() => null);

      return res.json({
        sekolah: {
          id: school.id,
          nama: school.nama,
          slug: school.slug,
          npsn: school.npsn ?? null,
          alamat: school.alamatSekolah ?? null,
          kabupatenKota: school.kabupatenKota ?? null,
          logoUrl: settings?.logo_url ?? null,
        },
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Gagal memuat halaman buku tamu publik:", error);
      return res.status(503).json({ error: "Layanan buku tamu digital sedang tidak tersedia." });
    }
  });

  // POST /api/buku-tamu/public/:slug — Tamu mengisi buku tamu setelah scan QR
  router.post("/public/:slug", async (req, res) => {
    try {
      const slug = normalizeSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: "Alamat buku tamu tidak valid." });

      const school = await prisma.sekolah.findUnique({
        where: { slug },
        select: { id: true, nama: true, slug: true, plan: true, status: true },
      });
      if (!school || school.status !== "ACTIVE") {
        return res.status(404).json({ error: "Lembaga PKBM tidak ditemukan atau sedang nonaktif." });
      }
      if (!canAccessPlan(school.plan, "reguler")) {
        return res.status(403).json({
          error: "Fitur Buku Tamu Digital QR hanya tersedia untuk lembaga pada Paket Reguler atau Pro.",
        });
      }

      const nama = cleanText(req.body?.nama, 150);
      const alamat = cleanText(req.body?.alamat, 300);
      const noHp = cleanText(req.body?.noHp, 30);
      const tujuanKunjungan = cleanText(req.body?.tujuanKunjungan, 300);
      const instansi = cleanText(req.body?.instansi, 150) || null;

      if (!nama || nama.length < 2) {
        return res.status(400).json({ error: "Nama lengkap tamu wajib diisi (minimal 2 karakter)." });
      }
      if (!alamat || alamat.length < 3) {
        return res.status(400).json({ error: "Alamat tamu wajib diisi." });
      }
      if (!noHp || !/^[+0-9 ()-]{6,30}$/.test(noHp)) {
        return res.status(400).json({ error: "Nomor HP/WhatsApp wajib diisi dengan format yang valid." });
      }
      if (!tujuanKunjungan || tujuanKunjungan.length < 3) {
        return res.status(400).json({ error: "Tujuan kunjungan wajib diisi." });
      }

      const now = new Date();
      const created = await prisma.bukuTamu.create({
        data: {
          sekolahId: school.id,
          nama,
          alamat,
          noHp,
          tujuanKunjungan,
          instansi,
          tanggalKunjung: now,
        },
      });

      const formatted = formatWibDateParts(created.tanggalKunjung);
      return res.status(201).json({
        message: "Terima kasih! Data kunjungan Anda telah tercatat di Buku Tamu Digital.",
        entry: {
          id: created.id,
          nama: created.nama,
          alamat: created.alamat,
          noHp: created.noHp,
          tujuanKunjungan: created.tujuanKunjungan,
          instansi: created.instansi,
          tanggalKunjung: formatted.iso,
          tanggalLabel: formatted.tanggal,
          waktuLabel: formatted.waktu,
        },
      });
    } catch (error) {
      console.error("Gagal menyimpan buku tamu publik:", error);
      return res.status(503).json({ error: "Kunjungan belum dapat disimpan. Silakan coba lagi." });
    }
  });

  return router;
}

export function schoolGuestbookRoutes(
  getSchoolSession: (req: Request) => Promise<SchoolSessionInfo | null>,
) {
  const router = Router();

  // GET /api/sekolah/buku-tamu?tahun=2026&bulan=11&q=...
  router.get("/buku-tamu", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const rawYear = typeof req.query.tahun === "string" ? req.query.tahun.trim() : "";
      const rawMonth = typeof req.query.bulan === "string" ? req.query.bulan.trim() : "";
      const q = cleanText(req.query.q, 100);

      const currentYear = new Date().getUTCFullYear();
      const parsedYear = /^\d{4}$/.test(rawYear) ? Number(rawYear) : currentYear;
      const parsedMonth = /^(1[0-2]|[1-9])$/.test(rawMonth) ? Number(rawMonth) : null;

      // Build WIB-safe range (UTC+7 -> start at -07:00 UTC of day 1)
      const rangeStart = parsedMonth
        ? new Date(Date.UTC(parsedYear, parsedMonth - 1, 1, -7, 0, 0))
        : new Date(Date.UTC(parsedYear, 0, 1, -7, 0, 0));
      const rangeEnd = parsedMonth
        ? new Date(Date.UTC(parsedYear, parsedMonth, 1, -7, 0, 0))
        : new Date(Date.UTC(parsedYear + 1, 0, 1, -7, 0, 0));

      const [school, settings, kopSurat, rows, allDates] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: {
            id: true,
            nama: true,
            slug: true,
            npsn: true,
            alamatSekolah: true,
            kabupatenKota: true,
            namaKepalaSekolah: true,
          },
        }),
        prisma.websiteSettings
          .findUnique({ where: { school_id: sekolahId }, select: { logo_url: true } })
          .catch(() => null),
        readSchoolKopSurat(sekolahId),
        prisma.bukuTamu.findMany({
          where: {
            sekolahId,
            tanggalKunjung: { gte: rangeStart, lt: rangeEnd },
            ...(q
              ? {
                  OR: [
                    { nama: { contains: q, mode: "insensitive" } },
                    { alamat: { contains: q, mode: "insensitive" } },
                    { noHp: { contains: q, mode: "insensitive" } },
                    { tujuanKunjungan: { contains: q, mode: "insensitive" } },
                    { instansi: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { tanggalKunjung: "desc" },
          take: 2000,
        }),
        prisma.bukuTamu.findMany({
          where: { sekolahId },
          select: { tanggalKunjung: true },
          orderBy: { tanggalKunjung: "desc" },
          take: 5000,
        }),
      ]);

      const yearSet = new Set<number>([currentYear, parsedYear]);
      for (const item of allDates) {
        yearSet.add(item.tanggalKunjung.getUTCFullYear());
      }
      const availableYears = Array.from(yearSet).sort((a, b) => b - a);

      return res.json({
        sekolah: {
          nama: school?.nama ?? "PKBM",
          slug: school?.slug ?? "",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
          logoUrl: settings?.logo_url ?? null,
        },
        kopSurat,
        filter: { tahun: parsedYear, bulan: parsedMonth },
        availableYears,
        total: rows.length,
        rows: rows.map((row) => {
          const fmt = formatWibDateParts(row.tanggalKunjung);
          return {
            id: row.id,
            nama: row.nama,
            alamat: row.alamat,
            noHp: row.noHp,
            tujuanKunjungan: row.tujuanKunjungan,
            instansi: row.instansi,
            tanggalKunjung: fmt.iso,
            tanggalLabel: fmt.tanggal,
            waktuLabel: fmt.waktu,
          };
        }),
      });
    } catch (error) {
      console.error("Gagal memuat daftar buku tamu:", error);
      return res.status(503).json({ error: "Data buku tamu digital belum dapat dimuat." });
    }
  });

  // DELETE /api/sekolah/buku-tamu/:id
  router.delete("/buku-tamu/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const id = cleanText(req.params.id, 100);
      if (!id) return res.status(400).json({ error: "ID kunjungan tidak valid." });

      const deleted = await prisma.bukuTamu.deleteMany({
        where: { id, sekolahId },
      });
      if (!deleted.count) {
        return res.status(404).json({ error: "Data kunjungan tidak ditemukan." });
      }
      return res.json({ message: "Entri buku tamu dihapus." });
    } catch (error) {
      console.error("Gagal menghapus entri buku tamu:", error);
      return res.status(503).json({ error: "Entri buku tamu belum dapat dihapus." });
    }
  });

  return router;
}
