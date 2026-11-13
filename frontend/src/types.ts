export type StudentStatus = 'Aktif' | 'Alumni' | 'Pindah' | 'Menunggu' | 'Diterima' | 'Ditolak';
export type Gender = 'L' | 'P';

export interface SiswaSchema {
  id: string;
  // Tab Pribadi
  namaLengkap: string;
  nik: string;
  nisn: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: Gender;
  
  // Tab Akademik
  statusAkademik: StudentStatus;
  kelas: string;
  tanggalMasuk: string;
  jalurPendaftaran: string;
  nomorRegistrasi?: string; // Khusus PPDB
  
  // Tab Wali
  namaAyah: string;
  namaIbu: string;
  alamatLengkap: string;
  nomorHp: string;
}

// Legacy types to fix existing components
export interface Siswa {
  id: string;
  nisn: string;
  nama: string;
  kelasId: string;
  email: string;
  telepon: string;
  status: "Aktif" | "Alumni" | "Cuti" | "Keluar";
  jenjang?: "Paket A" | "Paket B" | "Paket C";
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

export interface DokumenPPDB {
  ktp?: string;
  kk?: string;
  ijazah?: string;
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
  dokumen?: DokumenPPDB;
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

export interface MaterialItem {
  id: string;
  judul: string;
  deskripsi: string;
  kelasId: string;
  mapelId: string;
  fileType: 'pdf' | 'video' | 'link' | 'zip';
  fileUrl: string;
  fileSize?: string;
  createdAt: string;
}

export interface WebsiteSettings {
  school_id: string;
  primary_color: string;
  logo_url: string;
  hero_title: string;
  hero_subtitle: string;
  show_gallery: boolean;
  show_news: boolean;
  footer_text: string;
  updated_at: string;
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
