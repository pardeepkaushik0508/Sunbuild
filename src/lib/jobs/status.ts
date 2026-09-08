import { ProjectStatus } from "@prisma/client";

/** Human labels matching Jobs Management PDF badges. */
export function projectStatusLabel(status: ProjectStatus | string): string {
  switch (status) {
    case ProjectStatus.PRE_CONSTRUCTION:
      return "Planning";
    case ProjectStatus.IN_PROGRESS:
      return "IN PROGRESS";
    case ProjectStatus.SUBSTANTIAL_COMPLETION:
      return "Substantial Completion";
    case ProjectStatus.PENDING_CEO_APPROVAL:
      return "Pending CEO Approval";
    case ProjectStatus.COMPLETED:
      return "Completed";
    case ProjectStatus.HANDED_OVER:
      return "Handed Over";
    case ProjectStatus.ON_HOLD:
      return "On Hold";
    case ProjectStatus.CANCELLED:
      return "Cancelled";
    default:
      return String(status).replace(/_/g, " ");
  }
}

/**
 * PDF badge styles for project statuses — keep consistent across SUNBUILD.
 */
export function projectStatusBadgeClass(
  status: ProjectStatus | string
): string {
  switch (status) {
    case ProjectStatus.IN_PROGRESS:
    case ProjectStatus.SUBSTANTIAL_COMPLETION:
      return "border-transparent bg-[#facc15] text-sb-ink";
    case ProjectStatus.PRE_CONSTRUCTION:
      return "border-transparent bg-sb-ink text-white";
    case ProjectStatus.PENDING_CEO_APPROVAL:
      return "border-amber-200 bg-amber-50 text-amber-800";
    case ProjectStatus.COMPLETED:
    case ProjectStatus.HANDED_OVER:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case ProjectStatus.ON_HOLD:
      return "border-sb-border bg-sb-canvas text-sb-muted";
    case ProjectStatus.CANCELLED:
      return "border-red-200 bg-red-50 text-sb-red";
    default:
      return "border-sb-border bg-sb-canvas text-sb-ink";
  }
}

/** Extend shared statusTone mapping for ProjectStatus values. */
export function projectStatusTone(
  status: ProjectStatus | string
): "default" | "success" | "warning" | "danger" | "info" | "yellow" {
  switch (status) {
    case ProjectStatus.IN_PROGRESS:
    case ProjectStatus.SUBSTANTIAL_COMPLETION:
      return "yellow";
    case ProjectStatus.PRE_CONSTRUCTION:
      return "default";
    case ProjectStatus.PENDING_CEO_APPROVAL:
      return "warning";
    case ProjectStatus.COMPLETED:
    case ProjectStatus.HANDED_OVER:
      return "success";
    case ProjectStatus.CANCELLED:
      return "danger";
    case ProjectStatus.ON_HOLD:
      return "default";
    default:
      return "default";
  }
}
