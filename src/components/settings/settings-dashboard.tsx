"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Role } from "@prisma/client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { AiInsightsPanel, type InsightCard } from "@/components/dashboard/ai-insights";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  updateFileStorageAction,
  updateMfaPolicyAction,
  updatePasswordPolicyAction,
  updateSessionTimeoutAction,
  verifySmtpConnectionAction,
} from "@/lib/settings/actions";
import {
  SESSION_TIMEOUT_OPTIONS,
  type CompanySettingsSnapshot,
} from "@/lib/settings/types";
import {
  describePasswordPolicy,
  formatSessionTimeout,
} from "@/lib/settings/validation";
import { GoogleCalendarSettingsCard } from "@/components/settings/google-calendar-card";
import { MicrosoftTodoSettingsCard } from "@/components/settings/microsoft-todo-card";
import { useOptionalToast } from "@/components/ui/toast";
import type { PublicGoogleConnection } from "@/lib/google/types";
import type { PublicMicrosoftTodoConnection } from "@/lib/microsoft/types";

type ModalId =
  | "email"
  | "whatsapp"
  | "quickbooks"
  | "storage"
  | "mfa"
  | "password"
  | "session"
  | null;

const MFA_ROLE_OPTIONS: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.BOOKKEEPER,
];

function DialogShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-sb-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="sb-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-sb-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-sb-muted">{description}</p>
      </div>
      <div className="flex shrink-0 items-center self-start sm:self-center">
        {action}
      </div>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Phase2Notice({
  title,
  body,
  bullets,
}: {
  title: string;
  body: string;
  bullets?: string[];
}) {
  return (
    <div className="space-y-3 text-sm text-sb-body">
      <p className="rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink">
        <span className="font-semibold">Phase 2 / Not configured</span>
        <span className="mt-1 block text-sb-muted">{title}</span>
      </p>
      <p>{body}</p>
      {bullets?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sb-muted">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SettingsDashboard({
  initialSettings,
  insights,
  canEditSecurity,
  canEditOperational,
  googleCalendar,
  googleFlash,
  microsoftTodo,
  microsoftFlash,
}: {
  initialSettings: CompanySettingsSnapshot;
  insights: InsightCard[];
  canEditSecurity: boolean;
  canEditOperational: boolean;
  googleCalendar: PublicGoogleConnection;
  googleFlash?: { kind: "connected" | "disconnected" | "error"; message?: string } | null;
  microsoftTodo: PublicMicrosoftTodoConnection;
  microsoftFlash?: { kind: "connected" | "disconnected" | "error"; message?: string } | null;
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [settings, setSettings] = useState(initialSettings);
  const [modal, setModal] = useState<ModalId>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  function open(id: ModalId) {
    setError(null);
    setSuccess(null);
    setModal(id);
  }

  function close() {
    if (pending) return;
    setModal(null);
    setError(null);
  }

  function afterSave(message: string) {
    setSuccess(message);
    setError(null);
    toast?.success(message);
    startTransition(() => {
      router.refresh();
    });
  }

  function onModalError(message: string | null) {
    setError(message);
    if (message) toast?.error(message);
  }

  return (
    <div className="space-y-6">
      {googleFlash?.kind === "connected" ? (
        <p className="rounded-[10px] border border-sb-green/40 bg-sb-green-soft px-3 py-2 text-sm text-sb-ink">
          Google Calendar connected successfully
        </p>
      ) : null}
      {googleFlash?.kind === "disconnected" ? (
        <p className="rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-2 text-sm text-sb-ink">
          Google Calendar disconnected. Local SUNBUILD events were kept.
        </p>
      ) : null}
      {googleFlash?.kind === "error" ? (
        <p className="rounded-[10px] border border-sb-red/40 bg-sb-red-soft px-3 py-2 text-sm text-sb-ink">
          {googleFlash.message || "Could not connect Google Calendar"}
        </p>
      ) : null}
      {microsoftFlash?.kind === "connected" ? (
        <p className="rounded-[10px] border border-sb-green/40 bg-sb-green-soft px-3 py-2 text-sm text-sb-ink">
          Microsoft To Do connected successfully
        </p>
      ) : null}
      {microsoftFlash?.kind === "disconnected" ? (
        <p className="rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-2 text-sm text-sb-ink">
          Microsoft To Do disconnected. SUNBUILD project tasks were kept.
        </p>
      ) : null}
      {microsoftFlash?.kind === "error" ? (
        <p className="rounded-[10px] border border-sb-red/40 bg-sb-red-soft px-3 py-2 text-sm text-sb-ink">
          {microsoftFlash.message || "Could not connect Microsoft To Do"}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-sb-ink">
            Internal Users and Roles
          </h2>
          <div className="space-y-3">
            <SettingCard
              title="Email Notifications"
              description="System-wide email settings"
              action={
                <Button variant="yellow" size="sm" onClick={() => open("email")}>
                  Configure
                </Button>
              }
            />
            <GoogleCalendarSettingsCard
              connection={googleCalendar}
              canManage
              returnTo="/owner/settings"
            />
            <MicrosoftTodoSettingsCard
              connection={microsoftTodo}
              canManage
              returnTo="/owner/settings"
            />
            <SettingCard
              title="WhatsApp Integration"
              description="Business messaging setup"
              action={
                <Button variant="yellow" size="sm" onClick={() => open("whatsapp")}>
                  Setup
                </Button>
              }
            />
            <SettingCard
              title="QuickBooks Integration"
              description="Accounting system sync"
              action={
                <Button
                  variant="yellow"
                  size="sm"
                  onClick={() => open("quickbooks")}
                >
                  Setup
                </Button>
              }
            />
            <SettingCard
              title="File Storage"
              description="Documents and photo storage"
              action={
                <Button
                  variant="yellow"
                  size="sm"
                  onClick={() => open("storage")}
                  disabled={!canEditOperational}
                >
                  Manage
                </Button>
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-sb-ink">
            Security Settings
          </h2>
          <div className="space-y-3">
            <SettingCard
              title="Two-Factor Authentication"
              description="Enhanced security for all users"
              action={
                <Button
                  variant="purple"
                  size="sm"
                  onClick={() => open("mfa")}
                  disabled={!canEditSecurity}
                >
                  {settings.mfa.enforced ? "Enabled" : "Setup"}
                </Button>
              }
            />
            <SettingCard
              title="Password Policy"
              description="Minimum Requirements"
              action={
                <Button
                  variant="yellow"
                  size="sm"
                  onClick={() => open("password")}
                  disabled={!canEditSecurity}
                >
                  Edit
                </Button>
              }
            />
            <SettingCard
              title="Session Timeout"
              description="Auto-Logout settings"
              action={
                <button
                  type="button"
                  onClick={() => open("session")}
                  disabled={!canEditSecurity}
                  className="text-[15px] font-semibold text-sb-ink hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                >
                  {formatSessionTimeout(settings.sessionTimeoutMinutes)}
                </button>
              }
            />
          </div>
        </section>
      </div>

      <AiInsightsPanel insights={insights} viewAllHref="/owner/alerts" />

      {modal === "email" ? (
        <DialogShell title="Email Notifications" onClose={close}>
          <Phase2Notice
            title="Advanced notification automation is not part of the current MVP."
            body="Transactional authentication emails (password reset and account invite notices) use server-side Google SMTP when configured. Task notifications, approval emails, RFI alerts, invoice alerts, and warranty notifications are planned for Phase 2."
            bullets={[
              `Transactional auth emails: ${
                settings.emailNotifications.transactionalAuthEmails
                  ? "Supported"
                  : "Off"
              }`,
              `Email provider: ${
                settings.emailNotifications.providerConfigured
                  ? "SMTP configured (server)"
                  : "Not configured"
              }`,
              `Status: ${settings.emailNotifications.status === "phase_2" ? "Phase 2 (advanced alerts)" : settings.emailNotifications.status}`,
            ]}
          />
          <SmtpTestButton />
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        </DialogShell>
      ) : null}

      {modal === "whatsapp" ? (
        <DialogShell title="WhatsApp Integration" onClose={close}>
          <Phase2Notice
            title="WhatsApp Business API is not fully connected in MVP."
            body="The CRM currently supports staff deep-link messaging from the header. Full Business API (provider account, webhooks, send/receive) is reserved for Phase 2. Access tokens are never exposed in the browser."
            bullets={[
              `Status: ${
                settings.whatsapp.status === "setup_required"
                  ? "Setup required / Phase 2"
                  : settings.whatsapp.status
              }`,
              `Provider: ${settings.whatsapp.provider ?? "Not configured"}`,
              `Phone: ${settings.whatsapp.phoneDisplay ?? "Not configured"}`,
              `Webhook: ${
                settings.whatsapp.webhookConfigured ? "Configured" : "Not configured"
              }`,
            ]}
          />
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        </DialogShell>
      ) : null}

      {modal === "quickbooks" ? (
        <DialogShell title="QuickBooks Integration" onClose={close}>
          <Phase2Notice
            title="QuickBooks integration is not configured for the MVP."
            body="Accounting sync will be added later. No fake connection or synchronization is performed."
            bullets={[
              "Status: Coming in Phase 2",
              "OAuth / realm connection: Not configured",
            ]}
          />
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        </DialogShell>
      ) : null}

      {modal === "storage" ? (
        <StorageModal
          settings={settings}
          onClose={close}
          pending={pending}
          error={error}
          success={success}
          onError={onModalError}
          onSaved={(next) => {
            setSettings((s) => ({ ...s, fileStorage: next }));
            afterSave("File storage settings saved");
          }}
          startTransition={startTransition}
        />
      ) : null}

      {modal === "mfa" ? (
        <MfaModal
          settings={settings}
          onClose={close}
          pending={pending}
          error={error}
          success={success}
          onError={onModalError}
          onSaved={(next) => {
            setSettings((s) => ({ ...s, mfa: next }));
            afterSave("MFA policy updated");
          }}
          startTransition={startTransition}
        />
      ) : null}

      {modal === "password" ? (
        <PasswordModal
          settings={settings}
          onClose={close}
          pending={pending}
          error={error}
          success={success}
          onError={onModalError}
          onSaved={(next) => {
            setSettings((s) => ({ ...s, passwordPolicy: next }));
            afterSave("Password policy updated");
          }}
          startTransition={startTransition}
        />
      ) : null}

      {modal === "session" ? (
        <SessionModal
          settings={settings}
          onClose={close}
          pending={pending}
          error={error}
          success={success}
          onError={onModalError}
          onSaved={(minutes) => {
            setSettings((s) => ({ ...s, sessionTimeoutMinutes: minutes }));
            afterSave("Session timeout updated");
          }}
          startTransition={startTransition}
        />
      ) : null}
    </div>
  );
}

function SmtpTestButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  return (
    <div className="mt-4 rounded-xl border border-sb-border bg-sb-canvas/50 p-3">
      <p className="text-sm text-sb-muted">
        Verify Google SMTP using values from <code className="text-xs">.env.local</code>.
        For Gmail you must use a 16-character{" "}
        <strong>App Password</strong> (not your normal Gmail password). After
        changing SMTP values, restart <code className="text-xs">next dev</code>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const res = await verifySmtpConnectionAction();
              setOk(res.ok);
              setMessage(res.message);
            });
          }}
        >
          {pending ? "Testing…" : "Test SMTP connection"}
        </Button>
        {message ? (
          <span
            className={cn(
              "text-sm",
              ok ? "text-emerald-700" : "text-sb-red"
            )}
          >
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  pending,
  canSave,
  saveLabel = "Save",
}: {
  onClose: () => void;
  pending: boolean;
  canSave?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      {canSave !== false ? (
        <Button type="submit" variant="yellow" disabled={pending}>
          {pending ? "Saving…" : saveLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Feedback({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  if (error) return <p className="text-sm text-sb-red">{error}</p>;
  if (success) return <p className="text-sm text-sb-green-dark">{success}</p>;
  return null;
}

function StorageModal({
  settings,
  onClose,
  pending,
  error,
  success,
  onError,
  onSaved,
  startTransition,
}: {
  settings: CompanySettingsSnapshot;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  success: string | null;
  onError: (v: string | null) => void;
  onSaved: (v: CompanySettingsSnapshot["fileStorage"]) => void;
  startTransition: (cb: () => void) => void;
}) {
  const fs = settings.fileStorage;
  const [maxMb, setMaxMb] = useState(String(Math.floor(fs.maxUploadBytes / (1024 * 1024))));
  const [exts, setExts] = useState(fs.allowedExtensions.join(", "));
  const [categories, setCategories] = useState(fs.categories.join("\n"));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    const mb = Number(maxMb);
    if (!Number.isFinite(mb) || mb < 1) {
      onError("Maximum upload size is required");
      return;
    }
    const allowedExtensions = exts
      .split(/[,\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .map((x) => (x.startsWith(".") ? x : `.${x}`));
    const cats = categories
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    startTransition(async () => {
      const res = await updateFileStorageAction({
        maxUploadBytes: Math.round(mb * 1024 * 1024),
        allowedExtensions,
        categories: cats,
      });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved({
        ...fs,
        maxUploadBytes: Math.round(mb * 1024 * 1024),
        allowedExtensions,
        categories: cats,
      });
    });
  }

  return (
    <DialogShell title="File Storage" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 rounded-[12px] border border-sb-border bg-sb-canvas p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-sb-muted">Provider</p>
            <p className="mt-1 font-medium text-sb-ink">
              {fs.provider === "local" ? "Local private storage" : fs.provider}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-sb-muted">Status</p>
            <p className="mt-1 font-medium text-sb-ink capitalize">
              {settings.meta.storageStatus}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-sb-muted">Usage</p>
            <p className="mt-1 font-medium text-sb-ink">
              {formatBytes(settings.meta.storageUsageBytes)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-sb-muted">Access policy</p>
            <p className="mt-1 font-medium text-sb-ink">Private · signed downloads</p>
          </div>
        </div>
        <p className="text-xs text-sb-muted">
          Secrets and service-role keys are never shown. Sensitive files use
          authorization checks and private object paths.
        </p>
        <FormField label="Maximum upload size (MB)" required>
          <Input
            type="number"
            min={1}
            max={100}
            value={maxMb}
            onChange={(e) => setMaxMb(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Allowed file types" required>
          <Input
            value={exts}
            onChange={(e) => setExts(e.target.value)}
            placeholder=".pdf, .png, .jpg"
            required
          />
        </FormField>
        <FormField label="Document categories" required>
          <textarea
            className="min-h-28 w-full rounded-[10px] border border-sb-border bg-white px-3 py-2 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            required
          />
        </FormField>
        <Feedback error={error} success={success} />
        <ModalFooter onClose={onClose} pending={pending} />
      </form>
    </DialogShell>
  );
}

function MfaModal({
  settings,
  onClose,
  pending,
  error,
  success,
  onError,
  onSaved,
  startTransition,
}: {
  settings: CompanySettingsSnapshot;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  success: string | null;
  onError: (v: string | null) => void;
  onSaved: (v: CompanySettingsSnapshot["mfa"]) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [enforced, setEnforced] = useState(settings.mfa.enforced);
  const [roles, setRoles] = useState<Role[]>(settings.mfa.requiredRoles);

  function toggleRole(role: Role) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    if (roles.length === 0) {
      onError("Select at least one required role");
      return;
    }
    startTransition(async () => {
      const res = await updateMfaPolicyAction({ enforced, requiredRoles: roles });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved({ enforced, requiredRoles: roles });
    });
  }

  return (
    <DialogShell title="Two-Factor Authentication" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-sb-muted">
          MFA uses Better Auth TOTP. Privileged roles must enroll when enforcement
          is enabled. Secrets never leave the server.
        </p>
        <label className="flex items-center gap-2 text-sm text-sb-ink">
          <input
            type="checkbox"
            checked={enforced}
            onChange={(e) => setEnforced(e.target.checked)}
            className="h-4 w-4 rounded border-sb-border"
          />
          Enforce MFA for required roles
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-sb-ink">
            Required roles <span className="text-[#dc2626]">*</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MFA_ROLE_OPTIONS.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 rounded-[10px] border border-sb-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-sb-muted">
          Plugin: {settings.meta.mfaPluginEnabled ? "Active" : "Unavailable"} ·
          Status: {enforced ? "Enabled" : "Not enforced"}
        </p>
        <Feedback error={error} success={success} />
        <ModalFooter onClose={onClose} pending={pending} />
      </form>
    </DialogShell>
  );
}

function PasswordModal({
  settings,
  onClose,
  pending,
  error,
  success,
  onError,
  onSaved,
  startTransition,
}: {
  settings: CompanySettingsSnapshot;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  success: string | null;
  onError: (v: string | null) => void;
  onSaved: (v: CompanySettingsSnapshot["passwordPolicy"]) => void;
  startTransition: (cb: () => void) => void;
}) {
  const p = settings.passwordPolicy;
  const [minLength, setMinLength] = useState(String(p.minLength));
  const [requireUppercase, setRequireUppercase] = useState(p.requireUppercase);
  const [requireLowercase, setRequireLowercase] = useState(p.requireLowercase);
  const [requireNumber, setRequireNumber] = useState(p.requireNumber);
  const [requireSpecial, setRequireSpecial] = useState(p.requireSpecial);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    const len = Number(minLength);
    if (!Number.isFinite(len)) {
      onError("Minimum length is required");
      return;
    }
    const next = {
      minLength: len,
      requireUppercase,
      requireLowercase,
      requireNumber,
      requireSpecial,
    };
    startTransition(async () => {
      const res = await updatePasswordPolicyAction(next);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved(next);
    });
  }

  return (
    <DialogShell title="Password Policy" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-sb-muted">
          Applied on account creation and password reset. Better Auth enforces a
          floor of 8 characters; company policy may be stricter.
        </p>
        <FormField label="Minimum length" required>
          <Input
            type="number"
            min={8}
            max={128}
            value={minLength}
            onChange={(e) => setMinLength(e.target.value)}
            required
          />
        </FormField>
        {(
          [
            ["Uppercase letter", requireUppercase, setRequireUppercase],
            ["Lowercase letter", requireLowercase, setRequireLowercase],
            ["Number", requireNumber, setRequireNumber],
            ["Special character", requireSpecial, setRequireSpecial],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} className="flex items-center gap-2 text-sm text-sb-ink">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setter(e.target.checked)}
              className="h-4 w-4"
            />
            Require {label.toLowerCase()}
          </label>
        ))}
        <p className="text-xs text-sb-muted">
          Preview:{" "}
          {describePasswordPolicy({
            minLength: Number(minLength) || p.minLength,
            requireUppercase,
            requireLowercase,
            requireNumber,
            requireSpecial,
          })}
        </p>
        <Feedback error={error} success={success} />
        <ModalFooter onClose={onClose} pending={pending} />
      </form>
    </DialogShell>
  );
}

function SessionModal({
  settings,
  onClose,
  pending,
  error,
  success,
  onError,
  onSaved,
  startTransition,
}: {
  settings: CompanySettingsSnapshot;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  success: string | null;
  onError: (v: string | null) => void;
  onSaved: (minutes: CompanySettingsSnapshot["sessionTimeoutMinutes"]) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [minutes, setMinutes] = useState(String(settings.sessionTimeoutMinutes));
  const confirmRef = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    const value = Number(minutes);
    if (!confirmRef.current && value !== settings.sessionTimeoutMinutes) {
      const ok = window.confirm(
        `Change idle session timeout to ${formatSessionTimeout(value)}? Active sessions will follow the new limit.`
      );
      if (!ok) return;
      confirmRef.current = true;
    }
    startTransition(async () => {
      const res = await updateSessionTimeoutAction({ minutes: value });
      confirmRef.current = false;
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved(res.minutes);
    });
  }

  return (
    <DialogShell title="Session Timeout" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-sb-muted">
          Users are signed out after this period of inactivity and returned to
          login. Protected content is not kept in the browser after logout.
        </p>
        <FormField label="Timeout" required>
          <Select
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            required
          >
            {SESSION_TIMEOUT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatSessionTimeout(m)}
              </option>
            ))}
          </Select>
        </FormField>
        <Feedback error={error} success={success} />
        <ModalFooter onClose={onClose} pending={pending} />
      </form>
    </DialogShell>
  );
}
