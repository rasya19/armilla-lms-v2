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
  // =========================================================================
  // PAKET B (SETARA SMP · FASE D · KELAS 7, 8, 9 — 12 MAPEL × 3 KELAS = 36 MODUL)
  // =========================================================================
  // --- Paket B · Kelas 7 ---
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 1 Paket B (Kls 7): Iman, Ibadah, dan Akhlak Mulia dalam Kehidupan",
    summary: "Penguatan karakter religius, kejujuran, dan toleransi warga belajar Paket B Fase D.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PAI-1/B-PAI-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Pendidikan Pancasila",
    title: "Modul 1 Paket B (Kls 7): Sejarah Kelahiran Pancasila & Norma Bermasyarakat",
    summary: "Memahami nilai dasar Pancasila dan penerapannya dalam tata tertib lingkungan.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PPKn-1/B-PPKn-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Bahasa Indonesia",
    title: "Modul 1 Paket B (Kls 7): Teks Deskripsi, Narasi Imajinatif, dan Teks Prosedur",
    summary: "Modul ajar Kurikulum Merdeka Fase D untuk pemahaman ragam teks fungsional.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BInd-1/B-BInd-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Matematika",
    title: "Modul 1 Paket B (Kls 7): Bilangan Bulat, Rasio, dan Bentuk Aljabar Dasar",
    summary: "Penguatan konsep aljabar awal dan penalaran proporsional Fase D Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Mat-1/B-Mat-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "IPA",
    title: "Modul 1 Paket B (Kls 7): Hakikat Sains, Pengukuran, Zat dan Perubahannya",
    summary: "Eksperimen sederhana di rumah dan tutorial kelompok untuk warga belajar Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPA-1/B-IPA-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "IPS",
    title: "Modul 1 Paket B (Kls 7): Kondisi Geografis Indonesia & Interaksi Sosial",
    summary: "Mengenal potensi sumber daya alam, peta wilayah, dan kehidupan sosial masyarakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPS-1/B-IPS-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Bahasa Inggris",
    title: "Modul 1 Paket B (Kls 7): Greeting, Self Introduction & Daily Routines",
    summary: "Komunikasi dasar bahasa Inggris lisan dan tulis dalam keseharian.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BIng-1/B-BIng-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "PJOK",
    title: "Modul 1 Paket B (Kls 7): Kebugaran Jasmani, Pola Hidup Sehat & Aktivitas Gerak",
    summary: "Panduan latihan kebugaran mandiri dan pola makan bergizi seimbang.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PJOK-1/B-PJOK-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Informatika",
    title: "Modul 1 Paket B (Kls 7): Berpikir Komputasional & Pengenalan Perangkat TIK",
    summary: "Dasar pengoperasian komputer, perangkat lunak perkantoran, dan etika digital.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Inf-1/B-Inf-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Seni dan Budaya",
    title: "Modul 1 Paket B (Kls 7): Menggambar Flora, Fauna & Apresiasi Seni Nusantara",
    summary: "Eksplorasi karya seni rupa dan ragam budaya daerah Indonesia.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-SBD-1/B-SBD-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Pemberdayaan",
    title: "Modul 1 Paket B (Kls 7): Pengembangan Diri, Komunikasi Efektif & Karakter P5",
    summary: "Penguatan kemandirian belajar dan partisipasi aktif dalam komunitas.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PMB-1/B-PMB-1.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 7",
    subject: "Keterampilan",
    title: "Modul 1 Paket B (Kls 7): Kerajinan Bahan Alam & Pengolahan Produk Sederhana",
    summary: "Praktik keterampilan fungsional bernilai guna di lingkungan sekitar.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-KTR-1/B-KTR-1.pdf",
  },

  // --- Paket B · Kelas 8 ---
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 2 Paket B (Kls 8): Moderasi Beragama, Empati & Tanggung Jawab Sosial",
    summary: "Implementasi nilai keimanan dalam membangun kerukunan bermasyarakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PAI-2/B-PAI-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Pendidikan Pancasila",
    title: "Modul 2 Paket B (Kls 8): Konstitusi UUD 1945, Norma, dan Kebinekaan",
    summary: "Pemahaman hak dan kewajiban warga negara serta musyawarah mufakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PPKn-2/B-PPKn-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Bahasa Indonesia",
    title: "Modul 2 Paket B (Kls 8): Teks Berita, Iklan, Eksposisi & Ulasan Karya",
    summary: "Keterampilan literasi media, menyusun argumen, dan mengevaluasi informasi.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BInd-2/B-BInd-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Matematika",
    title: "Modul 2 Paket B (Kls 8): Pola Bilangan, Relasi Fungsi & Sistem Persamaan Linear",
    summary: "Pemodelan masalah nyata menggunakan fungsi linear dan sistem persamaan.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Mat-2/B-Mat-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "IPA",
    title: "Modul 2 Paket B (Kls 8): Gerak, Gaya, Sistem Pencernaan & Getaran Gelombang",
    summary: "Konsep fisika dan biologi terapan pada tubuh manusia dan fenomena alam.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPA-2/B-IPA-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "IPS",
    title: "Modul 2 Paket B (Kls 8): Kemajemukan Masyarakat Indonesia & Aktivitas Ekonomi",
    summary: "Analisis dinamika sosial, mobilitas penduduk, dan kearifan ekonomi masyarakat.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPS-2/B-IPS-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Bahasa Inggris",
    title: "Modul 2 Paket B (Kls 8): Everyday Communication, Recount Text & Notices",
    summary: "Praktik membaca dan menyusun teks interaksi sehari-hari berbahasa Inggris.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BIng-2/B-BIng-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "PJOK",
    title: "Modul 2 Paket B (Kls 8): Permainan Bola Besar, Atletik & Pencegahan Pergaulan Bebas",
    summary: "Aktivitas olahraga terstruktur serta edukasi kesehatan remaja.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PJOK-2/B-PJOK-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Informatika",
    title: "Modul 2 Paket B (Kls 8): Jaringan Komputer, Internet Sehat & Pengolah Angka",
    summary: "Pemanfaatan spreadsheet dan literasi keamanan berinternet.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Inf-2/B-Inf-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Seni dan Budaya",
    title: "Modul 2 Paket B (Kls 8): Desain Poster, Ilustrasi & Musik Tradisional Daerah",
    summary: "Pengembangan kreativitas visual dan apresiasi musik tradisional.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-SBD-2/B-SBD-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Pemberdayaan",
    title: "Modul 2 Paket B (Kls 8): Kepemimpinan Muda, Gotong Royong & Projek P5",
    summary: "Praktik kerja tim dan pemecahan masalah sosial di lingkungan sekitar.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PMB-2/B-PMB-2.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 8",
    subject: "Keterampilan",
    title: "Modul 2 Paket B (Kls 8): Tata Boga Dasar, Pengemasan & Produk UMKM Lokal",
    summary: "Keterampilan pengolahan pangan higienis dan teknik pengemasan produk.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-KTR-2/B-KTR-2.pdf",
  },

  // --- Paket B · Kelas 9 ---
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 3 Paket B (Kls 9): Etika Pergaulan, Kepedulian Sosial & Persiapan Lulus",
    summary: "Internalisasi nilai spiritual dan kesiapan moral warga belajar kelas akhir Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PAI-3/B-PAI-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Pendidikan Pancasila",
    title: "Modul 3 Paket B (Kls 9): Kedaulatan NKRI, Demokrasi & Harmoni dalam Keberagaman",
    summary: "Pemantapan wawasan kebangsaan dan kesadaran hukum warga negara.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PPKn-3/B-PPKn-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Bahasa Indonesia",
    title: "Modul 3 Paket B (Kls 9): Teks Laporan Percobaan, Pidato Persuasif & Cerpen",
    summary: "Keterampilan menyusun laporan ilmiah sederhana dan komunikasi persuasif.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BInd-3/B-BInd-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Matematika",
    title: "Modul 3 Paket B (Kls 9): Persamaan Linear, Teorema Pythagoras, dan Peluang",
    summary: "Pendalaman materi numerasi kunci kelas akhir Paket B Setara SMP.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Mat-3/B-Mat-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "IPA",
    title: "Modul 3 Paket B (Kls 9): Listrik Dinamis, Pewarisan Sifat & Bioteknologi",
    summary: "Materi IPA terapan kelas akhir Paket B dan persiapan UPK.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPA-3/B-IPA-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "IPS",
    title: "Modul 3 Paket B (Kls 9): Globalisasi, Perdagangan Internasional & Ekonomi Kreatif",
    summary: "Memahami keterkaitan ekonomi lokal dengan pasar global secara kontekstual.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-IPS-3/B-IPS-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Bahasa Inggris",
    title: "Modul 3 Paket B (Kls 9): Procedure Text, Report Text & Narrative Comprehension",
    summary: "Penguasaan teks fungsional dan persiapan ujian akhir Bahasa Inggris Paket B.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-BIng-3/B-BIng-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "PJOK",
    title: "Modul 3 Paket B (Kls 9): Manajemen Kebugaran, P3K & Pencegahan Cedera Olahraga",
    summary: "Pengetahuan pertolongan pertama dan gaya hidup aktif berkelanjutan.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PJOK-3/B-PJOK-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Informatika",
    title: "Modul 3 Paket B (Kls 9): Literasi Digital, Pengolah Data, dan Keamanan Siber",
    summary: "Keterampilan dasar teknologi informasi dan etika bermedia digital.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-Inf-3/B-Inf-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Seni dan Budaya",
    title: "Modul 3 Paket B (Kls 9): Seni Grafis, Pameran Karya & Ekonomi Kreatif Seni",
    summary: "Merancang dan memamerkan karya seni terapan di lingkungan PKBM.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-SBD-3/B-SBD-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Pemberdayaan",
    title: "Modul 3 Paket B (Kls 9): Perencanaan Masa Depan, Literasi Finansial & Projek P5",
    summary: "Pengelolaan keuangan pribadi dan kesiapan melanjutkan ke Paket C / dunia kerja.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-PMB-3/B-PMB-3.pdf",
  },
  {
    paket: "Paket B",
    gradeLevel: "Kelas 9",
    subject: "Keterampilan",
    title: "Modul 3 Paket B (Kls 9): Kewirausahaan Mikro & Pemasaran Produk Komunitas",
    summary: "Menyusun perhitungan modal sederhana dan pemasaran karya vokasi.",
    fileUrl: "https://emodul.kemdikbud.go.id/B-KTR-3/B-KTR-3.pdf",
  },

  // =========================================================================
  // PAKET C (SETARA SMA · FASE E & F · KELAS 10, 11, 12 — UMUM + IPA + IPS = 48 MODUL)
  // =========================================================================
  // --- Paket C · Kelas 10 (Fase E) ---
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 1 Paket C (Kls 10): Etos Kerja, Integritas & Nilai Keimanan Remaja",
    summary: "Pembinaan akhlak mulia, etika kerja, dan moderasi beragama Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PAI-1/C-PAI-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Pendidikan Pancasila",
    title: "Modul 1 Paket C (Kls 10): Pancasila sebagai Ideologi Terbuka & Bhinneka Tunggal Ika",
    summary: "Kajian nilai dasar Pancasila dalam kehidupan berbangsa dan bernegara.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PPKn-1/C-PPKn-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Bahasa Indonesia",
    title: "Modul 1 Paket C (Kls 10): Teks Laporan Hasil Observasi, Anekdot, dan Negosiasi",
    summary: "Kurikulum Merdeka Fase E untuk kemampuan analisis kritis dan komunikasi formal.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BInd-1/C-BInd-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Matematika",
    title: "Modul 1 Paket C (Kls 10): Eksponen, Logaritma, Barisan & Deret, dan Trigonometri",
    summary: "Modul ajar Fase E Matematika Umum Paket C Setara SMA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Mat-1/C-Mat-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Bahasa Inggris",
    title: "Modul 1 Paket C (Kls 10): Descriptive, Recount & Functional Workplace English",
    summary: "Penguatan komunikasi bahasa Inggris akademik dan dunia kerja Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BIng-1/C-BIng-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Sejarah",
    title: "Modul 1 Paket C (Kls 10): Pengantar Ilmu Sejarah & Jalur Rempah Nusantara",
    summary: "Pembelajaran sejarah kontekstual untuk warga belajar Paket C Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sej-1/C-Sej-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "PJOK",
    title: "Modul 1 Paket C (Kls 10): Aktivitas Kebugaran, Kesehatan Reproduksi & Gaya Hidup Aktif",
    summary: "Penerapan latihan kebugaran dan manajemen kesehatan jasmani mandiri.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PJOK-1/C-PJOK-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Seni dan Budaya",
    title: "Modul 1 Paket C (Kls 10): Estetika Seni Rupa, Desain & Kritik Karya Budaya",
    summary: "Pengenalan konsep seni modern dan pelestarian kearifan budaya lokal.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-SBD-1/C-SBD-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Informatika",
    title: "Modul 1 Paket C (Kls 10): Algoritma Pemrograman Dasar & Analisis Data Digital",
    summary: "Pengenalan logika komputasi, pengolahan data, dan dampak sosial informatika.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Inf-1/C-Inf-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Fisika",
    title: "Modul 1 Paket C (Kls 10 · IPA): Pengukuran, Energi Terbarukan & Pemanasan Global",
    summary: "Konsep dasar fisika terapan untuk jurusan IPA Paket C Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Fis-1/C-Fis-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Kimia",
    title: "Modul 1 Paket C (Kls 10 · IPA): Kimia Hijau, Struktur Atom & Hukum Dasar Kimia",
    summary: "Pengantar ilmu kimia ramah lingkungan untuk jurusan IPA Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Kim-1/C-Kim-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Biologi",
    title: "Modul 1 Paket C (Kls 10 · IPA): Virus, Keanekaragaman Hayati & Ekosistem",
    summary: "Kajian biologi lingkungan dan kesehatan untuk jurusan IPA Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Bio-1/C-Bio-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Ekonomi",
    title: "Modul 1 Paket C (Kls 10 · IPS): Konsep Ilmu Ekonomi, Kelangkaan & Lembaga Keuangan",
    summary: "Dasar literasi ekonomi dan keuangan untuk jurusan IPS Paket C Fase E.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Eko-1/C-Eko-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Sosiologi",
    title: "Modul 1 Paket C (Kls 10 · IPS): Individu, Masyarakat & Metode Penelitian Sosial",
    summary: "Pengantar sosiologi dan observasi gejala sosial untuk jurusan IPS Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sos-1/C-Sos-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Geografi",
    title: "Modul 1 Paket C (Kls 10 · IPS): Dasar Pemetaan, Penginderaan Jauh & Dinamika Bumi",
    summary: "Pemahaman ruang geografis dan lingkungan hidup untuk jurusan IPS Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Geo-1/C-Geo-1.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 10",
    subject: "Pemberdayaan & Keterampilan",
    title: "Modul 1 Paket C (Kls 10): Pengenalan Potensi Diri, Literasi Kerja & Vokasi Dasar",
    summary: "Fondasi kecakapan hidup dan kemandirian warga belajar Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PK-1/C-PK-1.pdf",
  },

  // --- Paket C · Kelas 11 (Fase F) ---
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 2 Paket C (Kls 11): Etika Bermedia, Ukhuwah & Kepemimpinan Berintegritas",
    summary: "Implementasi nilai moral dan etika sosial pada era digital Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PAI-2/C-PAI-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Pendidikan Pancasila",
    title: "Modul 2 Paket C (Kls 11): Demokrasi Konstitusional, HAM & Sistem Hukum Nasional",
    summary: "Pendalaman hak asasi manusia dan partisipasi warga dalam negara hukum.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PPKn-2/C-PPKn-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Bahasa Indonesia",
    title: "Modul 2 Paket C (Kls 11): Teks Argumentasi, Proposal Kegiatan & Karya Ilmiah",
    summary: "Keterampilan menulis akademik, proposal usaha/komunitas, dan presentasi efektif.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BInd-2/C-BInd-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Matematika",
    title: "Modul 2 Paket C (Kls 11): Komposisi Fungsi, Lingkaran & Statistika Regresi",
    summary: "Matematika Wajib Fase F untuk penalaran kuantitatif dan analisis data.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Mat-2/C-Mat-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Bahasa Inggris",
    title: "Modul 2 Paket C (Kls 11): Analytical Exposition, Argumentative & Digital Literacy",
    summary: "Penguatan literasi teks akademik dan opini Fase F Bahasa Inggris Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BIng-2/C-BIng-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Sejarah",
    title: "Modul 2 Paket C (Kls 11): Pergerakan Nasional Indonesia hingga Proklamasi 1945",
    summary: "Kajian perjuangan kemerdekaan dan pembentukan identitas kebangsaan.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sej-2/C-Sej-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "PJOK",
    title: "Modul 2 Paket C (Kls 11): Program Latihan Kebugaran & Manajemen Stres Kerja",
    summary: "Menjaga kesehatan fisik dan mental bagi warga belajar usia produktif.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PJOK-2/C-PJOK-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Seni dan Budaya",
    title: "Modul 2 Paket C (Kls 11): Desain Komunikasi Visual & Produksi Karya Kreatif",
    summary: "Penerapan prinsip desain untuk media promosi dan produk kreatif lokal.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-SBD-2/C-SBD-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Informatika",
    title: "Modul 2 Paket C (Kls 11): Pengolahan Basis Data, Web Dasar & Kolaborasi Cloud",
    summary: "Penerapan aplikasi produktivitas dan teknologi web untuk kebutuhan kerja.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Inf-2/C-Inf-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Fisika",
    title: "Modul 2 Paket C (Kls 11 · IPA): Vektor, Kinematika, Fluida & Termodinamika",
    summary: "Pendalaman fisika mekanika dan energi untuk jurusan IPA Paket C Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Fis-2/C-Fis-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Kimia",
    title: "Modul 2 Paket C (Kls 11 · IPA): Stoikiometri, Termokimia, Laju Reaksi & Kesetimbangan",
    summary: "Analisis reaksi kimia terapan untuk jurusan IPA Paket C Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Kim-2/C-Kim-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Biologi",
    title: "Modul 2 Paket C (Kls 11 · IPA): Struktur Sel, Sistem Organ Manusia & Imunitas",
    summary: "Memahami fisiologi tubuh dan kesehatan untuk jurusan IPA Paket C Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Bio-2/C-Bio-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Ekonomi",
    title: "Modul 2 Paket C (Kls 11 · IPS): Badan Usaha, Koperasi, Kebijakan Moneter & Fiskal",
    summary: "Pengantar ilmu ekonomi mikro-makro terapan bagi pelaku usaha & warga belajar.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Eko-2/C-Eko-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Sosiologi",
    title: "Modul 2 Paket C (Kls 11 · IPS): Kelompok Sosial, Kesetaraan, dan Perubahan Masyarakat",
    summary: "Studi kasus dinamika sosial dan pemberdayaan komunitas Fase F.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sos-2/C-Sos-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Geografi",
    title: "Modul 2 Paket C (Kls 11 · IPS): Posisi Strategis Indonesia, Sumber Daya Alam & Mitigasi",
    summary: "Pemetaan wilayah, pelestarian lingkungan, dan kesiapsiagaan bencana.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Geo-2/C-Geo-2.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 11",
    subject: "Pemberdayaan & Keterampilan",
    title: "Modul 2 Paket C (Kls 11): Manajemen Proyek Komunitas & Aplikasi Perkantoran",
    summary: "Penguasaan tata kelola administrasi, spreadsheet, dan desain publikasi.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PK-2/C-PK-2.pdf",
  },

  // --- Paket C · Kelas 12 (Fase F Akhir / Persiapan UPK) ---
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Pendidikan Agama dan Budi Pekerti",
    title: "Modul 3 Paket C (Kls 12): Tanggung Jawab Kehidupan, Etika Profesi & Kerukunan",
    summary: "Pemantapan karakter dan kesiapan mental lulusan Paket C Setara SMA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PAI-3/C-PAI-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Pendidikan Pancasila",
    title: "Modul 3 Paket C (Kls 12): Tata Kelola Pemerintahan, Wawasan Nusantara & Globalisasi",
    summary: "Analisis peran warga negara Indonesia di tengah tantangan global.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PPKn-3/C-PPKn-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Bahasa Indonesia",
    title: "Modul 3 Paket C (Kls 12): Surat Lamaran Kerja, Artikel Ilmiah & Editorial Kritis",
    summary: "Kecakapan menulis profesional dan kesiapan karier/studi lanjut lulusan Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BInd-3/C-BInd-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Matematika",
    title: "Modul 3 Paket C (Kls 12): Peluang, Kaidah Pencacahan, dan Statistika Terapan",
    summary: "Persiapan asesmen akhir dan literasi numerasi kelas 12 Paket C.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Mat-3/C-Mat-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Bahasa Inggris",
    title: "Modul 3 Paket C (Kls 12): Job Application, Discussion Text & Exam Readiness",
    summary: "Persiapan wawancara kerja, komunikasi profesional, dan UPK Bahasa Inggris.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-BIng-3/C-BIng-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Sejarah",
    title: "Modul 3 Paket C (Kls 12): Indonesia Masa Demokrasi, Orde Baru hingga Reformasi",
    summary: "Kajian sejarah kontemporer Indonesia sebagai bekal wawasan kebangsaan.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sej-3/C-Sej-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "PJOK",
    title: "Modul 3 Paket C (Kls 12): Evaluasi Kebugaran Jasmani & Kesehatan Lingkungan Kerja",
    summary: "Penerapan keselamatan kerja dan kebugaran jangka panjang.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-PJOK-3/C-PJOK-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Seni dan Budaya",
    title: "Modul 3 Paket C (Kls 12): Manajemen Pergelaran, Portofolio & Industri Kreatif",
    summary: "Pengembangan portofolio karya seni dan peluang usaha kreatif.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-SBD-3/C-SBD-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Informatika",
    title: "Modul 3 Paket C (Kls 12): Keamanan Informasi, Otomasi Kerja & Proyek Digital",
    summary: "Penerapan teknologi informasi untuk produktivitas bisnis dan karier.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Inf-3/C-Inf-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Fisika",
    title: "Modul 3 Paket C (Kls 12 · IPA): Listrik Magnet, Gelombang Elektromagnetik & Fisika Modern",
    summary: "Pemantapan konsep fisika kelas akhir dan latihan komprehensif UPK IPA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Fis-3/C-Fis-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Kimia",
    title: "Modul 3 Paket C (Kls 12 · IPA): Elektrokimia, Senyawa Karbon & Makromolekul",
    summary: "Aplikasi kimia dalam industri, pangan, dan persiapan UPK jurusan IPA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Kim-3/C-Kim-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Biologi",
    title: "Modul 3 Paket C (Kls 12 · IPA): Metabolisme, Genetika, Evolusi & Bioteknologi Modern",
    summary: "Pendalaman biologi kelas akhir untuk kesiapan UPK dan studi lanjut IPA.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Bio-3/C-Bio-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Ekonomi",
    title: "Modul 3 Paket C (Kls 12 · IPS): Akuntansi Perusahaan Jasa/Dagang & Ekonomi Digital",
    summary: "Keterampilan pembukuan usaha dan analisis laporan keuangan jurusan IPS.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Eko-3/C-Eko-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Sosiologi",
    title: "Modul 3 Paket C (Kls 12 · IPS): Perubahan Sosial, Ketimpangan & Pemberdayaan Komunitas",
    summary: "Analisis kritis isu sosial kontemporer dan persiapan UPK jurusan IPS.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Sos-3/C-Sos-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Geografi",
    title: "Modul 3 Paket C (Kls 12 · IPS): Tata Ruang Wilayah, Interaksi Desa-Kota & Negara Maju",
    summary: "Kajian pembangunan wilayah berkelanjutan untuk persiapan UPK jurusan IPS.",
    fileUrl: "https://emodul.kemdikbud.go.id/C-Geo-3/C-Geo-3.pdf",
  },
  {
    paket: "Paket C",
    gradeLevel: "Kelas 12",
    subject: "Pemberdayaan & Keterampilan",
    title: "Modul 3 Paket C (Kls 12): Kewirausahaan Digital, Pemasaran Produk & Rencana Usaha",
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
      // Remove legacy Paket A entries from national catalog (focus on Paket B & Paket C only)
      await prisma.learningModuleBank
        .deleteMany({
          where: {
            schoolId: null,
            originSchoolName: NATIONAL_ORIGIN_NAME,
            paket: "Paket A",
          },
        })
        .catch(() => null);

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
              email: `tutor.modul.${session.sekolahId.slice(0, 8)}@lms.local`,
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
