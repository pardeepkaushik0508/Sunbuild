"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";
import { TotpQrCode } from "@/components/auth/totp-qr-code";
import { toSafeErrorMessage } from "@/lib/errors";

/**
 * TOTP enrollment for roles that require MFA under company policy.
 * Flow: inform → Enable MFA (QR) → verify code. No password re-prompt.
 */
export function MfaEnrollForm({
  required,
  alreadyEnabled,
}: {
  required: boolean;
  alreadyEnabled: boolean;
}) {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState("");
  const [uri, setUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showManualUri, setShowManualUri] = useState(false);

  async function enable() {
    setError(null);
    setLoading(true);
    try {
      // Session-authenticated enable (no password re-prompt after login).
      const res = await fetch("/api/account/mfa/enable", { method: "POST" });
      const data = (await res.json()) as {
        totpURI?: string;
        backupCodes?: string[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Unable to start MFA enrollment");
        return;
      }
      setUri(data.totpURI ?? null);
      setBackupCodes(data.backupCodes ?? []);
      setTotpCode("");
    } catch (e) {
      setError(toSafeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({
        code: totpCode.trim(),
      });
      if (res.error) {
        setError(res.error.message || "Invalid verification code");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(toSafeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (alreadyEnabled) {
    return (
      <Card className="mx-auto w-full max-w-lg p-6">
        <h1 className="text-xl font-semibold text-sb-ink">MFA enabled</h1>
        <p className="mt-2 text-sm text-sb-muted">
          Two-factor authentication is already active on your account.
        </p>
        <Button className="mt-4" variant="yellow" onClick={() => router.push("/")}>
          Continue
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold text-sb-ink">
        Set up two-factor authentication
      </h1>

      {!uri ? (
        <div className="space-y-4">
          <p className="text-sm text-sb-muted">
            {required
              ? "Your role requires two-factor authentication. Enable MFA to continue into your account."
              : "Add an authenticator app for stronger account protection."}
          </p>
          {error ? <p className="text-sm text-sb-red">{error}</p> : null}
          <Button
            variant="yellow"
            disabled={loading}
            onClick={() => void enable()}
          >
            {loading ? "Starting…" : "Enable MFA"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-sb-muted">
            Scan the QR code with your authenticator app, then enter the code to
            continue.
          </p>
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium text-sb-ink">
              Scan this QR code
            </p>
            <TotpQrCode uri={uri} size={220} />
            <button
              type="button"
              className="text-xs text-sb-muted underline hover:text-sb-ink"
              onClick={() => setShowManualUri((v) => !v)}
            >
              {showManualUri ? "Hide manual setup key" : "Can’t scan? Show manual URI"}
            </button>
            {showManualUri ? (
              <p className="break-all rounded-[10px] border border-sb-border bg-sb-canvas p-3 text-left text-xs text-sb-body">
                {uri}
              </p>
            ) : null}
          </div>

          {backupCodes.length ? (
            <div className="rounded-[10px] border border-sb-border p-3 text-xs">
              <p className="font-medium text-sb-ink">
                Backup codes (store safely)
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <FormField label="Authenticator code" required>
            <Input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter code from app"
              required
            />
          </FormField>
          {error ? <p className="text-sm text-sb-red">{error}</p> : null}
          <Button
            variant="yellow"
            disabled={loading || totpCode.trim().length < 6}
            onClick={() => void verify()}
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </Button>
        </div>
      )}
    </Card>
  );
}
