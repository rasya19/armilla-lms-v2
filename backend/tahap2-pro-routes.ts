import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./db.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  isSafeHttpUrl,
  resolveAuthorizedSchool,
  type SchoolContextResolver,
} from "./tahap2-shared.js";

const DEFAULT_SNP_ITEMS: ReadonlyArray<{ standarKode: string; standarNama: string; indikator: string; urutan: number }> = [
  { standarKode: "SNP-1", standarNama: "Standar Kompetensi Lulusan (SKL)", indikator: "Dokumen SKL & Pemetaan Capaian Kompetensi Paket A, B, dan C", urutan: 1 },
  { standarKode: "SNP-1", standarNama: "Standar Kompetensi Lulusan (SKL)", indikator: "Rekapitulasi Kelulusan & Penyerahan Ijazah 3 Tahun Terakhir", urutan: 2 },
  { standarKode: "SNP-2", standarNama: "Standar Isi", indikator: "Kurikulum Satuan Pendidikan (KSP) Kesetaraan & Struktur SKK", urutan: 1 },
  { standarKode: "SNP-2", standarNama: "Standar Isi", indikator: "Silabus & Kalender Akademik Pendidikan Kesetaraan", urutan: 2 },
  { standarKode: "SNP-3", standarNama: "Standar Proses", indikator: "Rencana Pelaksanaan Pembelajaran (RPP/Modul Ajar) Tatap Muka, Tutorial & Mandiri", urutan: 1 },
  { standarKode: "SNP-3", standarNama: "Standar Proses", indikator: "Agenda Jurnal Mengajar Tutor & Daftar Hadir Warga Belajar", urutan: 2 },
  { standarKode: "SNP-4", standarNama: "Standar Penilaian Pendidikan", indikator: "Kisi-kisi, Bank Soal CBT, Rubrik Tugas & Dokumen KKM Lembaga", urutan: 1 },
  { standarKode: "SNP-4", standarNama: "Standar Penilaian Pendidikan", indikator: "Leger Nilai Semester & Arsip E-Raport Warga Belajar", urutan: 2 },
  { standarKode: "SNP-5", standarNama: "Standar Pendidik & Tenaga Kependidikan", indikator: "SK Pengangkatan, Ijazah Terakhir & NUPTK Tutor serta Tenaga Administrasi", urutan: 1 },
  { standarKode: "SNP-5", standarNama: "Standar Pendidik & Tenaga Kependidikan", indikator: "Sertifikat Pelatihan / Pengembangan Kompetensi Pendidik Kesetaraan", urutan: 2 },
  { standarKode: "SNP-6", standarNama: "Standar Sarana & Prasarana", indikator: "Daftar Inventaris Ruangan (KIR), Ruang Belajar, & Perangkat TIK/CBT", urutan: 1 },
  { standarKode: "SNP-6", standarNama: "Standar Sarana & Prasarana", indikator: "Kepemilikan / Sewa Gedung PKBM & Perpustakaan / Modul Cetak", urutan: 2 },
  { standarKode: "SNP-7", standarNama: "Standar Pengelolaan", indikator: "NPSN, Izin Operasional PKBM, RKJM/RKT & Struktur Organisasi Lembaga", urutan: 1 },
  { standarKode: "SNP-7", standarNama: "Standar Pengelolaan", indikator: "SOP PPDB Online, Tata Tertib Warga Belajar & Laporan Verval Dinas", urutan: 2 },
  { standarKode: "SNP-8", standarNama: "Standar Pembiayaan", indikator: "RKAS / Rencana Anggaran BOP Kesetaraan & Pembukuan Kas Lembaga", urutan: 1 },
  { standarKode: "SNP-8", standarNama: "Standar Pembiayaan", indikator: "Bukti Pembayaran SPP/Iuran Transparan & Laporan Pertanggungjawaban BOSP", urutan: 2 },
];

const VALID_SNP_CODES = new Set(["SNP-1", "SNP-2", "SNP-3", "SNP-4", "SNP-5", "SNP-6", "SNP-7", "SNP-8"]);
const VALID_SNP_STATUS = new Set(["BELUM_ADA", "PROSES", "LENGKAP"]);
const VALID_TAGIHAN_KATEGORI = new Set(["SPP_BULANAN", "UANG_UJIAN", "DAFTAR_ULANG", "SERAGAM_MODUL", "LAINNYA"]);
const VALID_METODE_BAYAR = new Set(["TUNAI", "TRANSFER", "QRIS"]);
const VALID_TRACER_STATUS = new Set(["BEKERJA", "WIRAUSAHA", "MELANJUTKAN_PENDIDIKAN", "LAINNYA"]);

function detectProgramLabel(jenjang?: string | null, kelasNama?: string | null): "Paket A" | "Paket B" | "Paket C" {
  const combined = `${jenjang ?? ""} ${kelasNama ?? ""}`.toLowerCase();
  if (combined.includes("paket a") || combined.includes("sd")) return "Paket A";
  if (combined.includes("paket b") || combined.includes("smp")) return "Paket B";
  return "Paket C";
}

export function tahap2ProRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  // ==========================================
  // 1. AKREDITASI 8 SNP (PRO)
  // ==========================================
  router.get("/akreditasi-snp", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      let items = await prisma.instrumenSnp.findMany({
        where: { sekolahId },
        orderBy: [{ standarKode: "asc" }, { urutan: "asc" }, { id: "asc" }],
      });

      if (items.length === 0) {
        await prisma.instrumenSnp.createMany({
          data: DEFAULT_SNP_ITEMS.map((item) => ({
            sekolahId,
            standarKode: item.standarKode,
            standarNama: item.standarNama,
            indikator: item.indikator,
            statusDokumen: "BELUM_ADA",
            urutan: item.urutan,
          })),
        });
        items = await prisma.instrumenSnp.findMany({
          where: { sekolahId },
          orderBy: [{ standarKode: "asc" }, { urutan: "asc" }, { id: "asc" }],
        });
      }

      return res.json({ items });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Akreditasi 8 SNP belum dimigrasi pada database." });
      }
      console.error("Gagal memuat instrumen SNP:", error);
      return res.status(503).json({ error: "Data Akreditasi 8 SNP belum dapat dimuat." });
    }
  });

  router.post("/akreditasi-snp", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const standarKode = cleanText(req.body?.standarKode, 20).toUpperCase();
      const standarNama = cleanText(req.body?.standarNama, 160);
      const indikator = cleanText(req.body?.indikator, 500);
      const statusDokumen = cleanText(req.body?.statusDokumen, 20) || "BELUM_ADA";
      const tautanBukti = cleanText(req.body?.tautanBukti, 500);
      const catatanVerifikasi = cleanText(req.body?.catatanVerifikasi, 500);

      if (!VALID_SNP_CODES.has(standarKode) || !standarNama || !indikator || !VALID_SNP_STATUS.has(statusDokumen)) {
        return res.status(400).json({ error: "Pilih standar SNP, isi uraian indikator, dan status yang valid." });
      }
      if (tautanBukti && !isSafeHttpUrl(tautanBukti)) {
        return res.status(400).json({ error: "Tautan bukti fisik harus berupa URL http:// atau https:// yang valid." });
      }

      const count = await prisma.instrumenSnp.count({ where: { sekolahId, standarKode } });
      const created = await prisma.instrumenSnp.create({
        data: {
          sekolahId,
          standarKode,
          standarNama,
          indikator,
          statusDokumen,
          tautanBukti: tautanBukti || null,
          catatanVerifikasi: catatanVerifikasi || null,
          urutan: count + 1,
        },
      });
      return res.status(201).json({ item: created, message: "Butir indikator SNP ditambahkan." });
    } catch (error) {
      console.error("Gagal menambah indikator SNP:", error);
      return res.status(503).json({ error: "Indikator SNP belum dapat ditambahkan." });
    }
  });

  router.patch("/akreditasi-snp/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const existing = await prisma.instrumenSnp.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Indikator SNP tidak ditemukan." });

      const statusDokumen = req.body?.statusDokumen ? cleanText(req.body.statusDokumen, 20) : existing.statusDokumen;
      if (!VALID_SNP_STATUS.has(statusDokumen)) {
        return res.status(400).json({ error: "Status kelengkapan tidak valid." });
      }

      const tautanBukti = req.body?.tautanBukti !== undefined ? cleanText(req.body.tautanBukti, 500) : existing.tautanBukti ?? "";
      if (tautanBukti && !isSafeHttpUrl(tautanBukti)) {
        return res.status(400).json({ error: "Tautan bukti fisik harus berupa URL http:// atau https://." });
      }

      const indikator = req.body?.indikator !== undefined ? cleanText(req.body.indikator, 500) : existing.indikator;
      if (!indikator) return res.status(400).json({ error: "Uraian indikator tidak boleh kosong." });

      const catatanVerifikasi =
        req.body?.catatanVerifikasi !== undefined
          ? cleanText(req.body.catatanVerifikasi, 500)
          : existing.catatanVerifikasi ?? "";

      const updated = await prisma.instrumenSnp.update({
        where: { id: existing.id },
        data: {
          indikator,
          statusDokumen,
          tautanBukti: tautanBukti || null,
          catatanVerifikasi: catatanVerifikasi || null,
        },
      });
      return res.json({ item: updated, message: "Status indikator SNP diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui indikator SNP:", error);
      return res.status(503).json({ error: "Indikator SNP belum dapat diperbarui." });
    }
  });

  router.delete("/akreditasi-snp/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const deleted = await prisma.instrumenSnp.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Indikator SNP tidak ditemukan." });
      return res.json({ message: "Butir indikator SNP dihapus." });
    } catch (error) {
      console.error("Gagal menghapus indikator SNP:", error);
      return res.status(503).json({ error: "Indikator SNP belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2. KEUANGAN & SPP (PRO)
  // ==========================================
  router.get("/keuangan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [school, tagihan, kelas, siswa] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, npsn: true, alamatSekolah: true, kabupatenKota: true },
        }),
        prisma.tagihanSpp.findMany({
          where: { sekolahId },
          include: { pembayaran: { orderBy: { tanggalBayar: "desc" } } },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: { nama: "asc" }, take: 500 }),
        prisma.siswa.findMany({
          where: { sekolahId, status: "Aktif" },
          select: { id: true, nama: true, nisn: true, kelasId: true },
          orderBy: { nama: "asc" },
          take: 1000,
        }),
      ]);

      const siswaMap = new Map(siswa.map((s) => [s.id, s]));
      const kelasMap = new Map(kelas.map((k) => [k.id, k.nama]));

      let totalTagihan = 0;
      let totalMasuk = 0;
      const enriched = tagihan.map((t) => {
        const terbayar = t.pembayaran.reduce((acc, p) => acc + p.jumlah, 0);
        const sisa = Math.max(0, t.nominal - terbayar);
        totalTagihan += t.nominal;
        totalMasuk += terbayar;
        const st = siswaMap.get(t.siswaId);
        return {
          ...t,
          siswaNama: st?.nama ?? "Warga Belajar",
          siswaNisn: st?.nisn ?? "-",
          kelasNama: kelasMap.get(t.kelasId ?? st?.kelasId ?? "") ?? "-",
          terbayar,
          sisa,
        };
      });

      return res.json({
        sekolah: school ?? { nama: "PKBM", npsn: null, alamatSekolah: null, kabupatenKota: null },
        summary: {
          totalTagihan,
          totalMasuk,
          totalTunggakan: Math.max(0, totalTagihan - totalMasuk),
          jumlahLunas: enriched.filter((t) => t.status === "LUNAS").length,
          jumlahTunggakan: enriched.filter((t) => t.sisa > 0).length,
        },
        tagihan: enriched,
        kelas,
        siswa,
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Keuangan & SPP belum dimigrasi pada database." });
      }
      console.error("Gagal memuat keuangan SPP:", error);
      return res.status(503).json({ error: "Data keuangan SPP belum dapat dimuat." });
    }
  });

  router.post("/keuangan/tagihan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const targetMode = req.body?.targetMode === "KELAS" || req.body?.targetMode === "SEMUA" ? req.body.targetMode : "SISWA";
      const siswaId = cleanText(req.body?.siswaId, 100);
      const kelasId = cleanText(req.body?.kelasId, 100) || null;
      const judul = cleanText(req.body?.judul, 160);
      const kategori = cleanText(req.body?.kategori, 40) || "SPP_BULANAN";
      const periode = cleanText(req.body?.periode, 60) || null;
      const keterangan = cleanText(req.body?.keterangan, 400) || null;
      const nominal = cleanInt(req.body?.nominal, 1000, 100_000_000, 0);
      const jatuhTempoRaw = cleanText(req.body?.jatuhTempo, 30);
      const jatuhTempo = jatuhTempoRaw ? new Date(`${jatuhTempoRaw.slice(0, 10)}T00:00:00.000Z`) : null;

      if (!judul || !VALID_TAGIHAN_KATEGORI.has(kategori) || nominal < 1000) {
        return res.status(400).json({ error: "Isi judul tagihan, kategori valid, dan nominal minimal Rp 1.000." });
      }
      if (jatuhTempo && Number.isNaN(jatuhTempo.getTime())) {
        return res.status(400).json({ error: "Tanggal jatuh tempo tidak valid." });
      }

      let targets: Array<{ id: string; kelasId: string | null }> = [];
      if (targetMode === "SISWA") {
        if (!siswaId) return res.status(400).json({ error: "Pilih warga belajar penerima tagihan." });
        const st = await prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true, kelasId: true } });
        if (!st) return res.status(404).json({ error: "Warga belajar tidak ditemukan." });
        targets = [st];
      } else if (targetMode === "KELAS") {
        if (!kelasId) return res.status(400).json({ error: "Pilih kelas target tagihan massal." });
        targets = await prisma.siswa.findMany({
          where: { sekolahId, kelasId, status: "Aktif" },
          select: { id: true, kelasId: true },
        });
      } else {
        targets = await prisma.siswa.findMany({
          where: { sekolahId, status: "Aktif" },
          select: { id: true, kelasId: true },
        });
      }

      if (targets.length === 0) {
        return res.status(400).json({ error: "Tidak ada warga belajar aktif pada sasaran yang dipilih." });
      }

      await prisma.tagihanSpp.createMany({
        data: targets.map((s) => ({
          sekolahId,
          siswaId: s.id,
          kelasId: s.kelasId,
          judul,
          kategori,
          periode,
          nominal,
          jatuhTempo,
          status: "BELUM_BAYAR",
          keterangan,
        })),
      });

      return res.status(201).json({
        created: targets.length,
        message: `${targets.length} tagihan berhasil diterbitkan.`,
      });
    } catch (error) {
      console.error("Gagal membuat tagihan SPP:", error);
      return res.status(503).json({ error: "Tagihan belum dapat diterbitkan." });
    }
  });

  router.post("/keuangan/pembayaran", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, nama: penerima } = auth.session;

      const tagihanId = cleanText(req.body?.tagihanId, 100);
      const metode = cleanText(req.body?.metode, 20) || "TUNAI";
      const jumlah = cleanInt(req.body?.jumlah, 100, 100_000_000, 0);
      const catatan = cleanText(req.body?.catatan, 400) || null;

      if (!tagihanId || !VALID_METODE_BAYAR.has(metode) || jumlah < 100) {
        return res.status(400).json({ error: "Pilih tagihan, metode bayar valid, dan nominal pembayaran." });
      }

      const tagihan = await prisma.tagihanSpp.findFirst({
        where: { id: tagihanId, sekolahId },
        include: { pembayaran: true },
      });
      if (!tagihan) return res.status(404).json({ error: "Tagihan tidak ditemukan." });

      const sudahBayar = tagihan.pembayaran.reduce((acc, p) => acc + p.jumlah, 0);
      const sisa = Math.max(0, tagihan.nominal - sudahBayar);
      if (sisa <= 0) {
        return res.status(409).json({ error: "Tagihan ini sudah berstatus lunas." });
      }
      const appliedJumlah = Math.min(jumlah, sisa);
      const totalSesudah = sudahBayar + appliedJumlah;
      const nextStatus = totalSesudah >= tagihan.nominal ? "LUNAS" : "CICILAN";
      const nomorKuitansi = `KWT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.pembayaranSpp.create({
          data: {
            sekolahId,
            tagihanId: tagihan.id,
            nomorKuitansi,
            jumlah: appliedJumlah,
            metode,
            catatan,
            penerima,
          },
        });
        await tx.tagihanSpp.update({
          where: { id: tagihan.id },
          data: { status: nextStatus },
        });
        return payment;
      });

      return res.status(201).json({
        pembayaran: result,
        status: nextStatus,
        message: `Pembayaran Rp ${appliedJumlah.toLocaleString("id-ID")} dicatat (${nomorKuitansi}).`,
      });
    } catch (error) {
      console.error("Gagal mencatat pembayaran SPP:", error);
      return res.status(503).json({ error: "Pembayaran belum dapat dicatat." });
    }
  });

  router.delete("/keuangan/tagihan/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const deleted = await prisma.tagihanSpp.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Tagihan tidak ditemukan." });
      return res.json({ message: "Tagihan dihapus." });
    } catch (error) {
      console.error("Gagal menghapus tagihan SPP:", error);
      return res.status(503).json({ error: "Tagihan belum dapat dihapus." });
    }
  });

  // ==========================================
  // 3. KARTU PELAJAR DIGITAL QR (PRO)
  // ==========================================
  router.get("/kartu-digital", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [school, settings, kelas, siswa] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, slug: true, npsn: true, alamatSekolah: true, kabupatenKota: true, namaKepalaSekolah: true },
        }),
        prisma.websiteSettings.findUnique({
          where: { school_id: sekolahId },
          select: { logo_url: true, primary_color: true },
        }).catch(() => null),
        prisma.kelas.findMany({ where: { sekolahId }, select: { id: true, nama: true }, orderBy: { nama: "asc" }, take: 500 }),
        prisma.siswa.findMany({
          where: { sekolahId, status: "Aktif" },
          select: { id: true, nama: true, nisn: true, kelasId: true, jenjang: true, status: true, tanggalLahir: true, jenisKelamin: true },
          orderBy: { nama: "asc" },
          take: 1000,
        }),
      ]);

      const kelasMap = new Map(kelas.map((k) => [k.id, k.nama]));
      const cards = siswa.map((s) => {
        const kelasNama = kelasMap.get(s.kelasId ?? "") ?? "Belum Ditempatkan";
        const program = detectProgramLabel(s.jenjang, kelasNama);
        const signature = createHash("sha256")
          .update(`${sekolahId}:${s.id}:${s.nisn}`)
          .digest("hex")
          .slice(0, 8)
          .toUpperCase();
        const kodeVerifikasi = `PKBM-${(school?.slug ?? "ARM").toUpperCase().slice(0, 6)}-${s.nisn}-${signature}`;
        return {
          ...s,
          kelasNama,
          program,
          kodeVerifikasi,
          qrPayload: `VERIFIKASI:${kodeVerifikasi}|NAMA:${s.nama}|NISN:${s.nisn}|${program}`,
        };
      });

      return res.json({
        sekolah: {
          nama: school?.nama ?? "PKBM",
          slug: school?.slug ?? "",
          npsn: school?.npsn ?? null,
          alamat: school?.alamatSekolah ?? null,
          kabupatenKota: school?.kabupatenKota ?? null,
          kepalaSekolah: school?.namaKepalaSekolah ?? null,
          logoUrl: settings?.logo_url ?? null,
          primaryColor: settings?.primary_color ?? "#0369a1",
        },
        kelas,
        cards,
      });
    } catch (error) {
      console.error("Gagal memuat kartu digital QR:", error);
      return res.status(503).json({ error: "Data kartu pelajar digital belum dapat dimuat." });
    }
  });

  // ==========================================
  // 4. DATA ALUMNI & TRACER STUDY (REGULER+)
  // ==========================================
  router.get("/alumni", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [alumni, siswaLulusKandidat] = await Promise.all([
        prisma.alumniTracer.findMany({
          where: { sekolahId },
          orderBy: [{ tahunLulus: "desc" }, { nama: "asc" }],
          take: 500,
        }),
        prisma.siswa.findMany({
          where: { sekolahId },
          select: { id: true, nama: true, nisn: true, jenjang: true, status: true, telepon: true, nomorIjazahTerakhir: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
      ]);

      return res.json({ alumni, siswaKandidat: siswaLulusKandidat });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Data Alumni & Tracer Study belum dimigrasi pada database." });
      }
      console.error("Gagal memuat data alumni:", error);
      return res.status(503).json({ error: "Data alumni belum dapat dimuat." });
    }
  });

  router.post("/alumni", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const siswaId = cleanText(req.body?.siswaId, 100) || null;
      const nama = cleanText(req.body?.nama, 160);
      const nisn = cleanText(req.body?.nisn, 30) || null;
      const program = cleanText(req.body?.program, 30) || "Paket C";
      const tahunLulus = cleanInt(req.body?.tahunLulus, 1990, 2100, new Date().getFullYear());
      const nomorIjazah = cleanText(req.body?.nomorIjazah, 100) || null;
      const statusPascaLulus = cleanText(req.body?.statusPascaLulus, 40) || "BEKERJA";
      const namaInstansiUsaha = cleanText(req.body?.namaInstansiUsaha, 180) || null;
      const kontakAktif = cleanText(req.body?.kontakAktif, 60) || null;
      const tahunMulai = req.body?.tahunMulai ? cleanInt(req.body.tahunMulai, 1990, 2100, tahunLulus) : null;
      const catatan = cleanText(req.body?.catatan, 600) || null;

      if (!nama || !VALID_TRACER_STATUS.has(statusPascaLulus)) {
        return res.status(400).json({ error: "Nama alumni dan status pasca-lulus wajib valid." });
      }

      if (siswaId) {
        const student = await prisma.siswa.findFirst({ where: { id: siswaId, sekolahId }, select: { id: true } });
        if (!student) return res.status(404).json({ error: "Data warga belajar tidak ditemukan." });
        await prisma.siswa.update({ where: { id: siswaId }, data: { status: "Alumni" } });
      }

      const created = await prisma.alumniTracer.create({
        data: {
          sekolahId,
          siswaId,
          nama,
          nisn,
          program,
          tahunLulus,
          nomorIjazah,
          statusPascaLulus,
          namaInstansiUsaha,
          kontakAktif,
          tahunMulai,
          catatan,
        },
      });
      return res.status(201).json({ alumni: created, message: "Data alumni & tracer study disimpan." });
    } catch (error) {
      console.error("Gagal menyimpan data alumni:", error);
      return res.status(503).json({ error: "Data alumni belum dapat disimpan." });
    }
  });

  router.patch("/alumni/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const existing = await prisma.alumniTracer.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Data alumni tidak ditemukan." });

      const statusPascaLulus = req.body?.statusPascaLulus ? cleanText(req.body.statusPascaLulus, 40) : existing.statusPascaLulus;
      if (!VALID_TRACER_STATUS.has(statusPascaLulus)) {
        return res.status(400).json({ error: "Status pasca-lulus tidak valid." });
      }

      const updated = await prisma.alumniTracer.update({
        where: { id: existing.id },
        data: {
          nama: req.body?.nama ? cleanText(req.body.nama, 160) : existing.nama,
          program: req.body?.program ? cleanText(req.body.program, 30) : existing.program,
          tahunLulus: req.body?.tahunLulus ? cleanInt(req.body.tahunLulus, 1990, 2100, existing.tahunLulus) : existing.tahunLulus,
          nomorIjazah: req.body?.nomorIjazah !== undefined ? cleanText(req.body.nomorIjazah, 100) || null : existing.nomorIjazah,
          statusPascaLulus,
          namaInstansiUsaha: req.body?.namaInstansiUsaha !== undefined ? cleanText(req.body.namaInstansiUsaha, 180) || null : existing.namaInstansiUsaha,
          kontakAktif: req.body?.kontakAktif !== undefined ? cleanText(req.body.kontakAktif, 60) || null : existing.kontakAktif,
          tahunMulai: req.body?.tahunMulai ? cleanInt(req.body.tahunMulai, 1990, 2100, existing.tahunLulus) : existing.tahunMulai,
          catatan: req.body?.catatan !== undefined ? cleanText(req.body.catatan, 600) || null : existing.catatan,
        },
      });
      return res.json({ alumni: updated, message: "Tracer study alumni diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui alumni:", error);
      return res.status(503).json({ error: "Data alumni belum dapat diperbarui." });
    }
  });

  router.delete("/alumni/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "reguler");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const deleted = await prisma.alumniTracer.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Data alumni tidak ditemukan." });
      return res.json({ message: "Data alumni dihapus." });
    } catch (error) {
      console.error("Gagal menghapus alumni:", error);
      return res.status(503).json({ error: "Data alumni belum dapat dihapus." });
    }
  });

  return router;
}
