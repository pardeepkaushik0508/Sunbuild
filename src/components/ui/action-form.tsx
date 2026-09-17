"use client";

import { FormHTMLAttributes, useCallback } from "react";
import { toSafeErrorMessage } from "@/lib/errors";
import { isNextNavigationError } from "@/lib/navigation-errors";
import { useOptionalToast } from "@/components/ui/toast";

type ServerAction = (formData: FormData) => Promise<unknown>;

type ActionFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  action: ServerAction;
  /** Shown after a successful non-redirecting action. */
  successMessage?: string;
};

/**
 * Client form wrapper for server actions.
 * - Disables submit via SubmitButton + useFormStatus while pending
 * - Shows success/error toasts
 * - Re-throws Next.js redirect/notFound so navigation still works
 */
export function ActionForm({
  action,
  successMessage,
  children,
  onSubmit,
  ...props
}: ActionFormProps) {
  const toast = useOptionalToast();

  const formAction = useCallback(
    async (formData: FormData) => {
      try {
        const res = (await action(formData)) as
          | { error?: string; success?: boolean }
          | undefined;
        if (res && typeof res === "object" && "error" in res && res.error) {
          toast?.error(toSafeErrorMessage(res.error));
          return;
        }
        if (successMessage) {
          toast?.success(successMessage);
        }
      } catch (err) {
        if (isNextNavigationError(err)) {
          throw err;
        }
        toast?.error(toSafeErrorMessage(err));
      }
    },
    [action, successMessage, toast]
  );

  return (
    <form
      {...props}
      action={formAction}
      onSubmit={(e) => {
        // Let React handle the action; callers may still observe the event.
        onSubmit?.(e);
        if (e.defaultPrevented) return;
      }}
    >
      {children}
    </form>
  );
}
