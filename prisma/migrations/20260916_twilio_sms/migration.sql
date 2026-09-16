-- Twilio SMS stored in the same SUNBUILD database (no separate API service).

CREATE TYPE "SmsMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "SmsMessageStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'UNDELIVERED',
  'FAILED',
  'RECEIVED'
);

CREATE TABLE "SmsMessage" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "projectId" TEXT,
  "leadId" TEXT,
  "buyerId" TEXT,
  "senderUserId" TEXT,
  "direction" "SmsMessageDirection" NOT NULL,
  "fromNumber" TEXT,
  "toNumber" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "twilioSid" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmsMessage_twilioSid_key" ON "SmsMessage"("twilioSid");
CREATE INDEX "SmsMessage_companyId_sentAt_idx" ON "SmsMessage"("companyId", "sentAt");
CREATE INDEX "SmsMessage_leadId_sentAt_idx" ON "SmsMessage"("leadId", "sentAt");
CREATE INDEX "SmsMessage_projectId_sentAt_idx" ON "SmsMessage"("projectId", "sentAt");
CREATE INDEX "SmsMessage_toNumber_idx" ON "SmsMessage"("toNumber");
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
