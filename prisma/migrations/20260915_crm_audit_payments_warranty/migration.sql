-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REPORTED';

-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "payeeUserId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reportedPaidAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reportedById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifiedPaidAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;

-- AlterTable RFI
ALTER TABLE "RFI" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- AlterTable WarrantyTicket
ALTER TABLE "WarrantyTicket" ADD COLUMN IF NOT EXISTS "clientRepliedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Invoice_payeeUserId_status_idx" ON "Invoice"("payeeUserId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_status_reportedPaidAt_idx" ON "Invoice"("status", "reportedPaidAt");
