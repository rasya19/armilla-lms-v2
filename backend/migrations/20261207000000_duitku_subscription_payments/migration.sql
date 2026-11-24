CREATE TABLE IF NOT EXISTS "PembayaranLangganan" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "merchantOrderId" TEXT NOT NULL,
    "reference" TEXT,
    "publisherOrderId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'DUITKU',
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "plan" TEXT NOT NULL,
    "planLabel" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 365,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT,
    "paymentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultCode" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "returnUrl" TEXT,
    "callbackUrl" TEXT,
    "settlementDate" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "callbackPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PembayaranLangganan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PembayaranLangganan_merchantOrderId_key" ON "PembayaranLangganan"("merchantOrderId");
CREATE INDEX IF NOT EXISTS "PembayaranLangganan_sekolahId_createdAt_idx" ON "PembayaranLangganan"("sekolahId", "createdAt");
CREATE INDEX IF NOT EXISTS "PembayaranLangganan_status_createdAt_idx" ON "PembayaranLangganan"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PembayaranLangganan_reference_idx" ON "PembayaranLangganan"("reference");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PembayaranLangganan_sekolahId_fkey'
    ) THEN
        ALTER TABLE "PembayaranLangganan"
            ADD CONSTRAINT "PembayaranLangganan_sekolahId_fkey"
            FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
