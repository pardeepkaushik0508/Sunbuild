import { Role } from "@prisma/client";
import {
  SETTING_KEYS,
  type CompanySettingsSnapshot,
  type EmailNotificationSettings,
  type FileStorageSettings,
  type MfaPolicy,
  type PasswordPolicy,
  type QuickBooksIntegrationSettings,
  type SessionTimeoutMinutes,
  type WhatsAppIntegrationSettings,
} from "@/lib/settings/types";

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
};

export const DEFAULT_MFA_POLICY: MfaPolicy = {
  // Starts off so first-run isn't locked out. PDF "Enabled" appears once Owner turns enforcement on.
  enforced: false,
  requiredRoles: [
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.BOOKKEEPER,
  ],
};

export const DEFAULT_SESSION_TIMEOUT_MINUTES: SessionTimeoutMinutes = 240;

export const DEFAULT_FILE_STORAGE: FileStorageSettings = {
  provider: "local",
  maxUploadBytes: 20 * 1024 * 1024,
  allowedExtensions: [
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
  ],
  visibility: "private",
  categories: [
    "Purchase Contracts",
    "Invoices",
    "Client Documents",
    "Project Photos",
    "Completion Documents",
    "Warranty Photos",
  ],
};

export const DEFAULT_WHATSAPP: WhatsAppIntegrationSettings = {
  status: "setup_required",
  provider: null,
  phoneDisplay: null,
  webhookConfigured: false,
};

export const DEFAULT_QUICKBOOKS: QuickBooksIntegrationSettings = {
  status: "phase_2",
  realmId: null,
};

export const DEFAULT_EMAIL_NOTIFICATIONS: EmailNotificationSettings = {
  status: "phase_2",
  transactionalAuthEmails: true,
  providerConfigured: Boolean(
    process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim() &&
      process.env.SMTP_HOST?.trim()
  ),
};

export const COMPANY_SETTING_DEFAULTS: Record<
  string,
  { category: CompanySettingsSnapshot extends never ? never : string; value: unknown }
> = {
  [SETTING_KEYS.MFA_POLICY]: {
    category: "security",
    value: DEFAULT_MFA_POLICY,
  },
  [SETTING_KEYS.PASSWORD_POLICY]: {
    category: "security",
    value: DEFAULT_PASSWORD_POLICY,
  },
  [SETTING_KEYS.SESSION_TIMEOUT]: {
    category: "security",
    value: DEFAULT_SESSION_TIMEOUT_MINUTES,
  },
  [SETTING_KEYS.FILE_STORAGE]: {
    category: "storage",
    value: DEFAULT_FILE_STORAGE,
  },
  [SETTING_KEYS.WHATSAPP]: {
    category: "integration",
    value: DEFAULT_WHATSAPP,
  },
  [SETTING_KEYS.QUICKBOOKS]: {
    category: "integration",
    value: DEFAULT_QUICKBOOKS,
  },
  [SETTING_KEYS.EMAIL_NOTIFICATIONS]: {
    category: "notifications",
    value: DEFAULT_EMAIL_NOTIFICATIONS,
  },
};
