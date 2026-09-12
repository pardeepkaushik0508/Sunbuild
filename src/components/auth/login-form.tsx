"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/layout/brand-logo";
import { useOptionalToast } from "@/components/ui/toast";
import { safeInternalPath } from "@/lib/safe-redirect";
import { pushWithProgress } from "@/lib/navigate";

type Step = "credentials" | "totp";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useOptionalToast();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = safeInternalPath(params.get("next"), "/");

  async function finishLogin() {
    pushWithProgress(router, nextPath);
    router.refresh();
  }

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        setError("Invalid credentials");
        toast?.error("Invalid credentials");
        return;
      }
      const data = res.data as { twoFactorRedirect?: boolean } | null;
      if (data?.twoFactorRedirect) {
        setStep("totp");
        setTotpCode("");
        setUseBackup(false);
        return;
      }
      await finishLogin();
    } catch {
      setError("Invalid credentials");
      toast?.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const code = totpCode.trim();
    try {
      if (useBackup) {
        const res = await authClient.twoFactor.verifyBackupCode({ code });
        if (res.error) {
          const msg = res.error.message || "Invalid backup code";
          setError(msg);
          toast?.error(msg);
          return;
        }
      } else {
        const res = await authClient.twoFactor.verifyTotp({ code });
        if (res.error) {
          const msg = res.error.message || "Invalid authenticator code";
          setError(msg);
          toast?.error(msg);
          return;
        }
      }
      await finishLogin();
    } catch {
      const msg = useBackup
        ? "Invalid backup code"
        : "Invalid authenticator code";
      setError(msg);
      toast?.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-8">
      <div className="mb-8 text-center">
        <BrandLogo
          href={null}
          className="justify-center"
          wordmarkClassName="text-4xl"
        />
        <p className="mt-2 text-sm text-sb-muted">
          Sunview Homes construction CRM
        </p>
      </div>

      {step === "credentials" ? (
        <form onSubmit={onSubmitCredentials} className="space-y-4">
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </FormField>
          <FormField label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </FormField>
          {error ? <p className="text-sm text-sb-red">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmitTotp} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-sb-ink">
              Two-factor authentication
            </h2>
            <p className="mt-1 text-sm text-sb-muted">
              {useBackup
                ? "Enter one of your backup codes to continue."
                : "Enter the code from your authenticator app."}
            </p>
          </div>
          <FormField
            label={useBackup ? "Backup code" : "Authenticator code"}
            required
          >
            <Input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder={useBackup ? "XXXXX-XXXXX" : "12345678"}
            />
          </FormField>
          {error ? <p className="text-sm text-sb-red">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || totpCode.trim().length < 6}
          >
            {loading ? "Verifying..." : "Verify & continue"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="text-sb-muted underline hover:text-sb-ink"
              onClick={() => {
                setUseBackup((v) => !v);
                setTotpCode("");
                setError(null);
              }}
            >
              {useBackup ? "Use authenticator code" : "Use a backup code"}
            </button>
            <button
              type="button"
              className="text-sb-muted underline hover:text-sb-ink"
              onClick={() => {
                setStep("credentials");
                setTotpCode("");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </form>
      )}

      {step === "credentials" ? (
        <p className="mt-4 text-center text-sm text-sb-muted">
          <Link href="/forgot-password" className="underline">
            Forgot password?
          </Link>
        </p>
      ) : null}
    </Card>
  );
}
