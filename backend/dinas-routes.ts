import { Router } from "express";
import type { Request } from "express";
import { prisma } from "./db.js";
import {
  computeVervalCompleteness,
  detectPaketCategory,
  formatIsoDate,
  normalizeVervalStatus,
  VALID_STATUS_VERVAL_DINAS,
  type VervalDinasStatus,
} from "./verval-routes.js";

export type DinasContext = {
  akunId: string;
  nama: string;
  email: string | null;
  peran: "DINAS" | "MASTER_ADMIN";
  wilayahKabupaten: string | null;
  isSuperAdmin: boolean;
};

export function resolveActiveCutoffDate(now = new Date()): { cutoffDate: Date; cutoffLabel: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based: 6 = July, 7 = August
  const cutoffYear = month >= 6 ? year : year - 1;
  return {
    cutoffDate: new Date(Date.UTC(cutoffYear, 7, 31, 23, 59, 59, 999)),
    cutoffLabel: `${cutoffYear}-08-31`,
  };
}

function sameRegion(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isAcceptedStatusVervalFilter(raw: string): boolean {
  const value = raw.trim().toUpperCase();
  return (
    value === "BELUM_LENGKAP" ||
    value === "SIAP_VERVAL" ||
    value === "TERVERIFIKASI_PKBM" ||
    value === "MENUNGGU_VERIFIKASI" ||
    value === "TERVERIFIKASI" ||
    value === "MASUK_DAPODIK"
  );
}

export function dinasRoutes(resolveDinas: (req: Request) => Promise<DinasContext | null>) {
  const router = Router();

  router.use(async (req, res, next) => {
    try {
      const ctx = await resolveDinas(req);
      if (!ctx) return res.status(401).json({ error: "Sesi Dinas Pendidikan tidak valid." });
      if (!ctx.isSuperAdmin && (!ctx.wilayahKabupaten || !ctx.wilayahKabupaten.trim())) {
        return res.status(403).json({ error: "Akun Dinas Pendidikan belum memiliki wilayah kabupaten/kota yang ditetapkan." });
      }
      res.locals.dinas = ctx;
      return next();
    } catch (error) {
      console.error("Gagal memeriksa sesi Dinas Pendidikan:", error);
      return res.status(503).json({ error: "Layanan Portal Dinas Pendidikan tidak tersedia." });
    }
  });

  // Catatan Kebijakan Kesetaraan: Portal Dinas murni memantau & memverifikasi kelayakan administrasi
  // (biodata Dapodik, cut-off tanggal masuk, dan 4 berkas dokumen), tanpa mengakses nilai/presensi KBM.
  router.get("/ringkasan", async (req, res) => {
    const ctx = res.locals.dinas as DinasContext;
    const requestedWilayah = typeof req.query.kabupaten === "string" ? req.query.kabupaten.trim() : "";
    const effectiveWilayah = ctx.isSuperAdmin ? (requestedWilayah || ctx.wilayahKabupaten || null) : ctx.wilayahKabupaten;

    try {
      const { cutoffDate, cutoffLabel } = resolveActiveCutoffDate();

      const [allEligibleSchools, schools] = await Promise.all([
        ctx.isSuperAdmin
          ? prisma.sekolah.findMany({
              where: { status: "ACTIVE", izinVervalDinas: true, kabupatenKota: { not: null } },
              select: { kabupatenKota: true },
              distinct: ["kabupatenKota"],
              orderBy: { kabupatenKota: "asc" },
            })
          : Promise.resolve([]),
        prisma.sekolah.findMany({
          where: {
            status: "ACTIVE",
            izinVervalDinas: true,
            ...(effectiveWilayah
              ? { kabupatenKota: { equals: effectiveWilayah.trim(), mode: "insensitive" } }
              : {}),
          },
          select: {
            id: true,
            nama: true,
            npsn: true,
            slug: true,
            plan: true,
            kabupatenKota: true,
            izinVervalDinas: true,
            totalSiswaDapodik: true,
          },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 500,
        }),
      ]);

      const scopedSchools = effectiveWilayah
        ? schools.filter((s) => sameRegion(s.kabupatenKota, effectiveWilayah))
        : schools;
      const schoolIds = scopedSchools.map((s) => s.id);

      const [students, kelasRows] = schoolIds.length
        ? await Promise.all([
            prisma.siswa.findMany({
              where: { sekolahId: { in: schoolIds }, status: "Aktif" },
              select: {
                id: true,
                sekolahId: true,
                kelasId: true,
                jenjang: true,
                tanggalMasuk: true,
                nik: true,
                noKk: true,
                namaIbu: true,
                namaIbuKandung: true,
                tempatLahir: true,
                tanggalLahir: true,
                jenisKelamin: true,
                alamatLengkap: true,
                desaKelurahan: true,
                kecamatan: true,
                sekolahAsal: true,
                nomorIjazahTerakhir: true,
                sumberDapodik: true,
                urlKk: true,
                urlAktaKtp: true,
                urlIjazah: true,
                urlSuratPindah: true,
                statusVerval: true,
                statusVervalDinas: true,
              },
            }),
            prisma.kelas.findMany({
              where: { sekolahId: { in: schoolIds } },
              select: { id: true, nama: true },
            }),
          ])
        : [[], []];

      const kelasMap = new Map(kelasRows.map((k) => [k.id, k.nama]));
      const studentsBySchool = new Map<string, typeof students>();
      for (const st of students) {
        if (!st.sekolahId) continue;
        const arr = studentsBySchool.get(st.sekolahId) ?? [];
        arr.push(st);
        studentsBySchool.set(st.sekolahId, arr);
      }

      let totalWargaBelajar = 0;
      let totalPaketA = 0;
      let totalPaketB = 0;
      let totalPaketC = 0;
      let totalCutoff = 0;
      let totalLolosDinas = 0;
      let totalDapodikTarik = 0;
      let totalBerkasLengkap = 0;

      const pkbm = scopedSchools.map((school) => {
        const list = studentsBySchool.get(school.id) ?? [];
        let paketA = 0;
        let paketB = 0;
        let paketC = 0;
        let siswaMemenuhiCutoff = 0;
        let sumCompleteness = 0;
        let siapVerifikasiCount = 0;
        let terverifikasiPkbmCount = 0;
        let belumLengkapCount = 0;
        let lolosDinasCount = 0;
        let perluPerbaikanCount = 0;
        let menungguDinasCount = 0;
        let berkasLengkapCount = 0;
        let tanpaBerkasCount = 0;
        let sumberDapodikCount = 0;

        for (const st of list) {
          const kelasNama = st.kelasId ? (kelasMap.get(st.kelasId) ?? null) : null;
          const paket = detectPaketCategory(st.jenjang, kelasNama);
          if (paket === "Paket A") paketA += 1;
          else if (paket === "Paket B") paketB += 1;
          else if (paket === "Paket C") paketC += 1;

          if (st.tanggalMasuk && st.tanggalMasuk.getTime() <= cutoffDate.getTime()) {
            siswaMemenuhiCutoff += 1;
          }

          if (st.sumberDapodik) sumberDapodikCount += 1;

          const completeness = computeVervalCompleteness(st);
          sumCompleteness += completeness.kelengkapanPersen;
          if (completeness.berkasLengkap) berkasLengkapCount += 1;
          if (completeness.tanpaBerkas) tanpaBerkasCount += 1;

          const normalizedPkbm = normalizeVervalStatus(st.statusVerval);
          if (normalizedPkbm === "SIAP_VERVAL") siapVerifikasiCount += 1;
          else if (normalizedPkbm === "TERVERIFIKASI_PKBM") terverifikasiPkbmCount += 1;
          else belumLengkapCount += 1;

          if (st.statusVervalDinas === "LOLOS_VERVAL") lolosDinasCount += 1;
          else if (st.statusVervalDinas === "PERLU_PERBAIKAN") perluPerbaikanCount += 1;
          else menungguDinasCount += 1;
        }

        const totalSiswa = list.length;
        const totalSiswaDapodik = Math.max(school.totalSiswaDapodik ?? 0, sumberDapodikCount);
        totalWargaBelajar += totalSiswa;
        totalPaketA += paketA;
        totalPaketB += paketB;
        totalPaketC += paketC;
        totalCutoff += siswaMemenuhiCutoff;
        totalLolosDinas += lolosDinasCount;
        totalDapodikTarik += totalSiswaDapodik;
        totalBerkasLengkap += berkasLengkapCount;

        return {
          id: school.id,
          nama: school.nama,
          npsn: school.npsn,
          slug: school.slug,
          plan: school.plan ?? "basic",
          kabupatenKota: school.kabupatenKota,
          totalSiswa,
          totalSiswaDapodik,
          berkasLengkapCount,
          tanpaBerkasCount,
          paketA,
          paketB,
          paketC,
          siswaMemenuhiCutoff,
          belumLengkapCount,
          siapVerifikasiCount,
          terverifikasiPkbmCount,
          kelengkapanVervalPersen: totalSiswa ? Math.round(sumCompleteness / totalSiswa) : 0,
          lolosDinasCount,
          perluPerbaikanCount,
          menungguDinasCount,
          persentaseLolosDinas: totalSiswa ? Math.round((lolosDinasCount / totalSiswa) * 100) : 0,
        };
      });

      const availableWilayah = [
        ...new Set(
          allEligibleSchools
            .map((item) => item.kabupatenKota?.trim())
            .filter((val): val is string => Boolean(val)),
        ),
      ];

      return res.json({
        wilayah: effectiveWilayah ?? "Semua Wilayah",
        availableWilayah,
        cutoffDate: cutoffLabel,
        petugas: {
          nama: ctx.nama,
          peran: ctx.peran,
          isSuperAdmin: ctx.isSuperAdmin,
        },
        kpi: {
          totalPkbm: pkbm.length,
          totalWargaBelajar,
          totalDapodikTarik,
          totalBerkasLengkap,
          totalPaketA,
          totalPaketB,
          totalPaketC,
          totalCutoff,
          totalLolosDinas,
          persentaseLolosVerval: totalWargaBelajar ? Math.round((totalLolosDinas / totalWargaBelajar) * 100) : 0,
        },
        pkbm,
      });
    } catch (error) {
      console.error("Gagal memuat ringkasan verval Dinas Pendidikan:", error);
      return res.status(503).json({ error: "Ringkasan Portal Dinas Pendidikan belum dapat dimuat." });
    }
  });

  router.get("/pkbm/:sekolahId/siswa", async (req, res) => {
    const ctx = res.locals.dinas as DinasContext;
    const sekolahId = req.params.sekolahId;
    const statusDinasFilter = typeof req.query.statusVervalDinas === "string" ? req.query.statusVervalDinas.trim() : "";
    const statusPkbmFilterRaw = typeof req.query.statusVerval === "string" ? req.query.statusVerval.trim() : "";
    const paketFilter = typeof req.query.paket === "string" ? req.query.paket.trim() : "";
    const searchRaw = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    if (statusDinasFilter && !VALID_STATUS_VERVAL_DINAS.has(statusDinasFilter as VervalDinasStatus)) {
      return res.status(400).json({ error: "Filter status verval Dinas tidak valid." });
    }
    if (statusPkbmFilterRaw && !isAcceptedStatusVervalFilter(statusPkbmFilterRaw)) {
      return res.status(400).json({ error: "Filter status verval PKBM tidak valid." });
    }
    const statusPkbmFilter = statusPkbmFilterRaw ? normalizeVervalStatus(statusPkbmFilterRaw) : null;

    try {
      const school = await prisma.sekolah.findUnique({
        where: { id: sekolahId },
        select: { id: true, nama: true, npsn: true, slug: true, kabupatenKota: true, izinVervalDinas: true, status: true },
      });
      if (!school || school.status !== "ACTIVE" || !school.izinVervalDinas) {
        return res.status(404).json({ error: "PKBM tidak ditemukan atau tidak mengaktifkan akses verval Dinas." });
      }
      if (!ctx.isSuperAdmin && !sameRegion(school.kabupatenKota, ctx.wilayahKabupaten)) {
        return res.status(403).json({ error: "PKBM ini berada di luar wilayah tugas Anda." });
      }

      const { cutoffDate, cutoffLabel } = resolveActiveCutoffDate();
      const [students, kelasList] = await Promise.all([
        prisma.siswa.findMany({
          where: {
            sekolahId: school.id,
            status: "Aktif",
            ...(statusDinasFilter ? { statusVervalDinas: statusDinasFilter } : {}),
          },
          select: {
            id: true,
            nisn: true,
            nama: true,
            kelasId: true,
            nik: true,
            noKk: true,
            tempatLahir: true,
            tanggalLahir: true,
            jenisKelamin: true,
            jenjang: true,
            tanggalMasuk: true,
            namaIbu: true,
            namaIbuKandung: true,
            alamatLengkap: true,
            desaKelurahan: true,
            kecamatan: true,
            sekolahAsal: true,
            npsnAsal: true,
            nomorIjazahTerakhir: true,
            sumberDapodik: true,
            urlKk: true,
            urlAktaKtp: true,
            urlIjazah: true,
            urlSuratPindah: true,
            statusVerval: true,
            catatanVerval: true,
            statusVervalDinas: true,
            catatanDinas: true,
          },
          orderBy: [{ nama: "asc" }, { id: "asc" }],
          take: 2000,
        }),
        prisma.kelas.findMany({
          where: { sekolahId: school.id },
          select: { id: true, nama: true },
        }),
      ]);

      const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
      const mapped = students
        .map((st) => {
          const kelasNama = st.kelasId ? (kelasMap.get(st.kelasId) ?? "Kelas") : "Belum ditempatkan";
          const paketKategori = detectPaketCategory(st.jenjang, kelasNama);
          const namaIbuKandung = st.namaIbuKandung ?? st.namaIbu ?? null;
          const completeness = computeVervalCompleteness({ ...st, namaIbuKandung });
          return {
            id: st.id,
            nisn: st.nisn,
            nama: st.nama,
            nik: st.nik ?? null,
            noKk: st.noKk ?? null,
            tempatLahir: st.tempatLahir ?? null,
            tanggalLahir: formatIsoDate(st.tanggalLahir),
            jenisKelamin: st.jenisKelamin ?? null,
            jenjang: st.jenjang ?? (paketKategori !== "Lainnya" ? paketKategori : null),
            paketKategori,
            kelasNama,
            tanggalMasuk: formatIsoDate(st.tanggalMasuk),
            memenuhiCutoff: Boolean(st.tanggalMasuk && st.tanggalMasuk.getTime() <= cutoffDate.getTime()),
            namaIbuKandung,
            alamatLengkap: st.alamatLengkap ?? null,
            desaKelurahan: st.desaKelurahan ?? null,
            kecamatan: st.kecamatan ?? null,
            sekolahAsal: st.sekolahAsal ?? null,
            npsnAsal: st.npsnAsal ?? null,
            nomorIjazahTerakhir: st.nomorIjazahTerakhir ?? null,
            sumberDapodik: Boolean(st.sumberDapodik),
            urlKk: st.urlKk ?? null,
            urlAktaKtp: st.urlAktaKtp ?? null,
            urlIjazah: st.urlIjazah ?? null,
            urlSuratPindah: st.urlSuratPindah ?? null,
            statusVerval: normalizeVervalStatus(st.statusVerval),
            catatanVerval: st.catatanVerval ?? null,
            statusVervalDinas: VALID_STATUS_VERVAL_DINAS.has(st.statusVervalDinas as VervalDinasStatus)
              ? st.statusVervalDinas
              : "MENUNGGU_DINAS",
            catatanDinas: st.catatanDinas ?? null,
            ...completeness,
          };
        })
        .filter((item) => {
          if (statusPkbmFilter && item.statusVerval !== statusPkbmFilter) return false;
          if (paketFilter && item.paketKategori !== paketFilter) return false;
          if (searchRaw) {
            const hay = `${item.nama} ${item.nisn} ${item.nik ?? ""}`.toLowerCase();
            if (!hay.includes(searchRaw)) return false;
          }
          return true;
        });

      return res.json({
        sekolah: {
          id: school.id,
          nama: school.nama,
          npsn: school.npsn,
          slug: school.slug,
          kabupatenKota: school.kabupatenKota,
        },
        cutoffDate: cutoffLabel,
        siswa: mapped,
      });
    } catch (error) {
      console.error("Gagal memuat nominatif verval PKBM untuk Dinas:", error);
      return res.status(503).json({ error: "Daftar siswa PKBM belum dapat dimuat." });
    }
  });

  router.patch("/siswa/:siswaId/verval", async (req, res) => {
    const ctx = res.locals.dinas as DinasContext;
    const siswaId = req.params.siswaId;
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Payload verifikasi Dinas tidak valid." });
    }
    const statusVervalDinas = (body as Record<string, unknown>).statusVervalDinas;
    const catatanDinasRaw = (body as Record<string, unknown>).catatanDinas;

    if (typeof statusVervalDinas !== "string" || !VALID_STATUS_VERVAL_DINAS.has(statusVervalDinas as VervalDinasStatus)) {
      return res.status(400).json({ error: "Status verval Dinas harus MENUNGGU_DINAS, LOLOS_VERVAL, atau PERLU_PERBAIKAN." });
    }
    if (catatanDinasRaw !== undefined && catatanDinasRaw !== null && typeof catatanDinasRaw !== "string") {
      return res.status(400).json({ error: "Catatan Dinas tidak valid." });
    }
    const catatanDinas = typeof catatanDinasRaw === "string" ? catatanDinasRaw.trim() : "";
    if (catatanDinas.length > 500) {
      return res.status(400).json({ error: "Catatan Dinas maksimal 500 karakter." });
    }
    if (statusVervalDinas === "PERLU_PERBAIKAN" && !catatanDinas) {
      return res.status(400).json({ error: "Isi catatan perbaikan agar operator PKBM mengetahui berkas yang perlu diperbaiki." });
    }

    try {
      const target = await prisma.siswa.findUnique({
        where: { id: siswaId },
        select: {
          id: true,
          nama: true,
          nisn: true,
          sekolahId: true,
          sekolah: {
            select: {
              id: true,
              status: true,
              kabupatenKota: true,
              izinVervalDinas: true,
            },
          },
        },
      });
      if (!target || !target.sekolah || target.sekolah.status !== "ACTIVE" || !target.sekolah.izinVervalDinas) {
        return res.status(404).json({ error: "Siswa atau PKBM tidak ditemukan atau tidak aktif untuk verval Dinas." });
      }
      if (!ctx.isSuperAdmin && !sameRegion(target.sekolah.kabupatenKota, ctx.wilayahKabupaten)) {
        return res.status(403).json({ error: "Siswa ini berada di PKBM di luar wilayah kabupaten/kota Anda." });
      }

      const updated = await prisma.siswa.update({
        where: { id: target.id },
        data: {
          statusVervalDinas,
          catatanDinas: catatanDinas || null,
        },
        select: {
          id: true,
          nama: true,
          nisn: true,
          statusVervalDinas: true,
          catatanDinas: true,
        },
      });

      return res.json({
        message:
          statusVervalDinas === "LOLOS_VERVAL"
            ? `${updated.nama} dinyatakan Lolos Verval Dinas.`
            : statusVervalDinas === "PERLU_PERBAIKAN"
              ? `Permintaan perbaikan untuk ${updated.nama} dikirim ke operator PKBM.`
              : `Status verval Dinas untuk ${updated.nama} dikembalikan ke Menunggu Dinas.`,
        siswa: updated,
      });
    } catch (error) {
      console.error("Gagal memperbarui verval Dinas siswa:", error);
      return res.status(503).json({ error: "Status verval Dinas belum dapat disimpan." });
    }
  });

  return router;
}
