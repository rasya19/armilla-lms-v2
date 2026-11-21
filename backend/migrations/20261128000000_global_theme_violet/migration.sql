CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "Sekolah" DROP CONSTRAINT IF EXISTS "Sekolah_themeKey_check";
ALTER TABLE "Sekolah" ADD CONSTRAINT "Sekolah_themeKey_check" CHECK ("themeKey" IN ('ocean', 'emerald', 'sunset', 'violet', 'dark'));
