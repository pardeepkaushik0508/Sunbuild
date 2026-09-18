-- Gantt baseline/actual, phase-linked deposits, Service Coordinator, CO↔Selection, notification identity.

-- Role enum (PostgreSQL). New value is additive and non-destructive.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SERVICE_COORDINATOR';

-- Deposit trigger enum
DO $$ BEGIN
  CREATE TYPE "DepositTriggerType" AS ENUM ('DATE_BASED', 'PHASE_COMPLETION', 'PHASE_COMPLETION_PLUS_OFFSET');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ScheduleItem: baseline is historical; startDate/endDate remain the working schedule.
ALTER TABLE "ScheduleItem" ADD COLUMN IF NOT EXISTS "baselineStartDate" TIMESTAMP(3);
ALTER TABLE "ScheduleItem" ADD COLUMN IF NOT EXISTS "baselineEndDate" TIMESTAMP(3);
ALTER TABLE "ScheduleItem" ADD COLUMN IF NOT EXISTS "actualStartDate" TIMESTAMP(3);
ALTER TABLE "ScheduleItem" ADD COLUMN IF NOT EXISTS "actualEndDate" TIMESTAMP(3);

UPDATE "ScheduleItem"
SET "baselineStartDate" = "startDate",
    "baselineEndDate" = "endDate"
WHERE "baselineStartDate" IS NULL;

UPDATE "ScheduleItem"
SET "actualEndDate" = "endDate",
    "actualStartDate" = COALESCE("actualStartDate", "startDate")
WHERE status = 'COMPLETED' AND "actualEndDate" IS NULL;

CREATE INDEX IF NOT EXISTS "ScheduleItem_projectId_endDate_idx" ON "ScheduleItem"("projectId", "endDate");

-- Task baseline / actual start
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "baselineStartDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "baselineEndDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "actualStartDate" TIMESTAMP(3);

UPDATE "Task"
SET "baselineStartDate" = COALESCE("startDate", "dueDate", "createdAt"),
    "baselineEndDate" = COALESCE("dueDate", "startDate")
WHERE "baselineStartDate" IS NULL AND ("startDate" IS NOT NULL OR "dueDate" IS NOT NULL);

UPDATE "Task"
SET "actualStartDate" = COALESCE("actualStartDate", "startDate")
WHERE status IN ('IN_PROGRESS', 'DONE') AND "actualStartDate" IS NULL AND "startDate" IS NOT NULL;

-- Milestone baseline / actual
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "baselineDueDate" TIMESTAMP(3);
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "actualDueDate" TIMESTAMP(3);

UPDATE "Milestone"
SET "baselineDueDate" = "dueDate"
WHERE "baselineDueDate" IS NULL AND "dueDate" IS NOT NULL;

UPDATE "Milestone"
SET "actualDueDate" = "dueDate"
WHERE status = 'COMPLETED' AND "actualDueDate" IS NULL AND "dueDate" IS NOT NULL;

-- Deposit phase-trigger fields. dueDate remains the CURRENT due date.
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "plannedDueDate" TIMESTAMP(3);
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "triggerType" "DepositTriggerType" NOT NULL DEFAULT 'DATE_BASED';
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "linkedScheduleItemId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "offsetDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "dueDateChangeReason" TEXT;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "lastDueDateChangedAt" TIMESTAMP(3);

UPDATE "Deposit"
SET "plannedDueDate" = "dueDate"
WHERE "plannedDueDate" IS NULL AND "dueDate" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Deposit_projectId_dueDate_idx" ON "Deposit"("projectId", "dueDate");
CREATE INDEX IF NOT EXISTS "Deposit_projectId_status_idx" ON "Deposit"("projectId", "status");
CREATE INDEX IF NOT EXISTS "Deposit_linkedScheduleItemId_idx" ON "Deposit"("linkedScheduleItemId");
CREATE INDEX IF NOT EXISTS "Deposit_triggerType_status_idx" ON "Deposit"("triggerType", "status");

DO $$ BEGIN
  ALTER TABLE "Deposit"
    ADD CONSTRAINT "Deposit_linkedScheduleItemId_fkey"
    FOREIGN KEY ("linkedScheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DepositDueDateHistory" (
  "id" TEXT NOT NULL,
  "depositId" TEXT NOT NULL,
  "previousDueDate" TIMESTAMP(3),
  "newDueDate" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "linkedScheduleItemId" TEXT,
  "linkedPhaseName" TEXT,
  "changedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepositDueDateHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DepositDueDateHistory_depositId_createdAt_idx" ON "DepositDueDateHistory"("depositId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DepositDueDateHistory"
    ADD CONSTRAINT "DepositDueDateHistory_depositId_fkey"
    FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepositDueDateHistory"
    ADD CONSTRAINT "DepositDueDateHistory_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Change Order ↔ Selection
ALTER TABLE "ChangeOrder" ADD COLUMN IF NOT EXISTS "relatedSelectionSectionId" TEXT;
CREATE INDEX IF NOT EXISTS "ChangeOrder_relatedSelectionSectionId_idx" ON "ChangeOrder"("relatedSelectionSectionId");

DO $$ BEGIN
  ALTER TABLE "ChangeOrder"
    ADD CONSTRAINT "ChangeOrder_relatedSelectionSectionId_fkey"
    FOREIGN KEY ("relatedSelectionSectionId") REFERENCES "SelectionSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ChangeOrderSelection" (
  "id" TEXT NOT NULL,
  "changeOrderId" TEXT NOT NULL,
  "selectionSectionId" TEXT NOT NULL,
  "snapshotTitle" TEXT NOT NULL,
  "snapshotCategory" TEXT,
  "snapshotStatus" TEXT,
  "snapshotAllowance" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangeOrderSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChangeOrderSelection_changeOrderId_selectionSectionId_key"
  ON "ChangeOrderSelection"("changeOrderId", "selectionSectionId");
CREATE INDEX IF NOT EXISTS "ChangeOrderSelection_selectionSectionId_idx" ON "ChangeOrderSelection"("selectionSectionId");

DO $$ BEGIN
  ALTER TABLE "ChangeOrderSelection"
    ADD CONSTRAINT "ChangeOrderSelection_changeOrderId_fkey"
    FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChangeOrderSelection"
    ADD CONSTRAINT "ChangeOrderSelection_selectionSectionId_fkey"
    FOREIGN KEY ("selectionSectionId") REFERENCES "SelectionSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Warranty coordinator / triage
ALTER TABLE "WarrantyTicket" ADD COLUMN IF NOT EXISTS "coordinatorId" TEXT;
ALTER TABLE "WarrantyTicket" ADD COLUMN IF NOT EXISTS "forwardedToUserId" TEXT;
ALTER TABLE "WarrantyTicket" ADD COLUMN IF NOT EXISTS "forwardedAt" TIMESTAMP(3);
ALTER TABLE "WarrantyTicket" ADD COLUMN IF NOT EXISTS "triageNotes" TEXT;

CREATE INDEX IF NOT EXISTS "WarrantyTicket_projectId_status_idx" ON "WarrantyTicket"("projectId", "status");
CREATE INDEX IF NOT EXISTS "WarrantyTicket_coordinatorId_status_idx" ON "WarrantyTicket"("coordinatorId", "status");
CREATE INDEX IF NOT EXISTS "WarrantyTicket_clientUserId_idx" ON "WarrantyTicket"("clientUserId");
CREATE INDEX IF NOT EXISTS "WarrantyTicket_pmId_status_idx" ON "WarrantyTicket"("pmId", "status");
CREATE INDEX IF NOT EXISTS "WarrantyTicket_subcontractorId_idx" ON "WarrantyTicket"("subcontractorId");

DO $$ BEGIN
  ALTER TABLE "WarrantyTicket"
    ADD CONSTRAINT "WarrantyTicket_coordinatorId_fkey"
    FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WarrantyTicket"
    ADD CONSTRAINT "WarrantyTicket_forwardedToUserId_fkey"
    FOREIGN KEY ("forwardedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification identity / filters
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventKey" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx" ON "Notification"("userId", "category", "createdAt");

-- Unique event identity per user. Multiple NULLs remain allowed in PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_eventKey_key" ON "Notification"("userId", "eventKey");
