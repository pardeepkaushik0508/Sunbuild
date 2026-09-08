import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nanoid } from "nanoid";
import {
  COMPANY_SETTING_DEFAULTS,
  DEFAULT_EMAIL_NOTIFICATIONS,
  DEFAULT_FILE_STORAGE,
  DEFAULT_MFA_POLICY,
  DEFAULT_PASSWORD_POLICY,
  DEFAULT_QUICKBOOKS,
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  DEFAULT_WHATSAPP,
} from "@/lib/settings/defaults";
import {
  SETTING_KEYS,
  type CompanySettingsSnapshot,
  type EmailNotificationSettings,
  type FileStorageSettings,
  type MfaPolicy,
  type PasswordPolicy,
  type QuickBooksIntegrationSettings,
  type SessionTimeoutMinutes,
  type SettingCategory,
  type SettingKey,
  type SettingScope,
  type WhatsAppIntegrationSettings,
} from "@/lib/settings/types";
import {
  fileStorageSchema,
  mfaPolicySchema,
  passwordPolicySchema,
  sessionTimeoutSchema,
} from "@/lib/settings/validation";
import { AppError } from "@/lib/errors";
import { readdir, stat } from "fs/promises";
import path from "path";

type SettingRow = {
  id: string;
  companyId: string;
  userId: string;
  scope: string;
  category: string;
  key: string;
  value: string;
  updatedBy: string | null;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

let schemaReady: Promise<void> | null = null;

/** Ensure AppSetting + MFA columns/tables exist (safe if already applied). */
export async function ensureSettingsSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS AppSetting (
          id TEXT PRIMARY KEY NOT NULL,
          companyId TEXT NOT NULL DEFAULT '',
          userId TEXT NOT NULL DEFAULT '',
          scope TEXT NOT NULL,
          category TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updatedBy TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS AppSetting_companyId_userId_key_key ON AppSetting(companyId, userId, key)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS AppSetting_scope_category_idx ON AppSetting(scope, category)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS AppSetting_companyId_category_idx ON AppSetting(companyId, category)`
      );

      const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `PRAGMA table_info(User)`
      );
      if (!cols.some((c) => c.name === "twoFactorEnabled")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE User ADD COLUMN twoFactorEnabled BOOLEAN NOT NULL DEFAULT 0`
        );
      }

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS twoFactor (
          id TEXT PRIMARY KEY NOT NULL,
          secret TEXT NOT NULL,
          backupCodes TEXT NOT NULL,
          userId TEXT NOT NULL,
          verified BOOLEAN NOT NULL DEFAULT 0,
          failedVerificationCount INTEGER NOT NULL DEFAULT 0,
          lockedUntil DATETIME,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS twoFactor_userId_idx ON twoFactor(userId)`
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

async function readSettingRow(companyId: string, key: string) {
  await ensureSettingsSchema();
  const rows = await prisma.$queryRawUnsafe<SettingRow[]>(
    `SELECT id, companyId, userId, scope, category, key, value, updatedBy
     FROM AppSetting WHERE companyId = ? AND userId = '' AND key = ? LIMIT 1`,
    companyId,
    key
  );
  return rows[0] ?? null;
}

export async function getCompanySettingValue<T>(
  companyId: string,
  key: SettingKey,
  fallback: T
): Promise<T> {
  const row = await readSettingRow(companyId, key);
  if (!row) return fallback;
  return parseJson(row.value, fallback);
}

export async function ensureCompanySettings(companyId: string) {
  await ensureSettingsSchema();
  const existing = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    `SELECT key FROM AppSetting WHERE companyId = ? AND userId = ''`,
    companyId
  );
  const have = new Set(existing.map((r) => r.key));
  const now = new Date().toISOString();
  for (const [key, def] of Object.entries(COMPANY_SETTING_DEFAULTS)) {
    if (have.has(key)) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO AppSetting (id, companyId, userId, scope, category, key, value, createdAt, updatedAt)
       VALUES (?, ?, '', 'COMPANY', ?, ?, ?, ?, ?)`,
      nanoid(),
      companyId,
      def.category,
      key,
      JSON.stringify(def.value),
      now,
      now
    );
  }
}

async function estimateLocalStorageUsage(): Promise<number | null> {
  try {
    const root = path.join(process.cwd(), "uploads");
    let total = 0;
    async function walk(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          const s = await stat(full);
          total += s.size;
        }
      }
    }
    await walk(root);
    return total;
  } catch {
    return null;
  }
}

export async function getCompanySettings(
  companyId: string
): Promise<CompanySettingsSnapshot> {
  await ensureCompanySettings(companyId);

  const [rows, usage] = await Promise.all([
    prisma.$queryRawUnsafe<SettingRow[]>(
      `SELECT id, companyId, userId, scope, category, key, value, updatedBy
       FROM AppSetting WHERE companyId = ? AND userId = ''`,
      companyId
    ),
    estimateLocalStorageUsage(),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const valueOf = <T,>(key: SettingKey, fallback: T): T => {
    const row = byKey.get(key);
    if (!row) return fallback;
    return parseJson(row.value, fallback);
  };

  const mfa = valueOf(SETTING_KEYS.MFA_POLICY, DEFAULT_MFA_POLICY);
  const passwordPolicy = valueOf(
    SETTING_KEYS.PASSWORD_POLICY,
    DEFAULT_PASSWORD_POLICY
  );
  const sessionTimeoutMinutes = valueOf(
    SETTING_KEYS.SESSION_TIMEOUT,
    DEFAULT_SESSION_TIMEOUT_MINUTES
  );
  const fileStorage = valueOf(SETTING_KEYS.FILE_STORAGE, DEFAULT_FILE_STORAGE);
  const whatsapp = valueOf(SETTING_KEYS.WHATSAPP, DEFAULT_WHATSAPP);
  const quickbooks = valueOf(SETTING_KEYS.QUICKBOOKS, DEFAULT_QUICKBOOKS);
  const emailNotifications = valueOf(
    SETTING_KEYS.EMAIL_NOTIFICATIONS,
    DEFAULT_EMAIL_NOTIFICATIONS
  );

  const email: EmailNotificationSettings = {
    ...emailNotifications,
    providerConfigured: Boolean(
      process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASSWORD?.trim() &&
        process.env.SMTP_HOST?.trim()
    ),
    transactionalAuthEmails: true,
  };

  return {
    mfa: mfaPolicySchema.parse(mfa) as MfaPolicy,
    passwordPolicy: passwordPolicySchema.parse(passwordPolicy) as PasswordPolicy,
    sessionTimeoutMinutes: sessionTimeoutSchema.parse(
      sessionTimeoutMinutes
    ) as SessionTimeoutMinutes,
    fileStorage: fileStorageSchema.parse(fileStorage) as FileStorageSettings,
    whatsapp: whatsapp as WhatsAppIntegrationSettings,
    quickbooks: quickbooks as QuickBooksIntegrationSettings,
    emailNotifications: email,
    meta: {
      mfaPluginEnabled: true,
      storageStatus: "active",
      storageUsageBytes: usage,
    },
  };
}

export async function getPasswordPolicy(
  companyId: string
): Promise<PasswordPolicy> {
  await ensureCompanySettings(companyId);
  const value = await getCompanySettingValue(
    companyId,
    SETTING_KEYS.PASSWORD_POLICY,
    DEFAULT_PASSWORD_POLICY
  );
  return passwordPolicySchema.parse(value) as PasswordPolicy;
}

export async function getSessionTimeoutMinutes(
  companyId: string
): Promise<SessionTimeoutMinutes> {
  await ensureCompanySettings(companyId);
  const value = await getCompanySettingValue(
    companyId,
    SETTING_KEYS.SESSION_TIMEOUT,
    DEFAULT_SESSION_TIMEOUT_MINUTES
  );
  return sessionTimeoutSchema.parse(value) as SessionTimeoutMinutes;
}

export async function getMfaPolicy(companyId: string): Promise<MfaPolicy> {
  await ensureCompanySettings(companyId);
  const value = await getCompanySettingValue(
    companyId,
    SETTING_KEYS.MFA_POLICY,
    DEFAULT_MFA_POLICY
  );
  return mfaPolicySchema.parse(value) as MfaPolicy;
}

export async function getFileStorageSettings(
  companyId: string
): Promise<FileStorageSettings> {
  await ensureCompanySettings(companyId);
  const value = await getCompanySettingValue(
    companyId,
    SETTING_KEYS.FILE_STORAGE,
    DEFAULT_FILE_STORAGE
  );
  return fileStorageSchema.parse(value) as FileStorageSettings;
}

export async function getUserTwoFactorEnabled(userId: string): Promise<boolean> {
  await ensureSettingsSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ twoFactorEnabled: number | boolean }>>(
    `SELECT twoFactorEnabled FROM User WHERE id = ? LIMIT 1`,
    userId
  );
  return Boolean(rows[0]?.twoFactorEnabled);
}

type SetSettingInput = {
  companyId: string;
  key: SettingKey;
  category: SettingCategory;
  scope?: SettingScope;
  value: unknown;
  actorUserId: string;
  action: string;
};

/** Whitelisted persist — never spreads arbitrary request bodies. */
export async function setCompanySetting(input: SetSettingInput) {
  await ensureSettingsSchema();
  const scope = input.scope ?? "COMPANY";
  if (scope !== "COMPANY") {
    throw new AppError("Invalid setting scope for company update");
  }

  const serialized = JSON.stringify(input.value);
  const existing = await readSettingRow(input.companyId, input.key);
  const oldValue = existing ? parseJson(existing.value, null) : null;
  const now = new Date().toISOString();

  if (existing) {
    await prisma.$executeRawUnsafe(
      `UPDATE AppSetting SET value = ?, category = ?, scope = ?, updatedBy = ?, updatedAt = ?
       WHERE companyId = ? AND userId = '' AND key = ?`,
      serialized,
      input.category,
      scope,
      input.actorUserId,
      now,
      input.companyId,
      input.key
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO AppSetting (id, companyId, userId, scope, category, key, value, updatedBy, createdAt, updatedAt)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)`,
      nanoid(),
      input.companyId,
      scope,
      input.category,
      input.key,
      serialized,
      input.actorUserId,
      now,
      now
    );
  }

  await writeAudit({
    userId: input.actorUserId,
    companyId: input.companyId,
    action: input.action,
    entityType: "AppSetting",
    entityId: input.key,
    metadata: {
      key: input.key,
      oldValue,
      newValue: input.value,
    },
  });
}
