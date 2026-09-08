import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
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

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Schema is owned by Prisma migrations (`AppSetting`, `twoFactor`, `User.twoFactorEnabled`).
 * Kept as a no-op for callers that previously bootstrapped SQLite via raw DDL.
 */
export async function ensureSettingsSchema() {
  return;
}

async function readSettingRow(companyId: string, key: string) {
  return prisma.appSetting.findFirst({
    where: { companyId, userId: "", key },
    select: {
      id: true,
      companyId: true,
      userId: true,
      scope: true,
      category: true,
      key: true,
      value: true,
      updatedBy: true,
    },
  });
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
  const existing = await prisma.appSetting.findMany({
    where: { companyId, userId: "" },
    select: { key: true },
  });
  const have = new Set(existing.map((r) => r.key));
  const missing = Object.entries(COMPANY_SETTING_DEFAULTS).filter(
    ([key]) => !have.has(key)
  );
  if (!missing.length) return;

  await prisma.appSetting.createMany({
    data: missing.map(([key, def]) => ({
      companyId,
      userId: "",
      scope: "COMPANY",
      category: def.category,
      key,
      value: JSON.stringify(def.value),
    })),
    skipDuplicates: true,
  });
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
    prisma.appSetting.findMany({
      where: { companyId, userId: "" },
      select: {
        id: true,
        companyId: true,
        userId: true,
        scope: true,
        category: true,
        key: true,
        value: true,
        updatedBy: true,
      },
    }),
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  return Boolean(user?.twoFactorEnabled);
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
  const scope = input.scope ?? "COMPANY";
  if (scope !== "COMPANY") {
    throw new AppError("Invalid setting scope for company update");
  }

  const serialized = JSON.stringify(input.value);
  const existing = await readSettingRow(input.companyId, input.key);
  const oldValue = existing ? parseJson(existing.value, null) : null;

  if (existing) {
    await prisma.appSetting.update({
      where: { id: existing.id },
      data: {
        value: serialized,
        category: input.category,
        scope,
        updatedBy: input.actorUserId,
      },
    });
  } else {
    await prisma.appSetting.create({
      data: {
        companyId: input.companyId,
        userId: "",
        scope,
        category: input.category,
        key: input.key,
        value: serialized,
        updatedBy: input.actorUserId,
      },
    });
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
