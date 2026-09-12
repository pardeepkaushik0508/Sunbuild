"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { assertPasswordMeetsPolicy } from "@/lib/settings/validation";
import type { PasswordPolicy } from "@/lib/settings/types";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/settings/defaults";
import { useOptionalToast } from "@/components/ui/toast";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useOptionalToast();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);
  const [policyReady, setPolicyReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/password-policy")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPolicy({
          minLength: Number(data.minLength) || DEFAULT_PASSWORD_POLICY.minLength,
          requireUppercase: Boolean(data.requireUppercase),
          requireLowercase: Boolean(data.requireLowercase),
          requireNumber: Boolean(data.requireNumber),
          requireSpecial: Boolean(data.requireSpecial),
        });
        setPolicyReady(true);
      })
      .catch(() => {
        if (!cancelled) setPolicyReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const policyError = assertPasswordMeetsPolicy(password, policy);
    if (policyError) {
      setError(policyError);
      toast?.error(policyError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      toast?.error("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Invalid or expired reset link");
      toast?.error("Invalid or expired reset link");
      return;
    }
    setLoading(true);
    const res = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);
    if (res.error) {
      setError("Invalid or expired reset link");
      toast?.error("Invalid or expired reset link");
      return;
    }
    toast?.success("Password updated");
    router.push("/login");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-sb-black">
        Reset password
      </h1>
      <p className="mt-3 text-sm text-sb-muted">
        Choose a new password. This link expires after one hour and can only be
        used once. Existing sessions will be signed out after a successful
        reset.
      </p>
      {policyReady ? (
        <p className="mt-2 text-xs text-sb-muted">
          Requirements: min {policy.minLength} characters
          {policy.requireUppercase ? ", uppercase" : ""}
          {policy.requireLowercase ? ", lowercase" : ""}
          {policy.requireNumber ? ", number" : ""}
          {policy.requireSpecial ? ", special character" : ""}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-sb-muted">Loading password requirements…</p>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <FormField label="New password" required>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={policy.minLength}
            autoComplete="new-password"
            disabled={!policyReady}
          />
        </FormField>
        <FormField label="Confirm password" required>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={policy.minLength}
            autoComplete="new-password"
            disabled={!policyReady}
          />
        </FormField>
        {error ? <p className="text-sm text-sb-red">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || !token || !policyReady}
        >
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/login">
          <Button variant="outline">Sign in</Button>
        </Link>
        <Link href="/forgot-password">
          <Button variant="outline">Request a new link</Button>
        </Link>
      </div>
    </Card>
  );
}
