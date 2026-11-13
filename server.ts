import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface Siswa {
  id: string;
  nisn: string;
  nama: string;
  kelasId: string;
  email: string;
  telepon: string;
  status: "Aktif" | "Alumni" | "Cuti";
}

interface Guru {
  id: string;
  nuptk: string;
  nama: string;
  mapelUtama: string;
  email: string;
  telepon: string;
  status: "Aktif" | "Nonaktif";
}

interface Mapel {
  id: string;
  kode: string;
  nama: string;
  kkm: number;
}

interface Kelas {
  id: string;
  kode: string;
  nama: string;
  waliGuruId: string;
}

interface PPDB {
  id: string;
  noDaftar: string;
  nama: string;
  email: string;
  telepon: string;
  alamat: string;
  jenjang: "Paket A" | "Paket B" | "Paket C";
  status: "Pending" | "Diterima" | "Ditolak";
  tanggalDaftar: string;
}

interface Nilai {
  id: string;
  siswaId: string;
  mapelId: string;
  nilaiMandiri: number;
  nilaiSimulasi: number;
  nilaiAkhir: number;
  tanggalSimulasi: string;
}

interface Tabungan {
  id: string;
  siswaId: string;
  tanggal: string;
  jumlah: number;
  status: "Pending" | "Valid";
  tenantId: string;
}

interface DB {
  siswa: Siswa[];
  guru: Guru[];
  mapel: Mapel[];
  kelas: Kelas[];
  ppdb: PPDB[];
  nilai: Nilai[];
  tabungan: Tabungan[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Initial data
const INITIAL_DB: DB = {
  siswa: [
    { id: "s1", nisn: "0052348512", nama: "Budi Santoso", kelasId: "k3", email: "budi.santoso@gmail.com", telepon: "081234567890", status: "Aktif" },
    { id: "s2", nisn: "0048375122", nama: "Siti Rahma", kelasId: "k2", email: "siti.rahma@yahoo.com", telepon: "081398765432", status: "Aktif" },
    { id: "s3", nisn: "0068312543", nama: "Ahmad Fauzi", kelasId: "k1", email: "ahmad.fauzi@gmail.com", telepon: "085712345678", status: "Aktif" },
    { id: "s4", nisn: "0057412355", nama: "Dewi Lestari", kelasId: "k1", email: "dewi.lestari@gmail.com", telepon: "081299998888", status: "Aktif" },
    { id: "s5", nisn: "0049213567", nama: "Rian Hidayat", kelasId: "k3", email: "rian.hidayat@gmail.com", telepon: "089677776666", status: "Aktif" },
    { id: "s6", nisn: "0031254388", nama: "Lani Wijaya", kelasId: "k2", email: "lani.wijaya@outlook.com", telepon: "082155554444", status: "Aktif" }
  ],
  guru: [
    { id: "g1", nuptk: "1029384756", nama: "Drs. Hermawan", mapelUtama: "m2", email: "hermawan@gmail.com", telepon: "081222223333", status: "Aktif" },
    { id: "g2", nuptk: "5647382910", nama: "Sri Wahyuni, S.Pd.", mapelUtama: "m1", email: "sri.wahyuni@gmail.com", telepon: "081344445555", status: "Aktif" },
    { id: "g3", nuptk: "9812763450", nama: "Joko Susilo, M.Pd.", mapelUtama: "m4", email: "joko.susilo@gmail.com", telepon: "085677778888", status: "Aktif" },
    { id: "g4", nuptk: "3456781290", nama: "Linda Kartika, S.S.", mapelUtama: "m3", email: "linda.kartika@gmail.com", telepon: "089800001111", status: "Aktif" }
  ],
  mapel: [
    { id: "m1", kode: "MTK", nama: "Matematika", kkm: 70 },
    { id: "m2", kode: "BIN", nama: "Bahasa Indonesia", kkm: 75 },
    { id: "m3", kode: "BIG", nama: "Bahasa Inggris", kkm: 70 },
    { id: "m4", kode: "IPA", nama: "Sains / IPA", kkm: 65 }
  ],
  kelas: [
    { id: "k1", kode: "PKB-IX", nama: "Paket B - Kelas IX", waliGuruId: "g3" },
    { id: "k2", kode: "PKC-XII", nama: "Paket C - Kelas XII", waliGuruId: "g2" },
    { id: "k3", kode: "PKC-XI", nama: "Paket C - Kelas XI", waliGuruId: "g1" }
  ],
  ppdb: [
    { id: "p1", noDaftar: "PPDB-2026-001", nama: "Hendra Wijaya", email: "hendra.wij@gmail.com", telepon: "081211112222", alamat: "Jl. Diponegoro No. 12, Bandung", jenjang: "Paket C", status: "Pending", tanggalDaftar: "2026-07-10" },
    { id: "p2", noDaftar: "PPDB-2026-002", nama: "Mutia Sari", email: "mutia.sari@gmail.com", telepon: "085233334444", alamat: "Jl. Merdeka No. 45, Bandung", jenjang: "Paket C", status: "Diterima", tanggalDaftar: "2026-07-11" },
    { id: "p3", noDaftar: "PPDB-2026-003", nama: "Adi Pratama", email: "adi.pratama@gmail.com", telepon: "081366667777", alamat: "Jl. Sukajadi No. 90, Bandung", jenjang: "Paket B", status: "Ditolak", tanggalDaftar: "2026-07-12" }
  ],
  nilai: [
    // Budi Santoso (s1)
    { id: "n1", siswaId: "s1", mapelId: "m1", nilaiMandiri: 78, nilaiSimulasi: 74, nilaiAkhir: 76, tanggalSimulasi: "2026-06-15" },
    { id: "n2", siswaId: "s1", mapelId: "m2", nilaiMandiri: 85, nilaiSimulasi: 80, nilaiAkhir: 82.5, tanggalSimulasi: "2026-06-16" },
    { id: "n3", siswaId: "s1", mapelId: "m3", nilaiMandiri: 70, nilaiSimulasi: 76, nilaiAkhir: 73, tanggalSimulasi: "2026-06-17" },
    { id: "n4", siswaId: "s1", mapelId: "m4", nilaiMandiri: 82, nilaiSimulasi: 80, nilaiAkhir: 81, tanggalSimulasi: "2026-06-18" },
    
    // Siti Rahma (s2)
    { id: "n5", siswaId: "s2", mapelId: "m1", nilaiMandiri: 88, nilaiSimulasi: 85, nilaiAkhir: 86.5, tanggalSimulasi: "2026-06-15" },
    { id: "n6", siswaId: "s2", mapelId: "m2", nilaiMandiri: 90, nilaiSimulasi: 92, nilaiAkhir: 91, tanggalSimulasi: "2026-06-16" },
    { id: "n7", siswaId: "s2", mapelId: "m3", nilaiMandiri: 84, nilaiSimulasi: 80, nilaiAkhir: 82, tanggalSimulasi: "2026-06-17" },
    { id: "n8", siswaId: "s2", mapelId: "m4", nilaiMandiri: 85, nilaiSimulasi: 88, nilaiAkhir: 86.5, tanggalSimulasi: "2026-06-18" },

    // Ahmad Fauzi (s3)
    { id: "n9", siswaId: "s3", mapelId: "m1", nilaiMandiri: 65, nilaiSimulasi: 60, nilaiAkhir: 62.5, tanggalSimulasi: "2026-06-15" },
    { id: "n10", siswaId: "s3", mapelId: "m2", nilaiMandiri: 72, nilaiSimulasi: 68, nilaiAkhir: 70, tanggalSimulasi: "2026-06-16" },
    { id: "n11", siswaId: "s3", mapelId: "m3", nilaiMandiri: 68, nilaiSimulasi: 70, nilaiAkhir: 69, tanggalSimulasi: "2026-06-17" },
    { id: "n12", siswaId: "s3", mapelId: "m4", nilaiMandiri: 75, nilaiSimulasi: 70, nilaiAkhir: 72.5, tanggalSimulasi: "2026-06-18" }
  ],
  tabungan: [
    { id: "t1", siswaId: "s1", tanggal: "2026-07-10", jumlah: 50000, status: "Pending", tenantId: "tenant_armilla" },
    { id: "t2", siswaId: "s2", tanggal: "2026-07-11", jumlah: 100000, status: "Pending", tenantId: "tenant_armilla" },
    { id: "t3", siswaId: "s3", tanggal: "2026-07-12", jumlah: 25000, status: "Pending", tenantId: "tenant_armilla" },
    { id: "t4", siswaId: "s4", tanggal: "2026-07-12", jumlah: 75000, status: "Pending", tenantId: "tenant_armilla" },
    { id: "t5", siswaId: "s5", tanggal: "2026-07-13", jumlah: 150000, status: "Valid", tenantId: "tenant_armilla" }
  ]
};

// Ensure data folder and file exists
function initializeDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2), "utf-8");
  }
}

function getDB(): DB {
  initializeDB();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveDB(db: DB) {
  initializeDB();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON parsing and CORS simulation
  app.use(express.json());
  
  // Custom CORS implementation helper
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Length, X-Requested-With");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // API - DASHBOARD
  app.get("/api/dashboard", (req, res) => {
    try {
      const db = getDB();
      const stats = {
        totalSiswa: db.siswa.length,
        totalGuru: db.guru.length,
        totalKelas: db.kelas.length,
        totalPPDB: db.ppdb.length,
        totalNilai: db.nilai.length,
        averageNilaiAkhir: db.nilai.length > 0 
          ? Number((db.nilai.reduce((acc, curr) => acc + curr.nilaiAkhir, 0) / db.nilai.length).toFixed(1))
          : 0,
        unbkHigh: db.nilai.length > 0 
          ? Math.max(...db.nilai.map(n => n.nilaiSimulasi))
          : 0,
        unbkLow: db.nilai.length > 0 
          ? Math.min(...db.nilai.map(n => n.nilaiSimulasi))
          : 0,
        ppdbStatus: {
          pending: db.ppdb.filter(p => p.status === "Pending").length,
          diterima: db.ppdb.filter(p => p.status === "Diterima").length,
          ditolak: db.ppdb.filter(p => p.status === "Ditolak").length,
        },
        recentActivities: [
          { message: "Penambahan nilai simulasi UNBK untuk Budi Santoso", time: "1 jam yang lalu" },
          { message: "PPDB pendaftar baru: Hendra Wijaya terdaftar", time: "2 hari yang lalu" },
          { message: "Guru baru ditambahkan: Linda Kartika, S.S.", time: "3 hari yang lalu" }
        ]
      };
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API - SISWA (CRUD)
  app.get("/api/siswa", (req, res) => {
    const db = getDB();
    res.json(db.siswa);
  });

  app.post("/api/siswa", (req, res) => {
    const db = getDB();
    const newSiswa: Siswa = {
      id: "s" + Date.now(),
      nisn: req.body.nisn || "",
      nama: req.body.nama || "",
      kelasId: req.body.kelasId || "",
      email: req.body.email || "",
      telepon: req.body.telepon || "",
      status: req.body.status || "Aktif"
    };
    db.siswa.push(newSiswa);
    saveDB(db);
    res.status(201).json(newSiswa);
  });

  app.put("/api/siswa/:id", (req, res) => {
    const db = getDB();
    const index = db.siswa.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Siswa tidak ditemukan" });
    
    db.siswa[index] = {
      ...db.siswa[index],
      nisn: req.body.nisn ?? db.siswa[index].nisn,
      nama: req.body.nama ?? db.siswa[index].nama,
      kelasId: req.body.kelasId ?? db.siswa[index].kelasId,
      email: req.body.email ?? db.siswa[index].email,
      telepon: req.body.telepon ?? db.siswa[index].telepon,
      status: req.body.status ?? db.siswa[index].status,
    };
    saveDB(db);
    res.json(db.siswa[index]);
  });

  app.delete("/api/siswa/:id", (req, res) => {
    const db = getDB();
    const filtered = db.siswa.filter(s => s.id !== req.params.id);
    if (filtered.length === db.siswa.length) return res.status(404).json({ error: "Siswa tidak ditemukan" });
    // Also clear associated scores
    db.nilai = db.nilai.filter(n => n.siswaId !== req.params.id);
    db.siswa = filtered;
    saveDB(db);
    res.json({ message: "Siswa berhasil dihapus" });
  });

  // API - GURU (CRUD)
  app.get("/api/guru", (req, res) => {
    res.json(getDB().guru);
  });

  app.post("/api/guru", (req, res) => {
    const db = getDB();
    const newGuru: Guru = {
      id: "g" + Date.now(),
      nuptk: req.body.nuptk || "",
      nama: req.body.nama || "",
      mapelUtama: req.body.mapelUtama || "",
      email: req.body.email || "",
      telepon: req.body.telepon || "",
      status: req.body.status || "Aktif"
    };
    db.guru.push(newGuru);
    saveDB(db);
    res.status(201).json(newGuru);
  });

  app.put("/api/guru/:id", (req, res) => {
    const db = getDB();
    const index = db.guru.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Guru tidak ditemukan" });
    
    db.guru[index] = {
      ...db.guru[index],
      nuptk: req.body.nuptk ?? db.guru[index].nuptk,
      nama: req.body.nama ?? db.guru[index].nama,
      mapelUtama: req.body.mapelUtama ?? db.guru[index].mapelUtama,
      email: req.body.email ?? db.guru[index].email,
      telepon: req.body.telepon ?? db.guru[index].telepon,
      status: req.body.status ?? db.guru[index].status,
    };
    saveDB(db);
    res.json(db.guru[index]);
  });

  app.delete("/api/guru/:id", (req, res) => {
    const db = getDB();
    const filtered = db.guru.filter(g => g.id !== req.params.id);
    if (filtered.length === db.guru.length) return res.status(404).json({ error: "Guru tidak ditemukan" });
    db.guru = filtered;
    saveDB(db);
    res.json({ message: "Guru berhasil dihapus" });
  });

  // API - MAPEL (CRUD)
  app.get("/api/mapel", (req, res) => {
    res.json(getDB().mapel);
  });

  app.post("/api/mapel", (req, res) => {
    const db = getDB();
    const newMapel: Mapel = {
      id: "m" + Date.now(),
      kode: req.body.kode || "",
      nama: req.body.nama || "",
      kkm: Number(req.body.kkm) || 70
    };
    db.mapel.push(newMapel);
    saveDB(db);
    res.status(201).json(newMapel);
  });

  app.put("/api/mapel/:id", (req, res) => {
    const db = getDB();
    const index = db.mapel.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Mata pelajaran tidak ditemukan" });
    
    db.mapel[index] = {
      ...db.mapel[index],
      kode: req.body.kode ?? db.mapel[index].kode,
      nama: req.body.nama ?? db.mapel[index].nama,
      kkm: req.body.kkm != null ? Number(req.body.kkm) : db.mapel[index].kkm,
    };
    saveDB(db);
    res.json(db.mapel[index]);
  });

  app.delete("/api/mapel/:id", (req, res) => {
    const db = getDB();
    const filtered = db.mapel.filter(m => m.id !== req.params.id);
    if (filtered.length === db.mapel.length) return res.status(404).json({ error: "Mata pelajaran tidak ditemukan" });
    // Also remove scores for this mapel
    db.nilai = db.nilai.filter(n => n.mapelId !== req.params.id);
    db.mapel = filtered;
    saveDB(db);
    res.json({ message: "Mata pelajaran berhasil dihapus" });
  });

  // API - KELAS (CRUD)
  app.get("/api/kelas", (req, res) => {
    res.json(getDB().kelas);
  });

  app.post("/api/kelas", (req, res) => {
    const db = getDB();
    const newKelas: Kelas = {
      id: "k" + Date.now(),
      kode: req.body.kode || "",
      nama: req.body.nama || "",
      waliGuruId: req.body.waliGuruId || ""
    };
    db.kelas.push(newKelas);
    saveDB(db);
    res.status(201).json(newKelas);
  });

  app.put("/api/kelas/:id", (req, res) => {
    const db = getDB();
    const index = db.kelas.findIndex(k => k.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Kelas tidak ditemukan" });
    
    db.kelas[index] = {
      ...db.kelas[index],
      kode: req.body.kode ?? db.kelas[index].kode,
      nama: req.body.nama ?? db.kelas[index].nama,
      waliGuruId: req.body.waliGuruId ?? db.kelas[index].waliGuruId,
    };
    saveDB(db);
    res.json(db.kelas[index]);
  });

  app.delete("/api/kelas/:id", (req, res) => {
    const db = getDB();
    const filtered = db.kelas.filter(k => k.id !== req.params.id);
    if (filtered.length === db.kelas.length) return res.status(404).json({ error: "Kelas tidak ditemukan" });
    db.kelas = filtered;
    saveDB(db);
    res.json({ message: "Kelas berhasil dihapus" });
  });

  // API - PPDB (CRUD)
  app.get("/api/ppdb", (req, res) => {
    res.json(getDB().ppdb);
  });

  app.post("/api/ppdb", (req, res) => {
    const db = getDB();
    const lastId = db.ppdb.length;
    const padding = String(lastId + 1).padStart(3, "0");
    const newPPDB: PPDB = {
      id: "p" + Date.now(),
      noDaftar: `PPDB-2026-${padding}`,
      nama: req.body.nama || "",
      email: req.body.email || "",
      telepon: req.body.telepon || "",
      alamat: req.body.alamat || "",
      jenjang: req.body.jenjang || "Paket C",
      status: req.body.status || "Pending",
      tanggalDaftar: new Date().toISOString().split("T")[0]
    };
    db.ppdb.push(newPPDB);
    saveDB(db);
    res.status(201).json(newPPDB);
  });

  app.put("/api/ppdb/:id", (req, res) => {
    const db = getDB();
    const index = db.ppdb.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Pendaftar tidak ditemukan" });
    
    db.ppdb[index] = {
      ...db.ppdb[index],
      nama: req.body.nama ?? db.ppdb[index].nama,
      email: req.body.email ?? db.ppdb[index].email,
      telepon: req.body.telepon ?? db.ppdb[index].telepon,
      alamat: req.body.alamat ?? db.ppdb[index].alamat,
      jenjang: req.body.jenjang ?? db.ppdb[index].jenjang,
      status: req.body.status ?? db.ppdb[index].status,
    };
    saveDB(db);
    res.json(db.ppdb[index]);
  });

  app.delete("/api/ppdb/:id", (req, res) => {
    const db = getDB();
    const filtered = db.ppdb.filter(p => p.id !== req.params.id);
    if (filtered.length === db.ppdb.length) return res.status(404).json({ error: "Pendaftar tidak ditemukan" });
    db.ppdb = filtered;
    saveDB(db);
    res.json({ message: "Pendaftar berhasil dihapus" });
  });

  // API - NILAI SIMULASI UNBK (CRUD + IMPORT & EXPORT)
  app.get("/api/nilai", (req, res) => {
    res.json(getDB().nilai);
  });

  // API - KEUANGAN / TABUNGAN
  app.get("/api/keuangan/tabungan/pending", (req, res) => {
    try {
      const db = getDB();
      // Simulasi filter by tenantId from header
      const tenantId = req.headers['x-tenant-id'] || "tenant_armilla";
      
      const pendingTabungan = db.tabungan
        .filter(t => t.status === "Pending" && t.tenantId === tenantId)
        .map(t => {
          const siswa = db.siswa.find(s => s.id === t.siswaId);
          return {
            ...t,
            siswaNama: siswa?.nama || "Unknown",
            siswaNisn: siswa?.nisn || "-"
          };
        });
      
      res.json({ data: pendingTabungan });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/keuangan/tabungan/validasi-massal", (req, res) => {
    try {
      // Dalam implementasi nyata, di sini dicek JWT Role (Bendahara/SuperAdmin)
      const { tabunganIds } = req.body;
      const tenantId = req.headers['x-tenant-id'] || "tenant_armilla";

      if (!Array.isArray(tabunganIds) || tabunganIds.length === 0) {
        return res.status(400).json({ error: "tabunganIds harus berupa array yang tidak kosong." });
      }

      const db = getDB();
      let updatedCount = 0;

      db.tabungan = db.tabungan.map(t => {
        if (tabunganIds.includes(t.id) && t.tenantId === tenantId && t.status === "Pending") {
          updatedCount++;
          return { ...t, status: "Valid" };
        }
        return t;
      });

      saveDB(db);
      res.json({ message: `${updatedCount} data tabungan berhasil divalidasi.`, updatedCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/nilai", (req, res) => {
    const db = getDB();
    const mandiri = Number(req.body.nilaiMandiri) || 0;
    const simulasi = Number(req.body.nilaiSimulasi) || 0;
    const newNilai: Nilai = {
      id: "n" + Date.now(),
      siswaId: req.body.siswaId || "",
      mapelId: req.body.mapelId || "",
      nilaiMandiri: mandiri,
      nilaiSimulasi: simulasi,
      nilaiAkhir: Number(((mandiri + simulasi) / 2).toFixed(1)),
      tanggalSimulasi: req.body.tanggalSimulasi || new Date().toISOString().split("T")[0]
    };
    db.nilai.push(newNilai);
    saveDB(db);
    res.status(201).json(newNilai);
  });

  app.put("/api/nilai/:id", (req, res) => {
    const db = getDB();
    const index = db.nilai.findIndex(n => n.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Nilai tidak ditemukan" });
    
    const mandiri = req.body.nilaiMandiri != null ? Number(req.body.nilaiMandiri) : db.nilai[index].nilaiMandiri;
    const simulasi = req.body.nilaiSimulasi != null ? Number(req.body.nilaiSimulasi) : db.nilai[index].nilaiSimulasi;
    
    db.nilai[index] = {
      ...db.nilai[index],
      siswaId: req.body.siswaId ?? db.nilai[index].siswaId,
      mapelId: req.body.mapelId ?? db.nilai[index].mapelId,
      nilaiMandiri: mandiri,
      nilaiSimulasi: simulasi,
      nilaiAkhir: Number(((mandiri + simulasi) / 2).toFixed(1)),
      tanggalSimulasi: req.body.tanggalSimulasi ?? db.nilai[index].tanggalSimulasi
    };
    saveDB(db);
    res.json(db.nilai[index]);
  });

  app.delete("/api/nilai/:id", (req, res) => {
    const db = getDB();
    const filtered = db.nilai.filter(n => n.id !== req.params.id);
    if (filtered.length === db.nilai.length) return res.status(404).json({ error: "Nilai tidak ditemukan" });
    db.nilai = filtered;
    saveDB(db);
    res.json({ message: "Nilai berhasil dihapus" });
  });

  // Export UNBK scores as CSV
  app.get("/api/nilai/export", (req, res) => {
    try {
      const db = getDB();
      // Generate CSV string: NISN, Nama Siswa, Kode Mapel, Nama Mapel, Nilai Mandiri, Nilai Simulasi, Nilai Akhir, Tanggal
      const headers = ["NISN", "NamaSiswa", "KodeMapel", "NamaMapel", "NilaiMandiri", "NilaiSimulasi", "NilaiAkhir", "TanggalSimulasi"];
      const rows = db.nilai.map(n => {
        const siswa = db.siswa.find(s => s.id === n.siswaId);
        const mapel = db.mapel.find(m => m.id === n.mapelId);
        return [
          siswa?.nisn || "",
          siswa?.nama || "",
          mapel?.kode || "",
          mapel?.nama || "",
          n.nilaiMandiri,
          n.nilaiSimulasi,
          n.nilaiAkhir,
          n.tanggalSimulasi
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=rekap_nilai_simulasi_unbk.csv");
      res.status(200).send(csvContent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import UNBK scores (JSON Array upload representing records, or Parsed CSV)
  app.post("/api/nilai/import", (req, res) => {
    try {
      const { data } = req.body; // Expect array of: { nisn, kodeMapel, nilaiMandiri, nilaiSimulasi, tanggalSimulasi }
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Format data salah. Harus berupa list JSON." });
      }

      const db = getDB();
      const importedRecords: Nilai[] = [];
      const errors: string[] = [];

      data.forEach((row: any, i: number) => {
        const { nisn, kodeMapel, nilaiMandiri, nilaiSimulasi, tanggalSimulasi } = row;
        
        // Find siswa by NISN
        const siswa = db.siswa.find(s => s.nisn === String(nisn).trim());
        if (!siswa) {
          errors.push(`Baris ${i + 1}: Siswa dengan NISN ${nisn} tidak ditemukan.`);
          return;
        }

        // Find mapel by Kode Mapel
        const mapel = db.mapel.find(m => m.kode.toUpperCase() === String(kodeMapel).trim().toUpperCase());
        if (!mapel) {
          errors.push(`Baris ${i + 1}: Mata Pelajaran dengan Kode ${kodeMapel} tidak ditemukan.`);
          return;
        }

        const mandiri = Number(nilaiMandiri);
        const simulasi = Number(nilaiSimulasi);

        if (isNaN(mandiri) || mandiri < 0 || mandiri > 100) {
          errors.push(`Baris ${i + 1}: Nilai Mandiri (${nilaiMandiri}) harus angka 0-100.`);
          return;
        }
        if (isNaN(simulasi) || simulasi < 0 || simulasi > 100) {
          errors.push(`Baris ${i + 1}: Nilai Simulasi (${nilaiSimulasi}) harus angka 0-100.`);
          return;
        }

        // Check if matching record exists to update, otherwise insert new
        const existingIndex = db.nilai.findIndex(n => n.siswaId === siswa.id && n.mapelId === mapel.id);
        const recordId = existingIndex !== -1 ? db.nilai[existingIndex].id : "n" + (Date.now() + i);
        
        const record: Nilai = {
          id: recordId,
          siswaId: siswa.id,
          mapelId: mapel.id,
          nilaiMandiri: mandiri,
          nilaiSimulasi: simulasi,
          nilaiAkhir: Number(((mandiri + simulasi) / 2).toFixed(1)),
          tanggalSimulasi: tanggalSimulasi || new Date().toISOString().split("T")[0]
        };

        if (existingIndex !== -1) {
          db.nilai[existingIndex] = record;
        } else {
          db.nilai.push(record);
        }
        importedRecords.push(record);
      });

      saveDB(db);
      res.json({
        message: `Berhasil memproses data. ${importedRecords.length} nilai berhasil di-import/update.`,
        successCount: importedRecords.length,
        errors
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve Frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PKBM Armilla Server] Server is running on http://localhost:${PORT}`);
  });
}

startServer();
