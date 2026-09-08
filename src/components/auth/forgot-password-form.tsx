"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      // Better Auth: POST /request-password-reset — always treat as success for UX
      await authClient.requestPasswordReset({
        email,
        redirectTo,
      });
    } catch {
      // Still show generic success — no account enumeration
    }
    setDone(true);
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-md p-8">
      <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-sb-black">
        Forgot password?
      </h1>
      <p className="mt-3 text-sm text-sb-muted">
        Enter your account email. If an account exists, we will send a password
        reset link to that address.
      </p>
      {done ? (
        <p className="mt-6 text-sm text-sb-ink">
          If an account exists for that email, password reset instructions have
          been sent. Check your inbox and spam folder. The link expires in one
          hour.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm underline">
        Back to login
      </Link>
    </Card>
  );
}
