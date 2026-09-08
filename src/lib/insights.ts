import { DepositStatus, ScheduleStatus } from "@prisma/client";
import type { InsightCard } from "@/components/dashboard/ai-insights";

type BuildInsightsInput = {
  delayedScheduleCount: number;
  expectedDepositAmount: number;
  pendingDocCount: number;
  overdueTaskCount?: number;
  openRfiCount?: number;
};

/** Rule-based insights that match the Figma AI Insights cards (no LLM). */
export function buildProjectInsights(input: BuildInsightsInput): InsightCard[] {
  const insights: InsightCard[] = [];

  if (input.delayedScheduleCount > 0 || (input.overdueTaskCount ?? 0) > 0) {
    insights.push({
      id: "quality-risk",
      category: "Quality Risk",
      severity: "HIGH",
      message:
        input.delayedScheduleCount > 0
          ? `${input.delayedScheduleCount} schedule item(s) delayed — weather or trade sequencing may impact critical path.`
          : `${input.overdueTaskCount} overdue task(s) may impact quality checkpoints.`,
      href: "/pm/schedule",
      actionLabel: "View Details",
    });
  }

  if (input.expectedDepositAmount > 0) {
    const amount = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(input.expectedDepositAmount);
    insights.push({
      id: "deposits",
      category: "Deposits",
      severity: "MEDIUM",
      message: `${amount} in client deposits expected`,
      href: "/bookkeeper/invoices",
      actionLabel: "Process",
    });
  }

  if (input.pendingDocCount > 0) {
    insights.push({
      id: "documents",
      category: "Documents",
      severity: "NEW",
      message: `${input.pendingDocCount} document(s) require review`,
      href: "/pm/documents",
      actionLabel: "Review",
    });
  }

  if (insights.length === 0 && (input.openRfiCount ?? 0) > 0) {
    insights.push({
      id: "rfis",
      category: "RFIs",
      severity: "NEW",
      message: `${input.openRfiCount} open RFI(s) waiting on response`,
      href: "/pm/rfis",
      actionLabel: "Review",
    });
  }

  return insights.slice(0, 3);
}

export function depositOpenStatuses(): DepositStatus[] {
  return [DepositStatus.PENDING, DepositStatus.DUE, DepositStatus.OVERDUE];
}

export function delayedScheduleStatuses(): ScheduleStatus[] {
  return [ScheduleStatus.DELAYED];
}
