import { Router, type Request } from "express";
import { Prisma } from "@prisma/client";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "./db.js";
import {
  cleanInt,
  cleanText,
  isPrismaMissingSchema,
  type SchoolContextResolver,
} from "./school-modules-shared.js";
import {
  cloneMasterContentToSchool,
  jenjangLabel,
  normalizeMasterJenjang,
  normalizeMasterKategori,
  normalizeModuleVisibility,
  normalizeTingkatKelas,
  parseMasterBankSoalInput,
  parseMasterButirList,
  parseMasterModulInput,
  type MasterJenjang,
  type MasterKategori,
  type ParsedMasterModul,
} from "./master-content-shared.js";

export type MasterSessionChecker = (req: Request) => Promise<{ akunId: string; nama: string } | null>;

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function handleMasterSchemaError(error: unknown, res: import("express").Response, fallback: string) {
  if (isPrismaMissingSchema(error)) {
    return res.status(503).json({
      error: "Tabel Pustaka Konten Pusat belum dimigrasi pada database. Jalankan migrasi terlebih dahulu.",
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return res.status(404).json({ error: "Data pustaka konten tidak ditemukan." });
  }
  console.error(fallback, error);
  return res.status(503).json({ error: fallback });
}

export function masterContentRoutes(requireMaster: MasterSessionChecker) {
  const router = Router();

  router.use(async (req, res, next) => {
    try {
      const master = await requireMaster(req);
      if (!master) return res.status(401).json({ error: "Sesi Master Admin tidak valid." });
      return next();
    } catch (error) {
      console.error("Gagal memverifikasi sesi Master Admin:", error);
      return res.status(503).json({ error: "Verifikasi sesi tidak tersedia." });
    }
  });

  // GET /api/master/pustaka-konten
  router.get("/", async (req, res) => {
    try {
      const rawJenjang = typeof req.query.jenjang === "string" ? req.query.jenjang.trim() : "";
      const rawKategori = typeof req.query.kategori === "string" ? req.query.kategori.trim() : "";
      const rawMapel = typeof req.query.mapel === "string" ? req.query.mapel.trim() : "";
      const rawQ = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      const jenjangFilter = rawJenjang ? normalizeMasterJenjang(rawJenjang, "PAKET_C") : null;
      const kategoriFilter = rawKategori ? normalizeMasterKategori(rawKategori, "UTS") : null;

      const [moduls, bankSoal] = await Promise.all([
        prisma.masterModul.findMany({
          where: {
            ...(jenjangFilter ? { jenjang: jenjangFilter } : {}),
            ...(kategoriFilter ? { kategoriUjian: kategoriFilter } : {}),
            ...(rawMapel ? { mataPelajaran: { equals: rawMapel, mode: "insensitive" } } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: 500,
        }),
        prisma.masterBankSoal.findMany({
          where: {
            ...(jenjangFilter ? { jenjang: jenjangFilter } : {}),
            ...(kategoriFilter && kategoriFilter !== "MATERI" ? { kategoriUjian: kategoriFilter } : {}),
            ...(rawMapel ? { mataPelajaran: { equals: rawMapel, mode: "insensitive" } } : {}),
          },
          include: {
            _count: { select: { butirSoal: true } },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 500,
        }),
      ]);

      const filteredModuls = rawQ
        ? moduls.filter((m) =>
            `${m.judul} ${m.mataPelajaran} ${m.tingkatKelas} ${m.deskripsi ?? ""}`.toLowerCase().includes(rawQ),
          )
        : moduls;
      const filteredBank =
        kategoriFilter === "MATERI"
          ? []
          : rawQ
            ? bankSoal.filter((b) =>
                `${b.judul} ${b.mataPelajaran} ${b.tingkatKelas} ${b.deskripsi ?? ""}`.toLowerCase().includes(rawQ),
              )
            : bankSoal;

      const mapelSet = new Set<string>();
      for (const m of moduls) mapelSet.add(m.mataPelajaran);
      for (const b of bankSoal) mapelSet.add(b.mataPelajaran);

      const totalButirSoal = bankSoal.reduce((sum, item) => sum + item._count.butirSoal, 0);

      return res.json({
        modul: filteredModuls,
        bankSoal: filteredBank,
        mataPelajaranList: [...mapelSet].sort((a, b) => a.localeCompare(b, "id-ID")),
        summary: {
          totalModul: moduls.length,
          totalBankSoal: bankSoal.length,
          totalButirSoal,
        },
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Pustaka Konten Pusat belum dapat dimuat.");
    }
  });

  // GET /api/master/pustaka-konten/bank-soal/:id
  router.get("/bank-soal/:id", async (req, res) => {
    try {
      const bank = await prisma.masterBankSoal.findUnique({
        where: { id: req.params.id },
        include: { butirSoal: { orderBy: { urutan: "asc" } } },
      });
      if (!bank) return res.status(404).json({ error: "Paket bank soal pusat tidak ditemukan." });
      return res.json({ bankSoal: bank });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Detail bank soal pusat belum dapat dimuat.");
    }
  });

  // POST /api/master/pustaka-konten/modul
  router.post("/modul", async (req, res) => {
    try {
      const parsed = parseMasterModulInput(req.body);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
      const created = await prisma.masterModul.create({ data: parsed.data });
      return res.status(201).json({ modul: created, message: "Modul ajar pusat berhasil disimpan." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Modul ajar pusat belum dapat disimpan.");
    }
  });

  // PUT /api/master/pustaka-konten/modul/:id
  router.put("/modul/:id", async (req, res) => {
    try {
      const parsed = parseMasterModulInput(req.body);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
      const updated = await prisma.masterModul.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      return res.json({ modul: updated, message: "Modul ajar pusat diperbarui." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Modul ajar pusat belum dapat diperbarui.");
    }
  });

  // DELETE /api/master/pustaka-konten/modul/:id
  router.delete("/modul/:id", async (req, res) => {
    try {
      await prisma.masterModul.delete({ where: { id: req.params.id } });
      return res.json({ message: "Modul ajar pusat dihapus." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Modul ajar pusat belum dapat dihapus.");
    }
  });

  // POST /api/master/pustaka-konten/bank-soal
  router.post("/bank-soal", async (req, res) => {
    try {
      const parsed = parseMasterBankSoalInput(req.body);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });

      const rawButir = Array.isArray(req.body?.butirSoal) ? req.body.butirSoal : [];
      const parsedButir = rawButir.length > 0 ? parseMasterButirList(rawButir) : { items: [], errors: [] };
      if (rawButir.length > 0 && parsedButir.items.length === 0) {
        return res.status(400).json({ error: parsedButir.errors[0] || "Tidak ada butir soal valid." });
      }

      const created = await prisma.masterBankSoal.create({
        data: {
          ...parsed.data,
          ...(parsedButir.items.length > 0
            ? {
                butirSoal: {
                  create: parsedButir.items.map((item, idx) => ({
                    urutan: idx + 1,
                    tipe: item.tipe,
                    teks: item.teks,
                    bobot: item.bobot,
                    opsiA: item.opsiA,
                    opsiB: item.opsiB,
                    opsiC: item.opsiC,
                    opsiD: item.opsiD,
                    opsiE: item.opsiE,
                    kunciJawaban: item.kunciJawaban,
                    pembahasan: item.pembahasan,
                  })),
                },
              }
            : {}),
        },
        include: { _count: { select: { butirSoal: true } }, butirSoal: { orderBy: { urutan: "asc" } } },
      });

      return res.status(201).json({
        bankSoal: created,
        warnings: parsedButir.errors.slice(0, 10),
        message: `Paket bank soal pusat berhasil disimpan (${parsedButir.items.length} butir soal).`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Paket bank soal pusat belum dapat disimpan.");
    }
  });

  // PUT /api/master/pustaka-konten/bank-soal/:id
  router.put("/bank-soal/:id", async (req, res) => {
    try {
      const parsed = parseMasterBankSoalInput(req.body);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
      const updated = await prisma.masterBankSoal.update({
        where: { id: req.params.id },
        data: parsed.data,
        include: { _count: { select: { butirSoal: true } } },
      });
      return res.json({ bankSoal: updated, message: "Paket bank soal pusat diperbarui." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Paket bank soal pusat belum dapat diperbarui.");
    }
  });

  // DELETE /api/master/pustaka-konten/bank-soal/:id
  router.delete("/bank-soal/:id", async (req, res) => {
    try {
      await prisma.masterBankSoal.delete({ where: { id: req.params.id } });
      return res.json({ message: "Paket bank soal pusat dihapus." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Paket bank soal pusat belum dapat dihapus.");
    }
  });

  // POST /api/master/pustaka-konten/bank-soal/:id/soal (append or replace)
  router.post("/bank-soal/:id/soal", async (req, res) => {
    try {
      const bank = await prisma.masterBankSoal.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!bank) return res.status(404).json({ error: "Paket bank soal pusat tidak ditemukan." });

      const rawList = Array.isArray(req.body?.butirSoal) ? req.body.butirSoal : [req.body];
      const parsed = parseMasterButirList(rawList);
      if (parsed.items.length === 0) {
        return res.status(400).json({ error: parsed.errors[0] || "Tidak ada butir soal valid." });
      }
      const mode = req.body?.mode === "replace" ? "replace" : "append";

      const totalAfter = await prisma.$transaction(async (tx) => {
        let startUrutan = 1;
        if (mode === "replace") {
          await tx.masterButirSoal.deleteMany({ where: { bankSoalId: bank.id } });
        } else {
          const last = await tx.masterButirSoal.findFirst({
            where: { bankSoalId: bank.id },
            orderBy: { urutan: "desc" },
            select: { urutan: true },
          });
          startUrutan = (last?.urutan ?? 0) + 1;
        }
        await tx.masterButirSoal.createMany({
          data: parsed.items.map((item, idx) => ({
            bankSoalId: bank.id,
            urutan: startUrutan + idx,
            tipe: item.tipe,
            teks: item.teks,
            bobot: item.bobot,
            opsiA: item.opsiA,
            opsiB: item.opsiB,
            opsiC: item.opsiC,
            opsiD: item.opsiD,
            opsiE: item.opsiE,
            kunciJawaban: item.kunciJawaban,
            pembahasan: item.pembahasan,
          })),
        });
        return tx.masterButirSoal.count({ where: { bankSoalId: bank.id } });
      });

      return res.status(201).json({
        inserted: parsed.items.length,
        totalSoal: totalAfter,
        warnings: parsed.errors.slice(0, 10),
        message: `${parsed.items.length} butir soal berhasil ditambahkan ke bank soal pusat.`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Butir soal belum dapat disimpan.");
    }
  });

  // DELETE /api/master/pustaka-konten/bank-soal/:id/soal/:soalId
  router.delete("/bank-soal/:id/soal/:soalId", async (req, res) => {
    try {
      const deleted = await prisma.masterButirSoal.deleteMany({
        where: { id: req.params.soalId, bankSoalId: req.params.id },
      });
      if (deleted.count === 0) {
        return res.status(404).json({ error: "Butir soal tidak ditemukan." });
      }
      return res.json({ message: "Butir soal dihapus." });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Butir soal belum dapat dihapus.");
    }
  });

  // POST /api/master/pustaka-konten/import (Bulk Excel/JSON import)
  router.post("/import", async (req, res) => {
    try {
      const mode = req.body?.mode === "modul" ? "modul" : "bank-soal";
      if (mode === "modul") {
        const rows = Array.isArray(req.body?.items) ? req.body.items : [];
        if (rows.length === 0) return res.status(400).json({ error: "Daftar modul untuk diimpor kosong." });
        const defaultVisibility = normalizeModuleVisibility(req.body?.visibility, "PUBLIC");
        const validModuls = rows.slice(0, 500).map((row) => parseMasterModulInput(row, defaultVisibility));
        const toInsert = validModuls.filter((item): item is { ok: true; data: ParsedMasterModul } => item.ok);
        const errors = validModuls
          .map((item, idx) => (item.ok === false ? `Baris #${idx + 1}: ${item.error}` : null))
          .filter((msg): msg is string => Boolean(msg));
        if (toInsert.length === 0) {
          return res.status(400).json({ error: errors[0] || "Tidak ada modul valid untuk diimpor." });
        }
        await prisma.masterModul.createMany({ data: toInsert.map((item) => item.data) });
        return res.status(201).json({
          imported: toInsert.length,
          errors: errors.slice(0, 15),
          message: `${toInsert.length} modul ajar pusat berhasil diimpor.`,
        });
      }

      // Bulk import bank-soal (either single packet with butirSoal OR array of packets)
      const packetsRaw = Array.isArray(req.body?.packets)
        ? req.body.packets
        : req.body?.bankSoal
          ? [{ ...req.body.bankSoal, butirSoal: req.body.butirSoal }]
          : [];
      if (packetsRaw.length === 0) {
        return res.status(400).json({ error: "Data paket bank soal untuk diimpor tidak ditemukan." });
      }

      let importedPackets = 0;
      let importedQuestions = 0;
      const errors: string[] = [];

      for (let i = 0; i < Math.min(packetsRaw.length, 30); i++) {
        const raw = packetsRaw[i] as Record<string, unknown>;
        const parsedPacket = parseMasterBankSoalInput(raw);
        if (parsedPacket.ok === false) {
          errors.push(`Paket #${i + 1}: ${parsedPacket.error}`);
          continue;
        }
        const parsedButir = parseMasterButirList(raw.butirSoal ?? raw.soal ?? []);
        if (parsedButir.items.length === 0) {
          errors.push(`Paket "${parsedPacket.data.judul}": ${parsedButir.errors[0] || "tidak memiliki butir soal valid."}`);
          continue;
        }

        await prisma.masterBankSoal.create({
          data: {
            ...parsedPacket.data,
            butirSoal: {
              create: parsedButir.items.map((item, idx) => ({
                urutan: idx + 1,
                tipe: item.tipe,
                teks: item.teks,
                bobot: item.bobot,
                opsiA: item.opsiA,
                opsiB: item.opsiB,
                opsiC: item.opsiC,
                opsiD: item.opsiD,
                opsiE: item.opsiE,
                kunciJawaban: item.kunciJawaban,
                pembahasan: item.pembahasan,
              })),
            },
          },
        });
        importedPackets += 1;
        importedQuestions += parsedButir.items.length;
        if (parsedButir.errors.length > 0) {
          errors.push(...parsedButir.errors.slice(0, 5));
        }
      }

      if (importedPackets === 0) {
        return res.status(400).json({ error: errors[0] || "Impor bank soal gagal." });
      }

      return res.status(201).json({
        importedPackets,
        importedQuestions,
        errors: errors.slice(0, 15),
        message: `${importedPackets} paket bank soal (${importedQuestions} butir soal) berhasil diimpor ke Pustaka Pusat.`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Impor massal Pustaka Konten Pusat gagal.");
    }
  });

  // POST /api/master/pustaka-konten/generate-ai (Server-side Gemini API via @google/genai)
  router.post("/generate-ai", async (req, res) => {
    try {
      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            "GEMINI_API_KEY belum dikonfigurasi pada server. Atur kunci API di Settings > Secrets untuk mengaktifkan pembuatan draf soal AI.",
        });
      }

      const mode = req.body?.mode === "modul" ? "modul" : "soal";
      const jenjang = normalizeMasterJenjang(req.body?.jenjang, "PAKET_C") ?? "PAKET_C";
      const tingkatKelas = normalizeTingkatKelas(req.body?.tingkatKelas, jenjang);
      const mataPelajaran = cleanText(req.body?.mataPelajaran, 120);
      const kategori = normalizeMasterKategori(req.body?.kategoriUjian, mode === "modul" ? "MATERI" : "UTS") ?? "UTS";
      const topik = cleanText(req.body?.topik, 300);
      const jumlahSoal = cleanInt(req.body?.jumlahSoal, 2, 20, 5);

      if (!mataPelajaran) {
        return res.status(400).json({ error: "Mata pelajaran wajib diisi untuk menghasilkan draf AI." });
      }

      const jenjangText = jenjangLabel(jenjang);

      if (mode === "modul") {
        const prompt = [
          `Susun draf modul ajar pendidikan kesetaraan PKBM berbahasa Indonesia yang terstruktur dan aplikatif.`,
          `Jenjang: ${jenjangText} (${tingkatKelas})`,
          `Mata Pelajaran: ${mataPelajaran}`,
          topik ? `Topik/Kompetensi Dasar: ${topik}` : `Topik: Materi inti kurikulum kesetaraan ${mataPelajaran}`,
          `Sertakan tujuan pembelajaran, ringkasan konsep inti, contoh kontekstual, dan latihan refleksi singkat.`,
        ].join("\n");

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            maxOutputTokens: 4096,
            systemInstruction:
              "Anda adalah penyusun kurikulum Pendidikan Kesetaraan PKBM Indonesia (Paket A, B, C). Keluarkan JSON valid sesuai skema.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                judul: { type: Type.STRING, description: "Judul modul ajar singkat dan jelas." },
                deskripsi: { type: Type.STRING, description: "Ringkasan tujuan modul dalam 2-3 kalimat." },
                konten: { type: Type.STRING, description: "Isi lengkap modul ajar dalam format teks terstruktur." },
              },
              required: ["judul", "deskripsi", "konten"],
            },
          },
        });

        const rawJson = (response.text ?? "").trim();
        if (!rawJson) {
          return res.status(502).json({ error: "Respons AI kosong. Silakan coba lagi." });
        }
        const draft = JSON.parse(rawJson) as { judul: string; deskripsi: string; konten: string };
        return res.json({
          mode: "modul",
          draft: {
            jenjang,
            tingkatKelas,
            mataPelajaran,
            kategoriUjian: "MATERI",
            judul: cleanText(draft.judul, 220) || `Modul ${mataPelajaran} - ${topik || tingkatKelas}`,
            deskripsi: cleanText(draft.deskripsi, 1000),
            konten: cleanText(draft.konten, 20000),
          },
        });
      }

      const kategoriLabel =
        kategori === "UTS"
          ? "Ujian Tengah Semester (UTS)"
          : kategori === "UAS"
            ? "Ujian Akhir Semester (UAS)"
            : "Ujian Pendidikan Kesetaraan / Ujian Akhir Kelas Akhir (UPK)";

      const prompt = [
        `Buat tepat ${jumlahSoal} soal pilihan ganda berkualitas tinggi untuk bank soal pusat PKBM Kesetaraan Indonesia.`,
        `Jenjang: ${jenjangText} (${tingkatKelas})`,
        `Mata Pelajaran: ${mataPelajaran}`,
        `Kategori Evaluasi: ${kategoriLabel}`,
        topik ? `Fokus Materi / Kisi-kisi: ${topik}` : `Fokus Materi: Kompetensi esensial ${mataPelajaran} ${jenjangText}`,
        `Setiap soal wajib memiliki 4 opsi (opsiA sampai opsiD, opsiE boleh kosong untuk Paket A atau diisi untuk Paket B/C), kunciJawaban berupa tepat satu huruf kapital (A/B/C/D/E) yang sesuai dengan opsi yang terisi, bobot angka (default 10), dan pembahasan singkat yang edukatif.`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          maxOutputTokens: 4096,
          systemInstruction:
            "Anda adalah penulis soal profesional Pendidikan Kesetaraan PKBM Indonesia (Paket A, B, C). Pastikan kunci jawaban benar secara akademis dan bahasa Indonesia baku.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              judulPaket: { type: Type.STRING, description: "Judul paket ujian siap pakai." },
              deskripsiPaket: { type: Type.STRING, description: "Deskripsi singkat cakupan materi paket soal." },
              butirSoal: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    teks: { type: Type.STRING },
                    opsiA: { type: Type.STRING },
                    opsiB: { type: Type.STRING },
                    opsiC: { type: Type.STRING },
                    opsiD: { type: Type.STRING },
                    opsiE: { type: Type.STRING },
                    kunciJawaban: { type: Type.STRING, description: "Satu huruf kapital: A, B, C, D, atau E." },
                    pembahasan: { type: Type.STRING },
                    bobot: { type: Type.INTEGER },
                  },
                  required: ["teks", "opsiA", "opsiB", "opsiC", "opsiD", "kunciJawaban", "pembahasan"],
                },
              },
            },
            required: ["judulPaket", "butirSoal"],
          },
        },
      });

      const rawJson = (response.text ?? "").trim();
      if (!rawJson) {
        return res.status(502).json({ error: "Respons AI kosong. Silakan coba lagi." });
      }
      const parsedDraft = JSON.parse(rawJson) as {
        judulPaket?: string;
        deskripsiPaket?: string;
        butirSoal?: unknown[];
      };
      const normalizedButir = parseMasterButirList(parsedDraft.butirSoal ?? []);
      if (normalizedButir.items.length === 0) {
        return res.status(502).json({ error: "Draf soal AI belum memenuhi format valid. Silakan coba ulang." });
      }

      return res.json({
        mode: "soal",
        draft: {
          jenjang,
          tingkatKelas,
          mataPelajaran,
          kategoriUjian: kategori === "MATERI" ? "UTS" : kategori,
          judul:
            cleanText(parsedDraft.judulPaket, 220) ||
            `${kategori === "UJIAN_AKHIR" ? "Ujian Akhir" : kategori} ${mataPelajaran} ${jenjangText} ${tingkatKelas}`,
          deskripsi: cleanText(parsedDraft.deskripsiPaket, 1000) || null,
          durasiMenit: 60,
          kkm: 75,
          butirSoal: normalizedButir.items,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Pembuatan draf AI gagal.";
      if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(msg)) {
        return res.status(502).json({
          error: "Kunci GEMINI_API_KEY tidak valid atau ditolak. Periksa pengaturan di Settings > Secrets.",
        });
      }
      if (/RESOURCE_EXHAUSTED|429/i.test(msg)) {
        return res.status(429).json({
          error: "Kuota permintaan AI sedang penuh. Tunggu beberapa saat lalu coba lagi.",
        });
      }
      console.error("Gagal menghasilkan draf AI Pustaka Pusat:", error);
      return res.status(502).json({ error: "Gagal menghasilkan draf AI. Silakan coba beberapa saat lagi." });
    }
  });

  // POST /api/master/pustaka-konten/clone-to-school/:schoolId
  router.post("/clone-to-school/:schoolId", async (req, res) => {
    try {
      const school = await prisma.sekolah.findUnique({
        where: { id: req.params.schoolId },
        select: { id: true, nama: true },
      });
      if (!school) return res.status(404).json({ error: "Tenant sekolah tidak ditemukan." });

      const rawJenjang = Array.isArray(req.body?.jenjangList) ? req.body.jenjangList : [];
      const jenjangList = rawJenjang
        .map((j: unknown) => normalizeMasterJenjang(j, "PAKET_C"))
        .filter((j: MasterJenjang | null): j is MasterJenjang => Boolean(j));
      const copyAll = req.body?.copyAll !== false && jenjangList.length === 0;

      const summary = await cloneMasterContentToSchool(prisma, {
        sekolahId: school.id,
        jenjangList: jenjangList.length > 0 ? jenjangList : undefined,
        copyAll,
      });

      return res.json({
        success: true,
        sekolah: school,
        summary,
        message: `Konten pusat disalin ke ${school.nama}: ${summary.copiedModul} modul dan ${summary.copiedBankSoal} paket soal (${summary.copiedSoalCount} butir soal).`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Gagal menyalin Pustaka Konten Pusat ke sekolah tujuan.");
    }
  });

  return router;
}

export function schoolMasterContentRoutes(getSchoolSession: SchoolContextResolver) {
  const router = Router();

  // GET /api/school/master-content (also mounted at /api/sekolah/master-content)
  router.get("/master-content", async (req, res) => {
    try {
      const session = await getSchoolSession(req);
      if (!session?.sekolahId || session.peran === "SISWA") {
        return res.status(401).json({ error: "Akses hanya tersedia untuk Admin Sekolah dan Guru." });
      }
      const { sekolahId } = session;

      const rawJenjang = typeof req.query.jenjang === "string" ? req.query.jenjang.trim() : "";
      const jenjangFilter = rawJenjang ? normalizeMasterJenjang(rawJenjang, "PAKET_C") : null;

      const [moduls, bankSoal, kelasList, mapelList] = await Promise.all([
        prisma.masterModul.findMany({
          where: { aktif: true, visibility: "PUBLIC", ...(jenjangFilter ? { jenjang: jenjangFilter } : {}) },
          select: {
            id: true,
            jenjang: true,
            tingkatKelas: true,
            mataPelajaran: true,
            kategoriUjian: true,
            judul: true,
            deskripsi: true,
            jenis: true,
            fileUrl: true,
            visibility: true,
            updatedAt: true,
          },
          orderBy: [{ jenjang: "asc" }, { tingkatKelas: "asc" }, { mataPelajaran: "asc" }],
          take: 500,
        }),
        prisma.masterBankSoal.findMany({
          where: { aktif: true, ...(jenjangFilter ? { jenjang: jenjangFilter } : {}) },
          select: {
            id: true,
            jenjang: true,
            tingkatKelas: true,
            mataPelajaran: true,
            kategoriUjian: true,
            judul: true,
            deskripsi: true,
            durasiMenit: true,
            kkm: true,
            updatedAt: true,
            _count: { select: { butirSoal: true } },
          },
          orderBy: [{ jenjang: "asc" }, { tingkatKelas: "asc" }, { mataPelajaran: "asc" }],
          take: 500,
        }),
        prisma.kelas.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 300,
        }),
        prisma.mapel.findMany({
          where: { sekolahId },
          select: { id: true, nama: true },
          orderBy: { nama: "asc" },
          take: 300,
        }),
      ]);

      const mapelNames = new Set<string>();
      for (const m of moduls) mapelNames.add(m.mataPelajaran);
      for (const b of bankSoal) mapelNames.add(b.mataPelajaran);

      return res.json({
        modul: moduls,
        bankSoal,
        mataPelajaranList: [...mapelNames].sort((a, b) => a.localeCompare(b, "id-ID")),
        kelasSekolah: kelasList,
        mapelSekolah: mapelList,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Katalog Pustaka Konten Pusat belum dapat dimuat.");
    }
  });

  // POST /api/school/import-master-content (exact endpoint requested by user)
  router.post("/import-master-content", async (req, res) => {
    try {
      const session = await getSchoolSession(req);
      if (!session?.sekolahId || session.peran === "SISWA") {
        return res.status(401).json({ error: "Akses impor Pustaka Pusat hanya untuk Admin Sekolah dan Guru." });
      }

      const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {}) as Record<string, unknown>;

      const rawJenjang = Array.isArray(body.jenjangList)
        ? body.jenjangList
        : typeof body.jenjang === "string" && body.jenjang.trim()
          ? [body.jenjang]
          : [];
      const jenjangList = rawJenjang
        .map((j) => normalizeMasterJenjang(j, "PAKET_C"))
        .filter((j): j is MasterJenjang => Boolean(j));

      const rawKategori = Array.isArray(body.kategoriList)
        ? body.kategoriList
        : typeof body.kategori === "string" && body.kategori.trim()
          ? [body.kategori]
          : [];
      const kategoriList = rawKategori
        .map((k) => normalizeMasterKategori(k, "UTS"))
        .filter((k): k is MasterKategori => Boolean(k));

      const rawMapel = Array.isArray(body.mataPelajaranList)
        ? body.mataPelajaranList
        : typeof body.mataPelajaran === "string" && body.mataPelajaran.trim()
          ? [body.mataPelajaran]
          : [];
      const mataPelajaranList = rawMapel
        .map((m) => cleanText(m, 120))
        .filter(Boolean);

      const modulIds = Array.isArray(body.modulIds)
        ? body.modulIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 200)
        : undefined;
      const bankSoalIds = Array.isArray(body.bankSoalIds)
        ? body.bankSoalIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 150)
        : undefined;

      const targetKelasId = typeof body.targetKelasId === "string" && body.targetKelasId.trim() ? body.targetKelasId.trim() : null;
      const targetMapelId = typeof body.targetMapelId === "string" && body.targetMapelId.trim() ? body.targetMapelId.trim() : null;
      const copyAll = body.copyAll === true;

      if (
        !copyAll &&
        jenjangList.length === 0 &&
        kategoriList.length === 0 &&
        mataPelajaranList.length === 0 &&
        (!modulIds || modulIds.length === 0) &&
        (!bankSoalIds || bankSoalIds.length === 0)
      ) {
        return res.status(400).json({
          error: "Pilih minimal satu jenjang, kategori, modul, atau paket soal yang ingin disalin.",
        });
      }

      const summary = await cloneMasterContentToSchool(prisma, {
        sekolahId: session.sekolahId,
        guruId: session.guruId ?? null,
        jenjangList: jenjangList.length > 0 ? jenjangList : undefined,
        mataPelajaranList: mataPelajaranList.length > 0 ? mataPelajaranList : undefined,
        kategoriList: kategoriList.length > 0 ? kategoriList : undefined,
        modulIds,
        bankSoalIds,
        targetKelasId,
        targetMapelId,
        copyAll,
      });

      const parts: string[] = [];
      if (summary.copiedModul > 0) parts.push(`${summary.copiedModul} modul ajar`);
      if (summary.copiedBankSoal > 0) parts.push(`${summary.copiedBankSoal} paket soal (${summary.copiedSoalCount} butir soal)`);

      const message =
        parts.length > 0
          ? `Berhasil menyalin ${parts.join(" dan ")} dari Pustaka Pusat ke sekolah Anda.`
          : summary.skippedModul > 0 || summary.skippedBankSoal > 0
            ? "Seluruh konten terpilih sudah pernah disalin sebelumnya (tidak ada duplikat baru)."
            : "Tidak ada konten pusat yang cocok dengan filter pilihan Anda.";

      return res.json({
        success: true,
        summary,
        message,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Gagal menyalin konten dari Pustaka Pusat.");
    }
  });

  return router;
}

export function moduleBulkImportRoutes(
  requireMaster: MasterSessionChecker,
  getSchoolSession: SchoolContextResolver,
) {
  const router = Router();

  // POST /api/modules/import-bulk
  // Lightweight metadata + URL-only bulk importer (Excel/CSV JSON array) up to 500 modules per request.
  router.post("/import-bulk", async (req, res) => {
    try {
      const [masterSession, schoolSession] = await Promise.all([
        requireMaster(req),
        getSchoolSession(req),
      ]);

      const isMaster = Boolean(masterSession);
      const isSchoolStaff = Boolean(schoolSession?.sekolahId && schoolSession.peran !== "SISWA");
      if (!isMaster && !isSchoolStaff) {
        return res.status(401).json({
          error: "Akses impor massal modul hanya tersedia untuk Master Admin, Admin Sekolah, atau Guru.",
        });
      }

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
        return res.status(400).json({ error: "Daftar modul (items) tidak boleh kosong." });
      }
      if (rawItems.length > 500) {
        return res.status(400).json({ error: "Maksimal 500 modul dapat diimpor dalam satu kali proses." });
      }

      const requestedVisibility = normalizeModuleVisibility(
        bodyObj.visibility,
        isMaster ? "PUBLIC" : "PUBLIC",
      );
      const targetKelasId =
        typeof bodyObj.targetKelasId === "string" && bodyObj.targetKelasId.trim()
          ? bodyObj.targetKelasId.trim()
          : null;
      const cloneToSchool = bodyObj.cloneToSchool === true;

      const parsedResults = rawItems.map((row) => parseMasterModulInput(row, requestedVisibility));
      const validModuls: ParsedMasterModul[] = [];
      const errors: string[] = [];

      parsedResults.forEach((result, idx) => {
        if ("data" in result) {
          validModuls.push({
            ...result.data,
            // Enforce lightweight metadata + URL only; never keep bulky content if not provided
            visibility: result.data.visibility,
          });
        } else {
          errors.push(`Baris #${idx + 1}: ${result.error}`);
        }
      });

      if (validModuls.length === 0) {
        return res.status(400).json({
          error: errors[0] || "Tidak ada baris modul yang valid untuk diimpor.",
          errors: errors.slice(0, 20),
        });
      }

      const createdIds: string[] = [];
      if (isMaster || requestedVisibility === "PUBLIC") {
        // Save lightweight metadata + fileUrl to MasterModul library
        const createdRows = await prisma.$transaction(
          validModuls.map((item) =>
            prisma.masterModul.create({
              data: {
                jenjang: item.jenjang,
                tingkatKelas: item.tingkatKelas,
                mataPelajaran: item.mataPelajaran,
                kategoriUjian: item.kategoriUjian,
                judul: item.judul,
                deskripsi: item.deskripsi,
                konten: item.konten,
                fileUrl: item.fileUrl,
                jenis: item.jenis,
                visibility: item.visibility,
                aktif: item.aktif,
              },
              select: { id: true },
            }),
          ),
        );
        for (const r of createdRows) createdIds.push(r.id);
      }

      let clonedToClassCount = 0;
      if (isSchoolStaff && schoolSession?.sekolahId && (cloneToSchool || (!isMaster && requestedVisibility === "PRIVATE"))) {
        if (createdIds.length > 0) {
          const summary = await cloneMasterContentToSchool(prisma, {
            sekolahId: schoolSession.sekolahId,
            guruId: schoolSession.guruId ?? null,
            modulIds: createdIds,
            bankSoalIds: [],
            targetKelasId,
          });
          clonedToClassCount = summary.copiedModul;
        } else {
          // Direct lightweight school-only import (metadata + fileUrl only, zero binary storage)
          const tempCreated = await prisma.$transaction(
            validModuls.map((item) =>
              prisma.masterModul.create({
                data: {
                  ...item,
                  visibility: "PRIVATE",
                  aktif: false,
                },
                select: { id: true },
              }),
            ),
          );
          const summary = await cloneMasterContentToSchool(prisma, {
            sekolahId: schoolSession.sekolahId,
            guruId: schoolSession.guruId ?? null,
            modulIds: tempCreated.map((r) => r.id),
            bankSoalIds: [],
            targetKelasId,
            includePrivateModuls: true,
          });
          clonedToClassCount = summary.copiedModul;
        }
      }

      const summarySuffix =
        clonedToClassCount > 0 ? ` dan ${clonedToClassCount} modul langsung disalin ke kelas` : "";

      return res.status(201).json({
        imported: validModuls.length,
        clonedToClassCount,
        visibility: requestedVisibility,
        errors: errors.slice(0, 20),
        message: `${validModuls.length} daftar modul berhasil diimpor (berbasis tautan/metadata ringan)${summarySuffix}.`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Impor massal daftar modul gagal.");
    }
  });

  // POST /api/modules/:id/clone-to-class
  // Duplicates only lightweight metadata + file_url from public library into a school class.
  router.post("/:id/clone-to-class", async (req, res) => {
    try {
      const session = await getSchoolSession(req);
      if (!session?.sekolahId || session.peran === "SISWA") {
        return res.status(401).json({ error: "Akses hanya tersedia untuk Admin Sekolah dan Guru." });
      }
      const modulId = cleanText(req.params.id, 100);
      const targetKelasId =
        typeof req.body?.targetKelasId === "string" && req.body.targetKelasId.trim()
          ? req.body.targetKelasId.trim()
          : typeof req.body?.kelasId === "string" && req.body.kelasId.trim()
            ? req.body.kelasId.trim()
            : null;
      if (!modulId) return res.status(400).json({ error: "ID modul tidak valid." });

      const modul = await prisma.masterModul.findFirst({
        where: { id: modulId, aktif: true, visibility: "PUBLIC" },
        select: { id: true, judul: true },
      });
      if (!modul) {
        return res.status(404).json({ error: "Modul tidak ditemukan atau tidak tersedia untuk publik." });
      }

      const summary = await cloneMasterContentToSchool(prisma, {
        sekolahId: session.sekolahId,
        guruId: session.guruId ?? null,
        modulIds: [modul.id],
        bankSoalIds: [],
        targetKelasId,
      });

      return res.status(201).json({
        success: true,
        summary,
        message:
          summary.copiedModul > 0
            ? `Modul "${modul.judul}" berhasil disalin ke kelas (berbasis URL & metadata ringan).`
            : `Modul "${modul.judul}" sudah tersedia pada kelas tujuan.`,
      });
    } catch (error) {
      return handleMasterSchemaError(error, res, "Gagal menyalin modul ke kelas.");
    }
  });

  return router;
}
