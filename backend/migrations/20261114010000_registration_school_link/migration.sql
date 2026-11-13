ALTER TABLE "PendaftaranSekolah" ADD COLUMN "sekolahId" TEXT;
CREATE UNIQUE INDEX "PendaftaranSekolah_sekolahId_key" ON "PendaftaranSekolah"("sekolahId");
ALTER TABLE "PendaftaranSekolah" ADD CONSTRAINT "PendaftaranSekolah_sekolahId_fkey"
  FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;
