CREATE TYPE "StatusPendaftaranSekolah" AS ENUM ('MENUNGGU', 'DISETUJUI', 'DITOLAK');

CREATE TABLE "PendaftaranSekolah" (
    "id" TEXT NOT NULL,
    "namaSekolah" TEXT NOT NULL,
    "npsn" TEXT,
    "namaKontak" TEXT NOT NULL,
    "emailKontak" TEXT NOT NULL,
    "teleponKontak" TEXT NOT NULL,
    "status" "StatusPendaftaranSekolah" NOT NULL DEFAULT 'MENUNGGU',
    "catatanTinjauan" TEXT,
    "dibuatPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ditinjauPada" TIMESTAMP(3),
    "ditinjauOlehId" TEXT,
    CONSTRAINT "PendaftaranSekolah_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PendaftaranSekolah_status_dibuatPada_idx" ON "PendaftaranSekolah"("status", "dibuatPada");
ALTER TABLE "PendaftaranSekolah" ADD CONSTRAINT "PendaftaranSekolah_ditinjauOlehId_fkey"
    FOREIGN KEY ("ditinjauOlehId") REFERENCES "Akun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
