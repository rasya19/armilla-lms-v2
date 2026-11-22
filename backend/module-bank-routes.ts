import { Router } from "express";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db.js";
import {
  cleanText,
  isPrismaMissingSchema,
  type SchoolContextResolver,
} from "./school-modules-shared.js";
import { MAX_PDF_BYTES, validatePdfAttachment } from "./upload-validation.js";

export type ModuleVisibility = "PRIVATE" | "PUBLIC" | "ARCHIVED";
export type ModulePaket = "Paket A" | "Paket B" | "Paket C";

export type NationalModuleSeed = {
  paket: ModulePaket;
  gradeLevel: string;
  subject: string;
  title: string;
  summary: string;
  fileUrl: string;
};

export const NATIONAL_ORIGIN_NAME = "Katalog Nasional Kemendikdasmen";

export const NATIONAL_MODULE_CATALOG: NationalModuleSeed[] = [
  // Paket A (Setara SD · Kurikulum Merdeka Pendidikan Kesetaraan)
  {
    paket: "Paket A",
    gradeLevel: "Kelas 1",
    subject: "Bahasa Indonesia",
    title: "Modul 1 Paket A: Mengenal Huruf, Kata, dan Membaca Permulaan",
    summary: "Panduan literasi awal Kurikulum Merdeka Pendidikan Kesetaraan Paket A Fase A.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-BInd-1/A-BInd-1.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 2",
    subject: "Matematika",
    title: "Modul 2 Paket A: Bilangan Cacah, Penjumlahan, dan Pengurangan Kontekstual",
    summary: "Penguatan numerasi dasar berbasis aktivitas kehidupan sehari-hari warga belajar Paket A.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-Mat-2/A-Mat-2.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 3",
    subject: "Pendidikan Pancasila",
    title: "Modul 3 Paket A: Aku Anak Indonesia Berkarakter Pancasila",
    summary: "Pengenalan nilai gotong royong, toleransi, dan aturan lingkungan sekitar.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-PPKn-3/A-PPKn-3.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 4",
    subject: "IPAS",
    title: "Modul 4 Paket A: Mengenal Makhluk Hidup, Energi, dan Lingkungan Sekitar",
    summary: "Integrasi Ilmu Pengetahuan Alam dan Sosial Fase B untuk Pendidikan Kesetaraan Paket A.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-IPA-4/A-IPA-4.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 5",
    subject: "Bahasa Indonesia",
    title: "Modul 5 Paket A: Membaca Kritis Teks Informasi & Menulis Cerita Pengalaman",
    summary: "Pengembangan literasi membaca pemahaman dan menulis kreatif Fase C Paket A.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-BInd-5/A-BInd-5.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 5",
    subject: "Matematika",
    title: "Modul 5 Paket A: Pecahan, Desimal, dan Pengukuran Bangun Datar",
    summary: "Latihan pemecahan masalah pecahan dan luas bangun datar kontekstual.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-Mat-5/A-Mat-5.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 6",
    subject: "IPAS",
    title: "Modul 6 Paket A: Sistem Tata Surya, Peta Indonesia, dan Ekonomi Lokal",
    summary: "Persiapan ketuntasan belajar Fase C Paket A Setara SD sebelum lanjut ke Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-IPS-6/A-IPS-6.pdf",
  },
  {
    paket: "Paket A",
    gradeLevel: "Kelas 6",
    subject: "Pemberdayaan & Keterampilan",
    title: "Modul 6 Paket A: Proyek Kemandirian Diri dan Kerajinan Lingkungan",
    summary: "Modul khas Pendidikan Kesetaraan bermuatan SKK pemberdayaan dan kecakapan hidup.",
    fileUrl: "https://emodul.kemdikbud.go.id/A-PK-6/A-PK-6.pdf",
  },

  // Paket B (Setara SMP · Kurikulum Merdeka Pendidikan Kesetaraan)
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Bahasa Indonesia",
    title: "Modul 1 Paket B: Teks Deskripsi, Narasi Imajinatif, dan Teks Prosedur",
    summary: "Modul ajar Kurikulum Merdeka Fase D untuk pemahaman ragam teks fungsional.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BInd-1/B-BInd-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Matematika",
    title: "Modul 1 Paket B: Bilangan Bulat, Rasio, dan Bentuk Aljabar Dasar",
    summary: "Penguatan konsep aljabar awal dan penalaran proporsional Fase D Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Mat-1/B-Mat-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "IPA",
    title: "Modul 1 Paket B: Hakikat Sains, Pengukuran, Zat dan Perubahannya",
    summary: "Eksperimen sederhana di rumah dan tutorial kelompok untuk warga belajar Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPA-1/B-IPA-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Bahasa Inggris",
    title: "Modul 2 Paket B: Everyday Communication, Recount Text & Notices",
    summary: "Praktik membaca dan menyusun teks interaksi sehari-hari berbahasa Inggris.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BIng-2/B-BIng-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "IPS",
    title: "Modul 2 Paket B: Kemajemukan Masyarakat Indonesia & Aktivitas Ekonomi",
    summary: "Analisis dinamika sosial, mobilitas penduduk, dan kearifan ekonomi masyarakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPS-2/B-IPS-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Pendidikan Pancasila",
    title: "Modul 2 Paket B: Konstitusi UUD 1945, Norma, dan Kebinekaan",
    summary: "Pemahaman hak dan kewajiban warga negara serta musyawarah mufakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PPKn-2/B-PPKn-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Matematika",
    title: "Modul 3 Paket B: Persamaan Linear, Teorema Pythagoras, dan Peluang",
    summary: "Pendalaman materi numerasi kunci kelas akhir Paket B Setara SMP.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Mat-3/B-Mat-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Informatika",
    title: "Modul 3 Paket B: Literasi Digital, Pengolah Data, dan Keamanan Siber",
    summary: "Keterampilan dasar teknologi informasi dan etika bermedia digital.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Inf-3/B-Inf-3.pdf",
  },

  // Paket C (Setara SMA · Kurikulum Merdeka Pendidikan Kesetaraan)
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Bahasa Indonesia",
    title: "Modul 1 Paket C: Teks Laporan Hasil Observasi, Anekdot, dan Negosiasi",
    summary: "Kurikulum Merdeka Fase E untuk kemampuan analisis kritis dan komunikasi formal.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BInd-1/C-BInd-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Matematika",
    title: "Modul 1 Paket C: Eksponen, Logaritma, Barisan & Deret, dan Trigonometri",
    summary: "Modul ajar Fase E Matematika Umum Paket C Setara SMA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Mat-1/C-Mat-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Pendidikan Pancasila",
    title: "Modul 1 Paket C: Pancasila sebagai Ideologi Terbuka & Bhinneka Tunggal Ika",
    summary: "Kajian nilai dasar Pancasila dalam kehidupan berbangsa dan bernegara.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PPKn-1/C-PPKn-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Sejarah",
    title: "Modul 1 Paket C: Pengantar Ilmu Sejarah & Jalur Rempah Nusantara",
    summary: "Pembelajaran sejarah kontekstual untuk warga belajar Paket C Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sej-1/C-Sej-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Bahasa Inggris",
    title: "Modul 2 Paket C: Analytical Exposition, Argumentative & Digital Literacy",
    summary: "Penguatan literasi teks akademik dan opini Fase F Bahasa Inggris Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BIng-2/C-BIng-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Ekonomi",
    title: "Modul 2 Paket C: Badan Usaha, Koperasi, Kebijakan Moneter & Fiskal",
    summary: "Pengantar ilmu ekonomi mikro-makro terapan bagi pelaku usaha & warga belajar.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Eko-2/C-Eko-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Sosiologi",
    title: "Modul 2 Paket C: Kelompok Sosial, Kesetaraan, dan Perubahan Masyarakat",
    summary: "Studi kasus dinamika sosial dan pemberdayaan komunitas Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sos-2/C-Sos-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Geografi",
    title: "Modul 2 Paket C: Posisi Strategis Indonesia, Sumber Daya Alam & Mitigasi",
    summary: "Pemetaan wilayah, pelestarian lingkungan, dan kesiapsiagaan bencana.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Geo-2/C-Geo-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Matematika",
    title: "Modul 3 Paket C: Peluang, Kaidah Pencacahan, dan Statistika Terapan",
    summary: "Persiapan asesmen akhir dan literasi numerasi kelas 12 Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Mat-3/C-Mat-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Bahasa Indonesia",
    title: "Modul 3 Paket C: Surat Lamaran Kerja, Artikel Ilmiah & Editorial Kritis",
    summary: "Kecakapan menulis profesional dan kesiapan karier/studi lanjut lulusan Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BInd-3/C-BInd-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Pemberdayaan & Keterampilan",
    title: "Modul 3 Paket C: Kewirausahaan Digital, Pemasaran Produk & Rencana Usaha",
    summary: "Modul keterampilan vokasi Pendidikan Kesetaraan berbasis usaha mandiri.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PK-3/C-PK-3.pdf",
  },
];

export function normalizeModulePaket(raw: unknown): ModulePaket | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/[_-]+/g, " ");
  if (!s) return null;
  if (s === "A" || s.includes("PAKET A") || s.includes("SETARA SD") || s === "SD") return "Paket A";
  if (s === "B" || s.includes("PAKET B") || s.includes("SETARA SMP") || s === "SMP") return "Paket B";
  if (s === "C" || s.includes("PAKET C") || s.includes("SETARA SMA") || s === "SMA" || s === "SMK") return "Paket C";
  return null;
}

export function normalizeGradeLevel(raw: unknown, paket: ModulePaket): string {
  const defaultByPaket: Record<ModulePaket, string> = {
    "Paket A": "Kelas 1",
    "Paket B": "Kelas 7",
    "Paket C": "Kelas 10",
  };
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n >= 1 && n <= 12) return `Kelas ${n}`;
    return defaultByPaket[paket];
  }
  if (typeof raw !== "string") return defaultByPaket[paket];
  const trimmed = raw.trim();
  if (!trimmed) return defaultByPaket[paket];
  const digit = trimmed.match(/(\d{1,2})/);
  if (digit) {
    const num = Number(digit[1]);
    if (num >= 1 && num <= 12) return `Kelas ${num}`;
  }
  return trimmed.slice(0, 60);
}

export function parseModuleVisibilityStrict(raw: unknown): ModuleVisibility | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "PRIVATE" || upper === "PRIVAT") return "PRIVATE";
  if (upper === "PUBLIC" || upper === "PUBLIK" || upper === "UMUM") return "PUBLIC";
  if (upper === "ARCHIVED" || upper === "ARSIP" || upper === "DIARSIPKAN") return "ARCHIVED";
  return null;
}

export function validateSafeModuleUrl(raw: unknown): string | null {
  const checked = validatePdfAttachment(raw, { maxBytes: MAX_PDF_BYTES, allowHttp: false });
  if (!checked.ok) return null;
  return checked.value;
}

export function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type ParsedModuleInput = {
  paket: ModulePaket;
  gradeLevel: string;
  subject: string;
  title: string;
  summary: string | null;
  fileUrl: string;
  visibility: ModuleVisibility;
};

export function parseModuleBankItem(
  raw: unknown,
  defaultVisibility: ModuleVisibility = "PRIVATE",
): { ok: true; data: ParsedModuleInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Format data modul tidak valid." };
  }
  const obj = raw as Record<string, unknown>;

  const rawPaket = obj.paket ?? obj.Paket ?? obj.jenjang ?? obj.Jenjang;
  const rawGrade = obj.gradeLevel ?? obj.kelas ?? obj.Kelas ?? obj.tingkatKelas ?? obj.tingkat ?? obj.Tingkat;
  const rawSubject = obj.subject ?? obj.mataPelajaran ?? obj["Mata Pelajaran"] ?? obj.mapel ?? obj.Mapel;
  const rawTitle = obj.title ?? obj.judul ?? obj.judulModul ?? obj["Judul Modul"] ?? obj.Judul;
  const rawSummary = obj.summary ?? obj.ringkasan ?? obj.Ringkasan ?? obj.deskripsi ?? obj.Deskripsi;
  const rawUrl = obj.fileUrl ?? obj.file_url ?? obj.linkPdf ?? obj["Link PDF"] ?? obj.tautan ?? obj.url ?? obj.Link;
  const rawVisibility = obj.visibility ?? obj.visibilitas;

  const paket =
    normalizeModulePaket(rawPaket) ??
    (() => {
      const gStr = typeof rawGrade === "string" ? rawGrade : String(rawGrade ?? "");
      const m = gStr.match(/(\d{1,2})/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 1 && n <= 6) return "Paket A" as const;
        if (n >= 7 && n <= 9) return "Paket B" as const;
        if (n >= 10 && n <= 12) return "Paket C" as const;
      }
      return null;
    })();

  if (!paket) {
    return { ok: false, error: "Paket wajib diisi (Paket A, Paket B, atau Paket C)." };
  }

  const subject = cleanText(rawSubject, 120);
  if (!subject) {
    return { ok: false, error: "Mata pelajaran wajib diisi." };
  }

  const title = cleanText(rawTitle, 240);
  if (!title) {
    return { ok: false, error: "Judul modul wajib diisi." };
  }

  const fileUrl = validateSafeModuleUrl(rawUrl);
  if (!fileUrl) {
    return { ok: false, error: "Tautan PDF (https:// / Google Drive) tidak valid atau kosong." };
  }

  const summaryText = cleanText(rawSummary, 2000);
  const gradeLevel = normalizeGradeLevel(rawGrade, paket);
  const parsedVis = parseModuleVisibilityStrict(rawVisibility);
  const visibility: ModuleVisibility =
    parsedVis === "PUBLIC" || parsedVis === "PRIVATE" ? parsedVis : defaultVisibility;

  return {
    ok: true,
    data: {
      paket,
      gradeLevel,
      subject,
      title,
      summary: summaryText || null,
      fileUrl,
      visibility,
    },
  };
}

function handleModuleBankError(error: unknown, res: import("express").Response, fallback: string) {
  if (isPrismaMissingSchema(error)) {
    return res.status(503).json({
      error: "Tabel Bank Modul Belajar belum tersedia. Jalankan migrasi database terlebih dahulu.",
    });
  }
  console.error(fallback, error);
  return res.status(503).json({ error: fallback });
}

export function moduleBankRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  router.use(async (req, res, next) => {
    try {
      const session = await getSchoolSession(req);
      if (!session?.sekolahId) {
        return res.status(401).json({ error: "Sesi tidak valid. Silakan masuk sebagai Admin Sekolah atau Guru." });
      }
      if (session.peran === "SISWA") {
        return res.status(403).json({ error: "Akses ditolak. Bank Modul hanya untuk Admin Sekolah dan Guru." });
      }
      res.locals.moduleSession = session;
      return next();
    } catch (error) {
      console.error("Gagal memeriksa sesi Bank Modul:", error);
      return res.status(503).json({ error: "Verifikasi sesi Bank Modul tidak tersedia." });
    }
  });

  // GET /api/module-bank
  router.get("/", async (req, res) => {
    try {
      const session = res.locals.moduleSession as {
        sekolahId: string;
        peran: "ADMIN" | "GURU";
        guruId?: string | null;
      };

      const rawPaket = typeof req.query.paket === "string" ? req.query.paket.trim() : "";
      const paketFilter = rawPaket ? normalizeModulePaket(rawPaket) : null;
      const gradeFilter = typeof req.query.gradeLevel === "string" ? req.query.gradeLevel.trim() : "";
      const subjectFilter = typeof req.query.subject === "string" ? req.query.subject.trim() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      const [school, schoolModules, publicModules, classes, subjects] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: session.sekolahId },
          select: { id: true, nama: true },
        }),
        prisma.learningModuleBank.findMany({
          where: {
            schoolId: session.sekolahId,
            ...(paketFilter ? { paket: paketFilter } : {}),
            ...(gradeFilter ? { gradeLevel: gradeFilter } : {}),
            ...(subjectFilter ? { subject: { equals: subjectFilter, mode: "insensitive" } } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: 500,
        }),
        prisma.learningModuleBank.findMany({
          where: {
            visibility: "PUBLIC",
            ...(paketFilter ? { paket: paketFilter } : {}),
            ...(gradeFilter ? { gradeLevel: gradeFilter } : {}),
            ...(subjectFilter ? { subject: { equals: subjectFilter, mode: "insensitive" } } : {}),
          },
          orderBy: [{ paket: "asc" }, { gradeLevel: "asc" }, { subject: "asc" }, { createdAt: "desc" }],
          take: 500,
        }),
        prisma.kelas.findMany({
          where: { sekolahId: session.sekolahId },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 300,
        }),
        prisma.mapel.findMany({
          where: { sekolahId: session.sekolahId },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 300,
        }),
      ]);

      const matchesQuery = (m: {
        title: string;
        subject: string;
        summary: string | null;
        gradeLevel: string;
        originSchoolName: string;
      }) =>
        !q ||
        `${m.title} ${m.subject} ${m.gradeLevel} ${m.originSchoolName} ${m.summary ?? ""}`
          .toLowerCase()
          .includes(q);

      const filteredSchool = schoolModules.filter(matchesQuery);
      // Enforce public-only filter in application layer as defense-in-depth
      const filteredPublic = publicModules.filter((m) => m.visibility === "PUBLIC" && matchesQuery(m));

      const subjectNames = new Set<string>();
      const gradeLevels = new Set<string>();
      for (const m of [...schoolModules, ...publicModules]) {
        if (m.subject) subjectNames.add(m.subject);
        if (m.gradeLevel) gradeLevels.add(m.gradeLevel);
      }

      return res.json({
        schoolName: school?.nama ?? "Sekolah Anda",
        schoolModules: filteredSchool,
        publicModules: filteredPublic,
        classes,
        subjects,
        filters: {
          pakets: ["Paket A", "Paket B", "Paket C"] as ModulePaket[],
          gradeLevels: [...gradeLevels].sort((a, b) => a.localeCompare(b, "id-ID", { numeric: true })),
          subjects: [...subjectNames].sort((a, b) => a.localeCompare(b, "id-ID")),
        },
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Bank Modul Belajar belum dapat dimuat.");
    }
  });

  // POST /api/module-bank
  router.post("/", async (req, res) => {
    try {
      const session = res.locals.moduleSession as { sekolahId: string };
      const parsed = parseModuleBankItem(req.body, "PRIVATE");
      if (parsed.ok === false) {
        return res.status(400).json({ error: parsed.error });
      }
      const school = await prisma.sekolah.findUnique({
        where: { id: session.sekolahId },
        select: { nama: true },
      });
      const created = await prisma.learningModuleBank.create({
        data: {
          schoolId: session.sekolahId,
          originSchoolName: school?.nama ?? "Lembaga PKBM",
          paket: parsed.data.paket,
          gradeLevel: parsed.data.gradeLevel,
          subject: parsed.data.subject,
          title: parsed.data.title,
          summary: parsed.data.summary,
          fileUrl: parsed.data.fileUrl,
          visibility: parsed.data.visibility,
        },
      });
      return res.status(201).json({
        module: { id: created.id ?? randomUUID(), ...created },
        message: "Modul berhasil disimpan ke Bank Modul Sekolah.",
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Modul belum dapat disimpan.");
    }
  });

  // POST /api/module-bank/import-bulk
  router.post("/import-bulk", async (req, res) => {
    try {
      const session = res.locals.moduleSession as { sekolahId: string };
      const rawBody = req.body;
      const bodyObj =
        rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
          ? (rawBody as Record<string, unknown>)
          : {};
      const rawItems = Array.isArray(rawBody)
        ? rawBody
        : Array.isArray(bodyObj.items)
          ? bodyObj.items
          : Array.isArray(bodyObj.modules)
            ? bodyObj.modules
            : [];

      if (rawItems.length === 0) {
        return res.status(400).json({ error: "Daftar modul untuk diimpor tidak boleh kosong." });
      }
      if (rawItems.length > 500) {
        return res.status(400).json({ error: "Maksimal 500 modul dapat diimpor dalam sekali proses." });
      }

      const defaultVisParsed = parseModuleVisibilityStrict(bodyObj.visibility);
      const defaultVisibility: ModuleVisibility =
        defaultVisParsed === "PUBLIC" ? "PUBLIC" : "PRIVATE";

      const validItems: ParsedModuleInput[] = [];
      const errors: string[] = [];

      rawItems.forEach((row, index) => {
        const result = parseModuleBankItem(row, defaultVisibility);
        if ("data" in result) {
          validItems.push(result.data);
        } else {
          errors.push(`Baris #${index + 1}: ${result.error}`);
        }
      });

      if (validItems.length === 0) {
        return res.status(400).json({
          error: errors[0] || "Tidak ada baris modul yang valid.",
          errors: errors.slice(0, 20),
        });
      }

      const school = await prisma.sekolah.findUnique({
        where: { id: session.sekolahId },
        select: { nama: true },
      });
      const originSchoolName = school?.nama ?? "Lembaga PKBM";

      await prisma.learningModuleBank.createMany({
        data: validItems.map((item) => ({
          schoolId: session.sekolahId,
          originSchoolName,
          paket: item.paket,
          gradeLevel: item.gradeLevel,
          subject: item.subject,
          title: item.title,
          summary: item.summary,
          fileUrl: item.fileUrl,
          visibility: item.visibility,
        })),
      });

      return res.status(201).json({
        imported: validItems.length,
        errors: errors.slice(0, 20),
        message: `${validItems.length} modul berhasil diimpor sebagai metadata ringan.`,
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Impor massal modul belum dapat diproses.");
    }
  });

  // POST /api/module-bank/seed-national
  router.post("/seed-national", async (_req, res) => {
    try {
      const existing = await prisma.learningModuleBank.findMany({
        where: {
          schoolId: null,
          originSchoolName: NATIONAL_ORIGIN_NAME,
        },
        select: { paket: true, gradeLevel: true, subject: true, title: true },
        take: 1000,
      });

      const existingKeys = new Set(
        existing.map(
          (row) =>
            `${row.paket}::${normalizeLookupKey(row.gradeLevel)}::${normalizeLookupKey(row.subject)}::${normalizeLookupKey(row.title)}`,
        ),
      );

      const toCreate = NATIONAL_MODULE_CATALOG.filter((item) => {
        const key = `${item.paket}::${normalizeLookupKey(item.gradeLevel)}::${normalizeLookupKey(item.subject)}::${normalizeLookupKey(item.title)}`;
        return !existingKeys.has(key);
      });

      if (toCreate.length > 0) {
        await prisma.learningModuleBank.createMany({
          data: toCreate.map((item) => ({
            schoolId: null,
            originSchoolName: NATIONAL_ORIGIN_NAME,
            paket: item.paket,
            gradeLevel: item.gradeLevel,
            subject: item.subject,
            title: item.title,
            summary: item.summary,
            fileUrl: item.fileUrl,
            visibility: "PUBLIC",
          })),
        });
      }

      return res.status(201).json({
        seeded: toCreate.length,
        alreadyPresent: NATIONAL_MODULE_CATALOG.length - toCreate.length,
        totalCatalog: NATIONAL_MODULE_CATALOG.length,
        message:
          toCreate.length > 0
            ? `${toCreate.length} modul Kurikulum Merdeka Kesetaraan berhasil ditambahkan ke Bank Modul Umum.`
            : "Seluruh katalog modul resmi Pendidikan Kesetaraan sudah tersedia di Bank Modul Umum.",
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Gagal mengisi katalog modul nasional.");
    }
  });

  // PATCH /api/module-bank/:id/visibility
  router.patch("/:id/visibility", async (req, res) => {
    try {
      const session = res.locals.moduleSession as { sekolahId: string };
      const id = cleanText(req.params.id, 100);
      const visibility = parseModuleVisibilityStrict(req.body?.visibility);
      if (!id || !visibility) {
        return res.status(400).json({ error: "Status visibilitas harus PRIVATE, PUBLIC, atau ARCHIVED." });
      }

      const existing = await prisma.learningModuleBank.findFirst({
        where: { id, schoolId: session.sekolahId },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Modul tidak ditemukan di Bank Modul Sekolah Anda." });
      }

      const updated = await prisma.learningModuleBank.update({
        where: { id: existing.id },
        data: { visibility },
      });

      const statusText =
        visibility === "PUBLIC"
          ? "dibagikan ke Bank Modul Umum"
          : visibility === "ARCHIVED"
            ? "diarsipkan dan ditarik dari akses publik"
            : "diubah menjadi Privat Sekolah";

      return res.json({
        module: updated,
        message: `Modul berhasil ${statusText}.`,
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Status visibilitas modul belum dapat diperbarui.");
    }
  });

  // DELETE /api/module-bank/:id
  router.delete("/:id", async (req, res) => {
    try {
      const session = res.locals.moduleSession as { sekolahId: string };
      const id = cleanText(req.params.id, 100);
      if (!id) return res.status(400).json({ error: "ID modul tidak valid." });

      const result = await prisma.learningModuleBank.deleteMany({
        where: { id, schoolId: session.sekolahId },
      });
      if (!result.count) {
        return res.status(404).json({ error: "Modul tidak ditemukan atau bukan milik sekolah Anda." });
      }
      return res.json({ message: "Modul dihapus dari Bank Modul Sekolah." });
    } catch (error) {
      return handleModuleBankError(error, res, "Modul belum dapat dihapus.");
    }
  });

  // POST /api/module-bank/:id/assign-to-class
  router.post("/:id/assign-to-class", async (req, res) => {
    try {
      const session = res.locals.moduleSession as {
        sekolahId: string;
        peran: "ADMIN" | "GURU";
        guruId?: string | null;
      };
      const moduleId = cleanText(req.params.id, 100);
      const rawClassId = req.body?.classId ?? req.body?.kelasId ?? req.body?.targetKelasId;
      const targetClassId = cleanText(rawClassId, 100);
      const requestedMapelId = cleanText(req.body?.mapelId, 100);

      if (!moduleId || !targetClassId) {
        return res.status(400).json({ error: "Pilih modul dan kelas tujuan terlebih dahulu." });
      }

      const mod = await prisma.learningModuleBank.findFirst({
        where: {
          id: moduleId,
          OR: [{ visibility: "PUBLIC" }, { schoolId: session.sekolahId }],
        },
      });

      if (!mod || (mod.visibility === "ARCHIVED" && mod.schoolId !== session.sekolahId)) {
        return res.status(404).json({ error: "Modul tidak ditemukan atau sudah ditarik dari akses publik." });
      }

      const targetClass = await prisma.kelas.findFirst({
        where: { id: targetClassId, sekolahId: session.sekolahId },
        select: { id: true, nama: true },
      });
      if (!targetClass) {
        return res.status(404).json({ error: "Kelas tujuan tidak ditemukan di sekolah ini." });
      }

      const now = new Date();
      let tahunAjaran = await prisma.tahunAjaran.findFirst({
        where: { sekolahId: session.sekolahId, mulai: { lte: now }, selesai: { gte: now } },
        select: { id: true },
      });
      if (!tahunAjaran) {
        tahunAjaran = await prisma.tahunAjaran.findFirst({
          where: { sekolahId: session.sekolahId },
          orderBy: { mulai: "desc" },
          select: { id: true },
        });
      }
      if (!tahunAjaran) {
        const y = now.getUTCFullYear();
        tahunAjaran = await prisma.tahunAjaran.create({
          data: {
            sekolahId: session.sekolahId,
            nama: `${y}/${y + 1}`,
            semester: "Ganjil",
            mulai: new Date(Date.UTC(y, 0, 1)),
            selesai: new Date(Date.UTC(y, 11, 31)),
          },
          select: { id: true },
        });
      }

      let mapel = requestedMapelId
        ? await prisma.mapel.findFirst({
            where: { id: requestedMapelId, sekolahId: session.sekolahId },
            select: { id: true, nama: true },
          })
        : null;

      if (!mapel) {
        const schoolMapel = await prisma.mapel.findMany({
          where: { sekolahId: session.sekolahId },
          select: { id: true, nama: true },
          take: 500,
        });
        const desiredKey = normalizeLookupKey(mod.subject);
        mapel = schoolMapel.find((m) => normalizeLookupKey(m.nama) === desiredKey) ?? null;
      }

      if (!mapel) {
        const kode = `MPL-${session.sekolahId.slice(0, 4).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
        mapel = await prisma.mapel.create({
          data: {
            sekolahId: session.sekolahId,
            kode,
            nama: mod.subject,
            kkm: 75,
          },
          select: { id: true, nama: true },
        });
      }

      let resolvedGuruId = session.guruId ?? null;
      if (resolvedGuruId) {
        const ownedGuru = await prisma.guru.findFirst({
          where: { id: resolvedGuruId, sekolahId: session.sekolahId },
          select: { id: true },
        });
        if (!ownedGuru) resolvedGuruId = null;
      }
      if (!resolvedGuruId) {
        const activeGuru = await prisma.guru.findFirst({
          where: { sekolahId: session.sekolahId, status: "Aktif" },
          orderBy: { nama: "asc" },
          select: { id: true },
        });
        if (activeGuru) {
          resolvedGuruId = activeGuru.id;
        } else {
          const fallbackGuru = await prisma.guru.create({
            data: {
              sekolahId: session.sekolahId,
              nama: "Tutor Pustaka Modul",
              mapelUtama: mod.subject,
              email: `tutor.modul.${session.sekolahId.slice(0, 8)}@siput.local`,
              telepon: "-",
              status: "Aktif",
            },
            select: { id: true },
          });
          resolvedGuruId = fallbackGuru.id;
        }
      }

      const duplicate = await prisma.materiAjar.findFirst({
        where: {
          sekolahId: session.sekolahId,
          kelasId: targetClass.id,
          mapelId: mapel.id,
          judul: mod.title,
        },
        select: { id: true },
      });

      if (duplicate) {
        return res.json({
          alreadyExists: true,
          materiId: duplicate.id,
          message: `Modul "${mod.title}" sudah tersedia pada kelas ${targetClass.nama}.`,
        });
      }

      const safeUrl = validateSafeModuleUrl(mod.fileUrl);
      const descriptionParts = [
        `[${mod.paket} · ${mod.gradeLevel} · Sumber: ${mod.originSchoolName}]`,
        mod.summary?.trim() || "",
      ].filter(Boolean);

      const createdMateri = await prisma.materiAjar.create({
        data: {
          sekolahId: session.sekolahId,
          tahunAjaranId: tahunAjaran.id,
          kelasId: targetClass.id,
          mapelId: mapel.id,
          guruId: resolvedGuruId,
          judul: mod.title,
          deskripsi: descriptionParts.join("\n\n"),
          jenis: "MODUL_PDF",
          tautan: safeUrl,
        },
        select: { id: true, judul: true },
      });

      return res.status(201).json({
        alreadyExists: false,
        materi: createdMateri,
        className: targetClass.nama,
        subjectName: mapel.nama,
        message: `Modul "${mod.title}" berhasil disalin ke ${targetClass.nama} (${mapel.nama}).`,
      });
    } catch (error) {
      return handleModuleBankError(error, res, "Gagal menyalin modul ke kelas tujuan.");
    }
  });

  return router;
}
