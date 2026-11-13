export interface Siswa {
  id: string;
  nisn: string;
  nama: string;
  kelasId: string;
  email: string;
  telepon: string;
  status: "Aktif" | "Alumni" | "Cuti";
}

export interface Guru {
  id: string;
  nuptk: string;
  nama: string;
  mapelUtama: string;
  email: string;
  telepon: string;
  status: "Aktif" | "Nonaktif";
}

export interface Mapel {
  id: string;
  kode: string;
  nama: string;
  kkm: number;
}

export interface Kelas {
  id: string;
  kode: string;
  nama: string;
  waliGuruId: string;
}

export interface PPDB {
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

export interface Nilai {
  id: string;
  siswaId: string;
  mapelId: string;
  nilaiMandiri: number;
  nilaiSimulasi: number;
  nilaiAkhir: number;
  tanggalSimulasi: string;
}

export interface DashboardStats {
  totalSiswa: number;
  totalGuru: number;
  totalKelas: number;
  totalPPDB: number;
  totalNilai: number;
  averageNilaiAkhir: number;
  unbkHigh: number;
  unbkLow: number;
  ppdbStatus: {
    pending: number;
    diterima: number;
    ditolak: number;
  };
  recentActivities: Array<{
    message: string;
    time: string;
  }>;
}
