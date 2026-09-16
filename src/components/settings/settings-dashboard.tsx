"use client";

import { useId, useRef, useState, useTransition } from "react";
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
  | "twilio"
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

function WebhookUrlRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-2">
      <p className="text-[12px] font-medium text-sb-muted">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <code className="break-all text-[12px] text-sb-ink">{url}</code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function TrialSmsTestPanel({
  recipients,
}: {
  recipients: Array<{
    id: string;
    name: string | null;
    email: string;
    phoneDisplay: string;
  }>;
}) {
  const toast = useOptionalToast();
  const [userId, setUserId] = useState(recipients[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sendTrial() {
    if (!userId || pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/twilio/trial-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        twilioSid?: string | null;
        status?: string;
        toDisplay?: string;
        trialTemplate?: string;
        errorCode?: string | null;
        errorMessage?: string | null;
        error?: string;
      } | null;
      if (!res.ok) {
        const msg = data?.error || "Trial SMS test failed";
        setResult(msg);
        toast?.error(msg);
        return;
      }
      const summary = data?.success
        ? `Sent · ${data.twilioSid ?? "no sid"} · ${data.status ?? ""} · ${data.toDisplay ?? ""} · template ${data.trialTemplate ?? "sms_internal_alerts"}`
        : `Failed · ${data?.errorCode ?? ""} · ${data?.errorMessage ?? "unknown"} · ${data?.toDisplay ?? ""}`;
      setResult(summary);
      if (data?.success) toast?.success("Trial SMS accepted by Twilio");
      else toast?.error(data?.errorMessage || "Trial SMS failed");
    } catch {
      setResult("Trial SMS request failed");
      toast?.error("Trial SMS request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-3">
      <p className="font-medium text-sb-ink">Send Trial SMS</p>
      <p className="text-[12px] text-sb-muted">
        Uses <code className="text-sb-ink">sms_internal_alerts</code> via the
        server. Destination must be an existing company user (verified in Twilio).
      </p>
      <Select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        disabled={pending}
      >
        {recipients.map((r) => (
          <option key={r.id} value={r.id}>
            {(r.name || r.email) + " · " + r.phoneDisplay}
          </option>
        ))}
      </Select>
      <Button
        variant="yellow"
        size="sm"
        disabled={!userId || pending}
        onClick={() => void sendTrial()}
      >
        {pending ? "Sending…" : "Send Trial SMS"}
      </Button>
      {result ? (
        <p className="break-all text-[12px] text-sb-muted">{result}</p>
      ) : null}
    </div>
  );
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
  smsTestRecipients = [],
}: {
  initialSettings: CompanySettingsSnapshot;
  insights: InsightCard[];
  canEditSecurity: boolean;
  canEditOperational: boolean;
  googleCalendar: PublicGoogleConnection;
  googleFlash?: { kind: "connected" | "disconnected" | "error"; message?: string } | null;
  microsoftTodo: PublicMicrosoftTodoConnection;
  microsoftFlash?: { kind: "connected" | "disconnected" | "error"; message?: string } | null;
  smsTestRecipients?: Array<{
    id: string;
    name: string | null;
    email: string;
    phoneDisplay: string;
  }>;
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [settings, setSettings] = useState(initialSettings);
  const [prevInitialSettings, setPrevInitialSettings] =
    useState(initialSettings);
  const [modal, setModal] = useState<ModalId>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (initialSettings !== prevInitialSettings) {
    setPrevInitialSettings(initialSettings);
    setSettings(initialSettings);
  }

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
              title="Twilio SMS"
              description={
                settings.twilio.mode === "trial"
                  ? settings.twilio.status === "connected"
                    ? "Trial mode — Twilio template SMS via this Next.js app"
                    : "Trial mode setup required (no purchased From number needed)"
                  : settings.twilio.status === "connected"
                    ? "Same-origin SMS via this Next.js app"
                    : "Server env setup required"
              }
              action={
                <Button variant="yellow" size="sm" onClick={() => open("twilio")}>
                  {settings.twilio.status === "connected" ? "View" : "Setup"}
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
            body="Transactional authentication emails (password reset and account invite notices) use Resend (HTTPS) or Google SMTP when configured. Task notifications, approval emails, RFI alerts, invoice alerts, and warranty notifications are planned for Phase 2."
            bullets={[
              `Transactional auth emails: ${
                settings.emailNotifications.transactionalAuthEmails
                  ? "Supported"
                  : "Off"
              }`,
              `Email provider: ${
                settings.emailNotifications.providerConfigured
                  ? "Configured (server env)"
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

      {modal === "twilio" ? (
        <DialogShell title="Twilio SMS" onClose={close} wide>
          {settings.twilio.mode === "trial" ? (
            <div className="space-y-3 text-sm text-sb-body">
              <p
                className={
                  settings.twilio.status === "connected"
                    ? "rounded-[10px] border border-sb-green-border bg-sb-green-soft px-3 py-2 text-sb-ink"
                    : "rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink"
                }
              >
                <span className="font-semibold">SMS Trial Mode</span>
                <span className="mt-1 block text-sb-muted">
                  Twilio supplies the trial sender. Custom CRM text is stored in
                  history but the API body is a trial template. Secrets stay
                  server-only — never NEXT_PUBLIC_.
                </span>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sb-muted">
                <li>Twilio mode: TRIAL</li>
                <li>
                  Authentication:{" "}
                  {settings.twilio.liveAuthOk === true
                    ? "OK"
                    : settings.twilio.liveAuthOk === false
                      ? "FAILED"
                      : "Not checked"}
                </li>
                <li>
                  Account SID:{" "}
                  {settings.twilio.accountSidDisplay ?? "Not set"}
                </li>
                <li>
                  Auth Token:{" "}
                  {settings.twilio.authTokenConfigured
                    ? "configured"
                    : "missing"}
                </li>
                <li>
                  Trial template:{" "}
                  {settings.twilio.trialTemplate ?? "sms_internal_alerts"}
                </li>
                <li>Purchased Twilio From number: Not required</li>
                <li>
                  Recipient trial verification: Verify in Twilio Console
                </li>
                <li>
                  Ready for trial API test:{" "}
                  {settings.twilio.trialReady === true
                    ? "YES"
                    : settings.twilio.trialReady === false
                      ? "NO"
                      : "Not checked"}
                </li>
              </ul>
              {settings.twilio.diagnostics.length ? (
                <div className="rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink">
                  <p className="font-semibold">Admin diagnostics</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sb-muted">
                    {settings.twilio.diagnostics.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {settings.twilio.recentFailures.length ? (
                <div className="space-y-2">
                  <p className="font-medium text-sb-ink">Recent failed SMS</p>
                  <ul className="space-y-1 text-[12px] text-sb-muted">
                    {settings.twilio.recentFailures.map((fail) => (
                      <li
                        key={`${fail.sentAt}-${fail.toDisplay}-${fail.errorCode ?? "x"}`}
                      >
                        {fail.toDisplay}
                        {fail.errorCode ? ` · ${fail.errorCode}` : ""}
                        {fail.unverifiedRecipient
                          ? " · unverified trial recipient"
                          : ""}
                        {fail.errorMessage ? ` — ${fail.errorMessage}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <WebhookUrlRow
                label="Status callback"
                url={settings.twilio.statusCallbackUrl}
              />
              <WebhookUrlRow
                label="Inbound SMS"
                url={settings.twilio.inboundWebhookUrl}
              />
              {canEditSecurity && smsTestRecipients.length > 0 ? (
                <TrialSmsTestPanel recipients={smsTestRecipients} />
              ) : canEditSecurity ? (
                <p className="text-[12px] text-sb-muted">
                  Add a phone number to a company user to enable Send Trial SMS.
                </p>
              ) : null}
            </div>
          ) : settings.twilio.status === "connected" ? (
            <div className="space-y-3 text-sm text-sb-body">
              <p className="rounded-[10px] border border-sb-green-border bg-sb-green-soft px-3 py-2 text-sb-ink">
                Twilio is configured on this application. SMS is sent from
                the same Next.js server — there is no separate API domain.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sb-muted">
                <li>Twilio mode: PRODUCTION</li>
                <li>
                  Status: Connected (
                  {settings.twilio.senderMode === "messaging_service"
                    ? "Messaging Service"
                    : "direct phone number"}
                  )
                </li>
                <li>Provider: Twilio</li>
                <li>
                  Account SID:{" "}
                  {settings.twilio.accountSidDisplay ?? "Not shown"}
                </li>
                <li>
                  From: {settings.twilio.fromDisplay ?? "Not shown"}
                </li>
                <li>
                  Messaging Service:{" "}
                  {settings.twilio.messagingServiceConfigured
                    ? "Yes (preferred)"
                    : "Not set — using TWILIO_PHONE_NUMBER"}
                </li>
              </ul>
              {settings.twilio.diagnostics.length ? (
                <div className="rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink">
                  <p className="font-semibold">Admin diagnostics</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sb-muted">
                    {settings.twilio.diagnostics.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {settings.twilio.recentFailures.length ? (
                <div className="space-y-2">
                  <p className="font-medium text-sb-ink">Recent failed SMS</p>
                  <ul className="space-y-1 text-[12px] text-sb-muted">
                    {settings.twilio.recentFailures.map((fail) => (
                      <li
                        key={`${fail.sentAt}-${fail.toDisplay}-${fail.errorCode ?? "x"}`}
                      >
                        {fail.toDisplay}
                        {fail.errorCode ? ` · ${fail.errorCode}` : ""}
                        {fail.unverifiedRecipient
                          ? " · unverified trial recipient"
                          : ""}
                        {fail.errorMessage ? ` — ${fail.errorMessage}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-sb-muted">
                Paste these URLs in the Twilio console. They follow{" "}
                <code className="text-sb-ink">APP_URL</code> when the app
                moves hosts.
              </p>
              <WebhookUrlRow
                label="Status callback"
                url={settings.twilio.statusCallbackUrl}
              />
              <WebhookUrlRow
                label="Inbound SMS"
                url={settings.twilio.inboundWebhookUrl}
              />
            </div>
          ) : (
            <div className="space-y-3 text-sm text-sb-body">
              <p className="rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink">
                <span className="font-semibold">SMS not ready</span>
                <span className="mt-1 block text-sb-muted">
                  Env vars may be present, but Twilio cannot send until the
                  blockers below are fixed. Secrets stay server-only — never
                  NEXT_PUBLIC_.
                </span>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sb-muted">
                <li>
                  Twilio mode:{" "}
                  {(settings.twilio.mode || "trial").toUpperCase()}
                </li>
                <li>
                  Live auth:{" "}
                  {settings.twilio.liveAuthOk === true
                    ? "OK"
                    : settings.twilio.liveAuthOk === false
                      ? "FAILED — fix Account SID / Auth Token on Render"
                      : "Not checked"}
                </li>
                <li>
                  From number on Twilio account:{" "}
                  {settings.twilio.fromNumberOwned === true
                    ? "Yes"
                    : settings.twilio.fromNumberOwned === false
                      ? "NO — set TWILIO_PHONE_NUMBER to a number owned by this account"
                      : "Not checked (not required in trial)"}
                </li>
                <li>
                  From display: {settings.twilio.fromDisplay ?? "Not set"}
                </li>
              </ul>
              {settings.twilio.diagnostics.length ? (
                <div className="rounded-[10px] border border-sb-yellow/50 bg-sb-yellow-soft px-3 py-2 text-sb-ink">
                  <p className="font-semibold">Admin diagnostics</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sb-muted">
                    {settings.twilio.diagnostics.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {settings.twilio.recentFailures.length ? (
                <div className="space-y-2">
                  <p className="font-medium text-sb-ink">Recent failed SMS</p>
                  <ul className="space-y-1 text-[12px] text-sb-muted">
                    {settings.twilio.recentFailures.map((fail) => (
                      <li
                        key={`${fail.sentAt}-${fail.toDisplay}-${fail.errorCode ?? "x"}`}
                      >
                        {fail.toDisplay}
                        {fail.errorCode ? ` · ${fail.errorCode}` : ""}
                        {fail.errorMessage ? ` — ${fail.errorMessage}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <WebhookUrlRow
                label="Status callback"
                url={settings.twilio.statusCallbackUrl}
              />
              <WebhookUrlRow
                label="Inbound SMS"
                url={settings.twilio.inboundWebhookUrl}
              />
            </div>
          )}
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
        Local: Google SMTP via <code className="text-xs">SMTP_*</code> in{" "}
        <code className="text-xs">.env.local</code> (Gmail needs a 16-character App
        Password). Render Free blocks SMTP ports — set{" "}
        <code className="text-xs">RESEND_API_KEY</code> +{" "}
        <code className="text-xs">RESEND_FROM_EMAIL</code> (or upgrade to a paid
        Render instance). Restart the server after changing env values.
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
          {pending ? "Testing…" : "Test email connection"}
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
              {fs.provider === "cloudinary"
                ? "Cloudinary"
                : fs.provider === "local"
                  ? "Local private storage"
                  : fs.provider}
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
            <p className="mt-1 font-medium text-sb-ink">
              Private · Cloudinary delivery
            </p>
          </div>
        </div>
        <p className="text-xs text-sb-muted">
          Uploads must use Cloudinary. Paste the same CLOUDINARY_URL on localhost
          (.env.local) and Render (Environment). If status is error, open
          Cloudinary Dashboard → Settings → API Keys, copy a fresh API Key +
          Secret, update CLOUDINARY_URL, and restart both. Secrets are never
          shown in the browser.
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
