-- ========================================================
-- Cloudflare D1 (SQLite) Schema & Seed for Wilayah
-- Kabupaten Kuningan, Jawa Barat (32 Kecamatan)
-- ========================================================

-- 1. Create table for Kabupaten / Kota
CREATE TABLE IF NOT EXISTS ref_kabupaten (
    id TEXT PRIMARY KEY,
    kode TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    provinsi TEXT NOT NULL DEFAULT 'Jawa Barat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create table for Kecamatan
CREATE TABLE IF NOT EXISTS ref_kecamatan (
    id TEXT PRIMARY KEY,
    kabupaten_id TEXT NOT NULL REFERENCES ref_kabupaten(id) ON DELETE CASCADE,
    kode TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seed Data Kabupaten Kuningan (Kode BPS 3208)
INSERT INTO ref_kabupaten (id, kode, nama, provinsi)
VALUES ('kab_3208', '3208', 'Kabupaten Kuningan', 'Jawa Barat')
ON CONFLICT(id) DO UPDATE SET nama = excluded.nama;

-- 4. Seed Data 32 Kecamatan di Kabupaten Kuningan
INSERT INTO ref_kecamatan (id, kabupaten_id, kode, nama) VALUES
('kec_320801', 'kab_3208', '320801', 'Kadugede'),
('kec_320802', 'kab_3208', '320802', 'Ciniru'),
('kec_320803', 'kab_3208', '320803', 'Subang'),
('kec_320804', 'kab_3208', '320804', 'Ciwaru'),
('kec_320805', 'kab_3208', '320805', 'Cibingbin'),
('kec_320806', 'kab_3208', '320806', 'Luragung'),
('kec_320807', 'kab_3208', '320807', 'Lebakwangi'),
('kec_320808', 'kab_3208', '320808', 'Garawangi'),
('kec_320809', 'kab_3208', '320809', 'Kuningan'),
('kec_320810', 'kab_3208', '320810', 'Ciawigebang'),
('kec_320811', 'kab_3208', '320811', 'Cidahu'),
('kec_320812', 'kab_3208', '320812', 'Jalaksana'),
('kec_320813', 'kab_3208', '320813', 'Cilimus'),
('kec_320814', 'kab_3208', '320814', 'Mandirancan'),
('kec_320815', 'kab_3208', '320815', 'Selajambe'),
('kec_320816', 'kab_3208', '320816', 'Kramatmulya'),
('kec_320817', 'kab_3208', '320817', 'Darma'),
('kec_320818', 'kab_3208', '320818', 'Cigugur'),
('kec_320819', 'kab_3208', '320819', 'Pasawahan'),
('kec_320820', 'kab_3208', '320820', 'Nusaherang'),
('kec_320821', 'kab_3208', '320821', 'Cipicung'),
('kec_320822', 'kab_3208', '320822', 'Pancalang'),
('kec_320823', 'kab_3208', '320823', 'Japara'),
('kec_320824', 'kab_3208', '320824', 'Cimahi'),
('kec_320825', 'kab_3208', '320825', 'Kalimanggis'),
('kec_320826', 'kab_3208', '320826', 'Cibeureum'),
('kec_320827', 'kab_3208', '320827', 'Karangkancana'),
('kec_320828', 'kab_3208', '320828', 'Maleber'),
('kec_320829', 'kab_3208', '320829', 'Sindangagung'),
('kec_320830', 'kab_3208', '320830', 'Cigandamekar'),
('kec_320831', 'kab_3208', '320831', 'Cilebak'),
('kec_320832', 'kab_3208', '320832', 'Hantara')
ON CONFLICT(id) DO UPDATE SET nama = excluded.nama;
