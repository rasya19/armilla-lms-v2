ALTER TABLE "Sekolah" ADD COLUMN "themeKey" TEXT NOT NULL DEFAULT 'ocean';
ALTER TABLE "Sekolah" ADD CONSTRAINT "Sekolah_themeKey_check" CHECK ("themeKey" IN ('ocean', 'emerald', 'sunset', 'dark'));
