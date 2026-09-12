"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Submit button that auto-disables while a parent `<form action>` is pending.
 * Use inside ActionForm or any form that uses React's form action API.
 */
export function SubmitButton({
  children,
  pendingLabel = "Please wait…",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<ButtonProps, "type"> & {
    pendingLabel?: string;
  }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
