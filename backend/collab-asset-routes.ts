import { Router } from "express";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "./db.js";
import {
  checkSchoolAiQuota,
  getSchoolAiQuotaSummary,
  recordSchoolAiUsage,
} from "./ai-quota.js";
import { normalizeTenantPlan } from "./plan-utils.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  resolveAuthorizedSchool,
  resolveTeacherScope,
  type SchoolContextResolver,
} from "./school-modules-shared.js";

const VALID_KONDISI_ASET = new Set(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"]);
const VALID_SUMBER_ASET = new Set(["BOSP", "Mandiri", "Hibah", "Lainnya"]);
const VALID_KATEGORI_ASET = new Set(["Elektronik", "Meubelair", "Alat Praktik", "Gedung & Ruang", "Lainnya"]);
const VALID_KATEGORI_DISKUSI = new Set(["UMUM", "KELAS", "PENGUMUMAN"]);

function buildStructuredAiFallback(params: {
  mode: "modul" | "soal" | "chat";
  jenjang: string;
  mapel: string;
  topik: string;
  jumlahSoal: number;
  jenisSoal: string;
  pesan: string;
  schoolName: string;
}): string {
  const { mode, jenjang, mapel, topik, jumlahSoal, jenisSoal, pesan, schoolName } = params;

  if (mode === "modul") {
    return [
      `# Modul Ajar & Rangkuman Materi — ${topik}`,
      `**Lembaga:** ${schoolName} · **Program:** ${jenjang} · **Mata Pelajaran:** ${mapel}`,
      "",
      `## 1. Tujuan Pembelajaran`,
      `- Warga belajar mampu memahami konsep inti dan penerapan **${topik}** dalam konteks kehidupan sehari-hari dan dunia kerja.`,
      `- Warga belajar mampu menyelesaikan latihan pemahaman mandiri secara terstruktur sesuai bobot SKK ${jenjang}.`,
      "",
      `## 2. Ringkasan Pokok Materi`,
      `1. **Pengertian Dasar:** ${topik} merupakan bagian penting pada mata pelajaran ${mapel} yang melatih kemampuan analisis, literasi fungsional, dan pemecahan masalah nyata.`,
      `2. **Konsep & Prinsip Utama:** Identifikasi unsur utama, langkah pengerjaan sistematis, serta contoh penerapan pada aktivitas sosial maupun kewirausahaan warga belajar.`,
      `3. **Studi Kasus Kesetaraan:** Hubungkan konsep ${topik} dengan pengalaman kerja atau kegiatan ekonomi lokal di sekitar lingkungan warga belajar.`,
      "",
      `## 3. Rencana Sesi KBM (Tatap Muka / Tutorial / Mandiri)`,
      `- **Tatap Muka (45 menit):** Pemaparan konsep kunci ${topik} dan tanya-jawab studi kasus.`,
      `- **Tutorial (30 menit):** Diskusi kelompok kecil atau pendampingan kesulitan belajar bersama tutor.`,
      `- **Belajar Mandiri (45 menit):** Merangkum poin penting dan mengerjakan 5 soal evaluasi formatif.`,
      "",
      `## 4. Refleksi Warga Belajar`,
      `- Tuliskan 2 manfaat langsung materi **${topik}** bagi pekerjaan atau aktivitas harian Anda.`,
    ].join("\n");
  }

  if (mode === "soal") {
    const count = Math.max(1, Math.min(10, jumlahSoal));
    const lines: string[] = [
      `# Bank Latihan Soal — ${topik}`,
      `**Program:** ${jenjang} · **Mapel:** ${mapel} · **Format:** ${jenisSoal} (${count} Butir)`,
      "",
    ];
    for (let i = 1; i <= count; i++) {
      if (jenisSoal === "ESAI") {
        lines.push(
          `**Soal ${i} (Uraian):** Jelaskan penerapan konsep ${topik} pada studi kasus ke-${i} dalam mata pelajaran ${mapel}, sertakan alasan dan langkah penyelesaiannya!`,
          `- *Kunci & Rubrik:* Jawaban memuat identifikasi konsep utama ${topik} (skor 40%), alur analisis logis (skor 40%), dan simpulan relevan (skor 20%).`,
          "",
        );
      } else {
        lines.push(
          `**Soal ${i} (Pilihan Ganda):** Dalam kajian *${topik}* (${mapel} ${jenjang}), pendekatan manakah yang paling tepat untuk menyelesaikan permasalahan ke-${i} secara efektif?`,
          `A. Mengabaikan data awal dan langsung menyimpulkan tanpa verifikasi`,
          `B. Mengidentifikasi konsep inti ${topik}, menganalisis data pendukung, lalu menyimpulkan secara sistematis`,
          `C. Menyalin contoh tanpa menyesuaikan konteks persoalan`,
          `D. Menunda evaluasi hingga seluruh variabel tidak relevan`,
          `- *Kunci Jawaban:* **B**`,
          `- *Pembahasan:* Penyelesaian masalah pada topik ${topik} memerlukan pemahaman konsep dasar dan analisis konteks secara bertahap.`,
          "",
        );
      }
    }
    return lines.join("\n");
  }

  const question = pesan || topik;
  return [
    `### Penjelasan Tutor AI — ${mapel} (${jenjang})`,
    `Terima kasih atas pertanyaan mengenai **"${question}"**.`,
    "",
    `1. **Inti Konsep:** Dalam konteks pendidikan kesetaraan ${jenjang}, bahasan ini berfokus pada bagaimana konsep **${topik || question}** dapat dipahami secara praktis tanpa menghafal rumus/definisi semata.`,
    `2. **Langkah Memahami dengan Cepat:**`,
    `   - Pecah topik menjadi 2–3 gagasan pokok terlebih dahulu.`,
    `   - Kaitkan setiap gagasan dengan contoh nyata di lingkungan rumah atau pekerjaan.`,
    `   - Uji pemahaman Anda dengan menjelaskan ulang menggunakan kalimat sendiri dalam 3–4 baris.`,
    `3. **Tips Belajar Mandiri:** Jika masih ada istilah yang terasa sulit pada modul ${mapel}, tuliskan istilah spesifik tersebut agar bisa dibahas lebih rinci langkah demi langkah.`,
  ].join("\n");
}

async function callExternalAiProvider(prompt: string, apiKeyOverride?: string): Promise<string | null> {
  const openRouterKey = apiKeyOverride ? "" : process.env.OPENROUTER_API_KEY?.trim();
  const geminiKey = apiKeyOverride?.trim() || process.env.GEMINI_API_KEY?.trim();

  if (openRouterKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
          messages: [
            {
              role: "system",
              content: "Anda adalah Asisten Tutor Pendidikan Kesetaraan PKBM (Paket A, B, C) berbahasa Indonesia yang jelas, ramah, terstruktur, dan praktis.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.5,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {
      // Fallback to Gemini / structured response
    }
  }

  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Sebagai Asisten Tutor Pendidikan Kesetaraan PKBM (Paket A, B, C) berbahasa Indonesia, jawab permintaan berikut secara terstruktur dan mudah dipahami:\n\n${prompt}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.5,
            },
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
        if (text) return text;
      }
    } catch {
      // Fallback gracefully
    }
  }

  return null;
}

export function tahap2CollabRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  // ==========================================
  // 1. MANAJEMEN ASET & SARPRAS (PRO)
  // ==========================================
  router.get("/aset", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const [school, assets] = await Promise.all([
        prisma.sekolah.findUnique({
          where: { id: sekolahId },
          select: { nama: true, npsn: true, alamatSekolah: true, namaKepalaSekolah: true },
        }),
        prisma.asetSarpras.findMany({
          where: { sekolahId },
          orderBy: [{ lokasiRuangan: "asc" }, { kodeInventaris: "asc" }],
          take: 1000,
        }),
      ]);

      return res.json({ sekolah: school, assets });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Manajemen Aset & Sarpras belum dimigrasi pada database." });
      }
      console.error("Gagal memuat aset sarpras:", error);
      return res.status(503).json({ error: "Data aset & sarpras belum dapat dimuat." });
    }
  });

  router.post("/aset", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const kodeInventaris =
        cleanText(req.body?.kodeInventaris, 50).toUpperCase() ||
        `INV-${new Date().getFullYear()}-${randomBytes(2).toString("hex").toUpperCase()}`;
      const namaBarang = cleanText(req.body?.namaBarang, 180);
      const kategori = cleanText(req.body?.kategori, 40) || "Elektronik";
      const jumlah = cleanInt(req.body?.jumlah, 1, 10000, 1);
      const kondisi = cleanText(req.body?.kondisi, 30) || "BAIK";
      const lokasiRuangan = cleanText(req.body?.lokasiRuangan, 120);
      const tahunPengadaan = cleanInt(req.body?.tahunPengadaan, 1980, 2100, new Date().getFullYear());
      const sumberPengadaan = cleanText(req.body?.sumberPengadaan, 40) || "BOSP";
      const catatan = cleanText(req.body?.catatan, 500) || null;

      if (
        !namaBarang ||
        !lokasiRuangan ||
        !VALID_KATEGORI_ASET.has(kategori) ||
        !VALID_KONDISI_ASET.has(kondisi) ||
        !VALID_SUMBER_ASET.has(sumberPengadaan)
      ) {
        return res.status(400).json({ error: "Lengkapi nama barang, kategori, kondisi, lokasi ruangan, dan sumber dana." });
      }

      const created = await prisma.asetSarpras.create({
        data: {
          sekolahId,
          kodeInventaris,
          namaBarang,
          kategori,
          jumlah,
          kondisi,
          lokasiRuangan,
          tahunPengadaan,
          sumberPengadaan,
          catatan,
        },
      });
      return res.status(201).json({ aset: created, message: "Inventaris sarpras berhasil ditambahkan." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "Kode inventaris sudah digunakan di lembaga ini." });
      }
      console.error("Gagal menyimpan aset sarpras:", error);
      return res.status(503).json({ error: "Aset sarpras belum dapat disimpan." });
    }
  });

  router.patch("/aset/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const existing = await prisma.asetSarpras.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Aset sarpras tidak ditemukan." });

      const kategori = req.body?.kategori ? cleanText(req.body.kategori, 40) : existing.kategori;
      const kondisi = req.body?.kondisi ? cleanText(req.body.kondisi, 30) : existing.kondisi;
      const sumberPengadaan = req.body?.sumberPengadaan ? cleanText(req.body.sumberPengadaan, 40) : existing.sumberPengadaan;

      if (!VALID_KATEGORI_ASET.has(kategori) || !VALID_KONDISI_ASET.has(kondisi) || !VALID_SUMBER_ASET.has(sumberPengadaan)) {
        return res.status(400).json({ error: "Kategori, kondisi, atau sumber dana tidak valid." });
      }

      const updated = await prisma.asetSarpras.update({
        where: { id: existing.id },
        data: {
          kodeInventaris: req.body?.kodeInventaris ? cleanText(req.body.kodeInventaris, 50).toUpperCase() : existing.kodeInventaris,
          namaBarang: req.body?.namaBarang ? cleanText(req.body.namaBarang, 180) : existing.namaBarang,
          kategori,
          jumlah: req.body?.jumlah !== undefined ? cleanInt(req.body.jumlah, 1, 10000, existing.jumlah) : existing.jumlah,
          kondisi,
          lokasiRuangan: req.body?.lokasiRuangan ? cleanText(req.body.lokasiRuangan, 120) : existing.lokasiRuangan,
          tahunPengadaan: req.body?.tahunPengadaan !== undefined ? cleanInt(req.body.tahunPengadaan, 1980, 2100, existing.tahunPengadaan) : existing.tahunPengadaan,
          sumberPengadaan,
          catatan: req.body?.catatan !== undefined ? cleanText(req.body.catatan, 500) || null : existing.catatan,
        },
      });
      return res.json({ aset: updated, message: "Data aset diperbarui." });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "Kode inventaris sudah digunakan aset lain." });
      }
      console.error("Gagal memperbarui aset:", error);
      return res.status(503).json({ error: "Data aset belum dapat diperbarui." });
    }
  });

  router.delete("/aset/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "pro");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const deleted = await prisma.asetSarpras.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Aset tidak ditemukan." });
      return res.json({ message: "Data aset dihapus." });
    } catch (error) {
      console.error("Gagal menghapus aset:", error);
      return res.status(503).json({ error: "Data aset belum dapat dihapus." });
    }
  });

  // ==========================================
  // 2. RUANG DISKUSI (BASIC+)
  // ==========================================
  router.get("/diskusi", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, peran, guruId: sessionGuruId, kelasId: sessionKelasId } = auth.session;
      const teacherScope = peran === "GURU" && sessionGuruId ? await resolveTeacherScope(sekolahId, sessionGuruId) : null;
      const restrictToAssigned = Boolean(teacherScope && !teacherScope.isWaliKelas);
      const isStudent = peran === "SISWA";
      const studentKelasId = isStudent ? (sessionKelasId ?? null) : null;

      const [topics, kelas] = await Promise.all([
        prisma.topikDiskusi.findMany({
          where: {
            sekolahId,
            ...(isStudent
              ? {
                  OR: [
                    { kelasId: null },
                    ...(studentKelasId ? [{ kelasId: studentKelasId }] : []),
                  ],
                }
              : restrictToAssigned
                ? {
                    OR: [
                      { kelasId: null },
                      ...(teacherScope!.assignedKelasIds.length ? [{ kelasId: { in: teacherScope!.assignedKelasIds } }] : []),
                    ],
                  }
                : {}),
          },
          include: {
            balasan: {
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: [{ disematkan: "desc" }, { updatedAt: "desc" }],
          take: 200,
        }),
        prisma.kelas.findMany({
          where: {
            sekolahId,
            ...(isStudent
              ? studentKelasId
                ? { id: studentKelasId }
                : { id: "__none__" }
              : restrictToAssigned
                ? { id: { in: teacherScope!.assignedKelasIds } }
                : {}),
          },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 500,
        }),
      ]);

      return res.json({
        topics,
        kelas,
        ...(isStudent ? { studentKelasId, belumDitempatkan: !studentKelasId } : {}),
      });
    } catch (error) {
      if (isPrismaMissingSchema(error)) {
        return res.status(503).json({ error: "Tabel Ruang Diskusi belum dimigrasi pada database." });
      }
      console.error("Gagal memuat ruang diskusi:", error);
      return res.status(503).json({ error: "Forum diskusi belum dapat dimuat." });
    }
  });

  router.post("/diskusi", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, nama, peran, kelasId: sessionKelasId } = auth.session;

      const judul = cleanText(req.body?.judul, 200);
      const isi = cleanText(req.body?.isi, 3000);
      const kelasId = cleanText(req.body?.kelasId, 100) || null;
      const kategori = cleanText(req.body?.kategori, 30) || (kelasId ? "KELAS" : "UMUM");
      const disematkan = Boolean(req.body?.disematkan) && peran !== "SISWA";

      if (!judul || !isi || !VALID_KATEGORI_DISKUSI.has(kategori)) {
        return res.status(400).json({ error: "Judul, kategori, dan isi topik diskusi wajib diisi." });
      }
      if (peran === "SISWA" && kelasId && kelasId !== sessionKelasId) {
        return res.status(403).json({ error: "Anda hanya dapat membuat topik diskusi pada kelas Anda sendiri atau forum umum." });
      }
      if (kelasId) {
        const kelas = await prisma.kelas.findFirst({ where: { id: kelasId, sekolahId }, select: { id: true } });
        if (!kelas) return res.status(404).json({ error: "Kelas target tidak ditemukan." });
      }

      const created = await prisma.topikDiskusi.create({
        data: {
          sekolahId,
          kelasId,
          kategori,
          judul,
          isi,
          penulisNama: nama,
          penulisPeran: peran,
          disematkan,
        },
        include: { balasan: true },
      });
      return res.status(201).json({ topic: created, message: "Utas diskusi diterbitkan." });
    } catch (error) {
      console.error("Gagal membuat topik diskusi:", error);
      return res.status(503).json({ error: "Topik diskusi belum dapat disimpan." });
    }
  });

  router.post("/diskusi/:id/balasan", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId, nama, peran } = auth.session;

      const topic = await prisma.topikDiskusi.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!topic) return res.status(404).json({ error: "Topik diskusi tidak ditemukan." });
      if (auth.session.peran === "SISWA" && topic.kelasId && topic.kelasId !== auth.session.kelasId) {
        return res.status(403).json({ error: "Anda hanya dapat membalas diskusi pada kelas Anda atau forum umum." });
      }
      if (topic.ditutup) return res.status(409).json({ error: "Utas diskusi ini sudah ditutup oleh admin/tutor." });

      const isi = cleanText(req.body?.isi, 2000);
      if (!isi) return res.status(400).json({ error: "Isi balasan wajib diisi." });

      const [reply] = await prisma.$transaction([
        prisma.balasanDiskusi.create({
          data: {
            sekolahId,
            topikId: topic.id,
            isi,
            penulisNama: nama,
            penulisPeran: peran,
          },
        }),
        prisma.topikDiskusi.update({
          where: { id: topic.id },
          data: { updatedAt: new Date() },
        }),
      ]);

      return res.status(201).json({ balasan: reply, message: "Balasan dikirim." });
    } catch (error) {
      console.error("Gagal mengirim balasan diskusi:", error);
      return res.status(503).json({ error: "Balasan belum dapat dikirim." });
    }
  });

  router.patch("/diskusi/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran === "SISWA") {
        return res.status(403).json({ error: "Hanya Admin atau Guru yang dapat memoderasi topik diskusi." });
      }
      const { sekolahId } = auth.session;

      const existing = await prisma.topikDiskusi.findFirst({ where: { id: req.params.id, sekolahId } });
      if (!existing) return res.status(404).json({ error: "Topik diskusi tidak ditemukan." });

      const updated = await prisma.topikDiskusi.update({
        where: { id: existing.id },
        data: {
          ...(typeof req.body?.disematkan === "boolean" ? { disematkan: req.body.disematkan } : {}),
          ...(typeof req.body?.ditutup === "boolean" ? { ditutup: req.body.ditutup } : {}),
        },
        include: { balasan: { orderBy: { createdAt: "asc" } } },
      });
      return res.json({ topic: updated, message: "Status topik diskusi diperbarui." });
    } catch (error) {
      console.error("Gagal memperbarui topik diskusi:", error);
      return res.status(503).json({ error: "Topik diskusi belum dapat diperbarui." });
    }
  });

  router.delete("/diskusi/:id", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      if (auth.session.peran === "SISWA") {
        return res.status(403).json({ error: "Hanya Admin atau Guru yang dapat menghapus topik diskusi." });
      }
      const deleted = await prisma.topikDiskusi.deleteMany({
        where: { id: req.params.id, sekolahId: auth.session.sekolahId },
      });
      if (!deleted.count) return res.status(404).json({ error: "Topik diskusi tidak ditemukan." });
      return res.json({ message: "Topik diskusi dihapus." });
    } catch (error) {
      console.error("Gagal menghapus topik diskusi:", error);
      return res.status(503).json({ error: "Topik diskusi belum dapat dihapus." });
    }
  });

  // ==========================================
  // 3. RINGKASAN KUOTA AI & ASISTEN BELAJAR AI (PRO · 400 PESAN/BULAN)
  // ==========================================
  router.get("/ai-quota", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;
      const school = await prisma.sekolah.findUnique({
        where: { id: sekolahId },
        select: { plan: true },
      });
      const plan = normalizeTenantPlan(school?.plan);
      const quota = await getSchoolAiQuotaSummary(sekolahId, plan);
      return res.json({ quota });
    } catch (error) {
      console.error("Gagal memuat kuota AI:", error);
      return res.status(503).json({ error: "Informasi kuota AI belum dapat dimuat." });
    }
  });

  router.post("/ai-assistant", async (req, res) => {
    try {
      const auth = await resolveAuthorizedSchool(req, getSchoolSession, "basic");
      if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
      const { sekolahId } = auth.session;

      const school = await prisma.sekolah.findUnique({
        where: { id: sekolahId },
        select: { nama: true, plan: true },
      });
      const schoolName = school?.nama ?? "PKBM";
      const plan = normalizeTenantPlan(school?.plan);

      const quotaGate = await checkSchoolAiQuota(sekolahId, plan, "assistant");
      if (quotaGate.ok === false) {
        return res.status(quotaGate.status).json({
          error: quotaGate.error,
          code: quotaGate.code,
          quota: quotaGate.summary,
        });
      }

      const rawMode = cleanText(req.body?.mode, 20);
      const mode: "modul" | "soal" | "chat" =
        rawMode === "soal" ? "soal" : rawMode === "chat" ? "chat" : "modul";
      const jenjang = cleanText(req.body?.jenjang, 40) || "Paket C (Setara SMA)";
      const mapel = cleanText(req.body?.mapel, 120) || "Umum Kesetaraan";
      const topik = cleanText(req.body?.topik, 200);
      const pesan = cleanText(req.body?.pesan, 2000);
      const jenisSoal = req.body?.jenisSoal === "ESAI" ? "ESAI" : "PG";
      const jumlahSoal = cleanInt(req.body?.jumlahSoal, 1, 10, 5);

      if (mode === "chat" && !pesan) {
        return res.status(400).json({ error: "Tuliskan pertanyaan materi terlebih dahulu." });
      }
      if ((mode === "modul" || mode === "soal") && !topik) {
        return res.status(400).json({ error: "Isi topik bahasan yang ingin dibuatkan materinya." });
      }

      const prompt =
        mode === "modul"
          ? `Buat modul ajar & rangkuman terstruktur untuk pendidikan kesetaraan ${jenjang}, mata pelajaran ${mapel}, topik "${topik}" pada lembaga ${schoolName}. Sertakan tujuan pembelajaran, ringkasan pokok materi, aktivitas Tatap Muka/Tutorial/Mandiri, dan pertanyaan refleksi.`
          : mode === "soal"
            ? `Buat ${jumlahSoal} soal latihan tipe ${jenisSoal === "ESAI" ? "Esai/Uraian" : "Pilihan Ganda (A-D)"} lengkap dengan kunci jawaban dan pembahasan singkat untuk pendidikan kesetaraan ${jenjang}, mata pelajaran ${mapel}, topik "${topik}".`
            : `Konteks: ${jenjang}, mapel ${mapel}${topik ? `, topik ${topik}` : ""}. Pertanyaan warga belajar/tutor: ${pesan}`;

      const externalText = await callExternalAiProvider(prompt, quotaGate.apiKeyOverride);
      const content =
        externalText ??
        buildStructuredAiFallback({
          mode,
          jenjang,
          mapel,
          topik,
          jumlahSoal,
          jenisSoal,
          pesan,
          schoolName,
        });

      // Potong kuota bulanan HANYA jika pemanggilan provider AI eksternal berhasil mengembalikan respons valid
      const updatedQuota =
        externalText && quotaGate.mode === "vendor"
          ? await recordSchoolAiUsage(sekolahId, plan, "assistant")
          : quotaGate.summary;

      return res.json({
        mode,
        source: externalText ? "ai-provider" : "kurikulum-kesetaraan",
        usedSchoolFallbackKey: Boolean(externalText) && quotaGate.mode === "school_fallback",
        quota: updatedQuota,
        content,
      });
    } catch (error) {
      console.error("Gagal memproses asisten AI:", error);
      return res.status(503).json({ error: "Layanan asisten belajar belum tersedia." });
    }
  });

  return router;
}
