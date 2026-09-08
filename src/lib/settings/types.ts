import { Role } from "@prisma/client";

export type SettingScope = "SYSTEM" | "COMPANY" | "USER";

export type SettingCategory =
  | "security"
  | "integration"
  | "storage"
  | "notifications";

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
};

export type MfaPolicy = {
  /** Company-wide MFA policy is active (privileged roles must enroll). */
  enforced: boolean;
  requiredRoles: Role[];
};

/** Allowed idle timeout minutes (secure bounds). */
export const SESSION_TIMEOUT_OPTIONS = [
  30, 60, 120, 240, 480,
] as const;

export type SessionTimeoutMinutes =
  (typeof SESSION_TIMEOUT_OPTIONS)[number];

export type StorageProvider = "local" | "s3" | "r2" | "supabase";

export type FileStorageSettings = {
  provider: StorageProvider;
  maxUploadBytes: number;
  allowedExtensions: string[];
  visibility: "private";
  categories: string[];
};

export type IntegrationStatus =
  | "connected"
  | "not_connected"
  | "setup_required"
  | "phase_2"
  | "error";

export type WhatsAppIntegrationSettings = {
  status: IntegrationStatus;
  provider: string | null;
  phoneDisplay: string | null;
  webhookConfigured: boolean;
};

export type QuickBooksIntegrationSettings = {
  status: IntegrationStatus;
  realmId: string | null;
};

export type EmailNotificationSettings = {
  /** Advanced task/approval/RFI alerts — Phase 2. */
  status: IntegrationStatus;
  /** Password reset / invite transactional mail is supported in architecture. */
  transactionalAuthEmails: boolean;
  providerConfigured: boolean;
};

export type CompanySettingsSnapshot = {
  mfa: MfaPolicy;
  passwordPolicy: PasswordPolicy;
  sessionTimeoutMinutes: SessionTimeoutMinutes;
  fileStorage: FileStorageSettings;
  whatsapp: WhatsAppIntegrationSettings;
  quickbooks: QuickBooksIntegrationSettings;
  emailNotifications: EmailNotificationSettings;
  /** Derived display helpers (never secrets). */
  meta: {
    mfaPluginEnabled: boolean;
    storageStatus: "active" | "error";
    storageUsageBytes: number | null;
  };
};

export const SETTING_KEYS = {
  MFA_POLICY: "security.mfa",
  PASSWORD_POLICY: "security.passwordPolicy",
  SESSION_TIMEOUT: "security.sessionTimeoutMinutes",
  FILE_STORAGE: "storage.fileStorage",
  WHATSAPP: "integration.whatsapp",
  QUICKBOOKS: "integration.quickbooks",
  EMAIL_NOTIFICATIONS: "notifications.email",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];
