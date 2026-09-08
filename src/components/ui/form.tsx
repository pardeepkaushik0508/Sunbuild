import { cn } from "@/lib/utils";
import {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

export function Label({
  children,
  htmlFor,
  className,
  required,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-sm font-medium text-sb-ink", className)}
    >
      {children}
      {required ? <span className="ml-0.5 text-[#dc2626]">*</span> : null}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20 disabled:bg-sb-canvas",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[10px] border border-sb-border bg-white px-3 py-2 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormField({
  label,
  children,
  error,
  className,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  className?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label required={required}>{label}</Label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-sb-muted">{hint}</p>
      ) : null}
      {error ? <p className="text-xs text-[#dc2626]">{error}</p> : null}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-[#dc2626]">{message}</p>;
}
