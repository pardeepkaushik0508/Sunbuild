-- Sales Information Sheet fields (SV Purchase Agreement fillable form parity)
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "gstRebate" DOUBLE PRECISION;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "firmPossessionDate" TIMESTAMP(3);
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "builderSignatureDate" TIMESTAMP(3);
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "purchaserAgreementReceiptDate" TIMESTAMP(3);
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "block" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "lot" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyerOccupation" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyerIdNumber" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2FirstName" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2LastName" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2Email" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2Phone" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2Mailing" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2Occupation" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "buyer2IdNumber" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "realtorName" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "realtorPhone" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "realtorEmail" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "lawyerName" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "lawyerPhone" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "lawyerEmail" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN IF NOT EXISTS "changeOrderNotes" TEXT;

ALTER TABLE "Condition" ADD COLUMN IF NOT EXISTS "party" TEXT;
