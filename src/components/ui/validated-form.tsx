"use client";

import { useMemo, useState, useTransition } from "react";
import { ZodTypeAny } from "zod";
import { formDataToObject, zodErrorMap } from "@/lib/validation";
import { toSafeErrorMessage } from "@/lib/errors";
import { isNextNavigationError } from "@/lib/navigation-errors";
import { useOptionalToast } from "@/components/ui/toast";

/**
 * Client-side validation wrapper for server actions.
 * Shows field errors, disables submit while pending, and toasts results.
 */
export function useValidatedAction<TSchema extends ZodTypeAny>(
  schema: TSchema,
  action: (formData: FormData) => Promise<unknown>,
  options?: { successMessage?: string }
) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useOptionalToast();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = schema.safeParse(formDataToObject(fd));
    if (!parsed.success) {
      setErrors(zodErrorMap(parsed.error));
      setFormError("Please fix the highlighted fields.");
      toast?.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      try {
        await action(fd);
        if (options?.successMessage) {
          toast?.success(options.successMessage);
        }
      } catch (err) {
        if (isNextNavigationError(err)) {
          throw err;
        }
        const message = toSafeErrorMessage(err);
        setFormError(message);
        toast?.error(message);
      }
    });
  }

  return { onSubmit, errors, formError, pending, setErrors, setFormError };
}

export function FormAlert({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  const message = error || success;
  const tone = error
    ? "border-red-200 bg-red-50 text-[#dc2626]"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (!message) return null;
  return (
    <div className={`rounded-[10px] border px-3 py-2 text-sm ${tone}`}>
      {message}
    </div>
  );
}

export function useClearErrorOnChange(
  errors: Record<string, string>,
  setErrors: (v: Record<string, string>) => void
) {
  return useMemo(
    () => (name: string) => {
      if (!errors[name]) return;
      const next = { ...errors };
      delete next[name];
      setErrors(next);
    },
    [errors, setErrors]
  );
}

export function RequiredLegend() {
  return (
    <p className="text-xs text-sb-muted">
      Fields marked with <span className="text-[#dc2626]">*</span> are required.
    </p>
  );
}
