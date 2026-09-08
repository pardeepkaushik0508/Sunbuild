import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ffedd5_0%,_#f9fafb_42%,_#f9fafb_100%)] px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
