-- Automated SMS/WhatsApp delivery history for Twilio (and optional Meta fallback).
-- Complements in-app Notification. Idempotent unique keys prevent duplicate sends.

DO $$ BEGIN
  CREATE TYPE "CommunicationChannel" AS ENUM ('SMS', 'WHATSAPP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationProvider" AS ENUM ('TWILIO', 'META');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationDeliveryStatus" AS ENUM (
    'PENDING',
    'QUEUED',
    'ACCEPTED',
    'SENDING',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED',
    'UNDELIVERED',
    'INVALID_PHONE',
    'SKIPPED',
    'NOT_CONFIGURED',
    'OPTED_OUT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CommunicationDelivery" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "recipientUserId" TEXT,
  "projectId" TEXT,
  "notificationId" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "eventType" TEXT NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "provider" "CommunicationProvider" NOT NULL DEFAULT 'TWILIO',
  "direction" "CommunicationDirection" NOT NULL DEFAULT 'OUTBOUND',
  "toNumber" TEXT NOT NULL,
  "fromNumber" TEXT,
  "twilioMessageSid" TEXT,
  "contentSid" TEXT,
  "messagePreview" TEXT,
  "status" "CommunicationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "idempotencyKey" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunicationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationDelivery_twilioMessageSid_key"
  ON "CommunicationDelivery"("twilioMessageSid");

CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationDelivery_idempotencyKey_key"
  ON "CommunicationDelivery"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "CommunicationDelivery_recipientUserId_createdAt_idx"
  ON "CommunicationDelivery"("recipientUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunicationDelivery_companyId_eventType_createdAt_idx"
  ON "CommunicationDelivery"("companyId", "eventType", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunicationDelivery_channel_status_createdAt_idx"
  ON "CommunicationDelivery"("channel", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunicationDelivery_toNumber_direction_createdAt_idx"
  ON "CommunicationDelivery"("toNumber", "direction", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunicationDelivery_notificationId_idx"
  ON "CommunicationDelivery"("notificationId");

DO $$ BEGIN
  ALTER TABLE "CommunicationDelivery"
    ADD CONSTRAINT "CommunicationDelivery_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CommunicationDelivery"
    ADD CONSTRAINT "CommunicationDelivery_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CommunicationDelivery"
    ADD CONSTRAINT "CommunicationDelivery_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
