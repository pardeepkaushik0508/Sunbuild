"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ZodTypeAny } from "zod";
import { formDataToObject, zodErrorMap } from "@/lib/validation";

/**
 * Client-side validation wrapper for server actions.
 * Shows field errors and blocks submit when invalid.
 */
export function useValidatedAction<TSchema extends ZodTypeAny>(
  schema: TSchema,
  action: (formData: FormData) => Promise<unknown>
) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = schema.safeParse(formDataToObject(fd));
    if (!parsed.success) {
      setErrors(zodErrorMap(parsed.error));
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      try {
        await action(fd);
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : "Something went wrong."
        );
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
  const tone = error ? "border-red-200 bg-red-50 text-[#dc2626]" : "border-emerald-200 bg-emerald-50 text-emerald-700";
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
