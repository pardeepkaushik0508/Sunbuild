import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  default: "bg-sb-canvas text-sb-ink border-sb-border",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-sb-red border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  yellow: "bg-sb-yellow-soft text-sb-ink border-sb-yellow/50",
  orange: "bg-sb-orange-soft text-sb-orange-dark border-sb-orange/30",
};

export function StatusBadge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone] ?? tones.default,
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof tones {
  const s = status.toUpperCase();
  if (
    [
      "DONE",
      "COMPLETED",
      "APPROVED",
      "PAID",
      "RECEIVED",
      "SATISFIED",
      "LOCKED",
      "CLOSED",
      "RESOLVED",
      "WON",
      "ACTIVE",
    ].includes(s)
  )
    return "success";
  if (
    [
      "PENDING",
      "PENDING_CLIENT",
      "IN_REVIEW",
      "UNDER_REVIEW",
      "DUE",
      "OPEN",
      "TODO",
      "DRAFT",
      "SENT",
      "MEDIUM",
      "MED",
    ].includes(s)
  )
    return "warning";
  if (
    [
      "OVERDUE",
      "DELAYED",
      "REJECTED",
      "CANCELLED",
      "FAILED",
      "BLOCKED",
      "VOID",
      "LOST",
      "HIGH",
      "URGENT",
    ].includes(s)
  )
    return "danger";
  if (["IN_PROGRESS", "ASSIGNED", "SUBMITTED"].includes(s)) return "info";
  if (
    [
      "PRE_CONSTRUCTION",
      "SUBSTANTIAL_COMPLETION",
      "PENDING_CEO_APPROVAL",
      "ON_HOLD",
    ].includes(s)
  )
    return s === "PRE_CONSTRUCTION" ? "default" : "warning";
  if (["HANDED_OVER"].includes(s)) return "success";
  return "default";
}
