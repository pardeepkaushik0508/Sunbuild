import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff6cc,_#f7f7f5_45%)] px-4 py-10">
      <Suspense fallback={<p className="text-sm text-sb-muted">Loading…</p>}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
