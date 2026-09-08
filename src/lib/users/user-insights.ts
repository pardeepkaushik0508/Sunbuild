import type { InsightCard } from "@/components/dashboard/ai-insights";

type BuildUserInsightsInput = {
  pendingInviteCount: number;
  inactivePrivilegedCount: number;
  overloadedAssignmentCount: number;
  inactiveUserCount: number;
};

/** Rule-based user-management insights (no LLM). */
export function buildUserInsights(
  input: BuildUserInsightsInput
): InsightCard[] {
  const insights: InsightCard[] = [];

  if (input.inactivePrivilegedCount > 0) {
    insights.push({
      id: "inactive-privileged",
      category: "Access Risk",
      severity: "HIGH",
      message: `${input.inactivePrivilegedCount} privileged account(s) are inactive — review ownership and project coverage.`,
      href: "/owner/users?status=INACTIVE",
      actionLabel: "Review",
    });
  }

  if (input.pendingInviteCount > 0) {
    insights.push({
      id: "pending-invites",
      category: "Invitations",
      severity: "MEDIUM",
      message: `${input.pendingInviteCount} pending invitation(s) waiting for acceptance.`,
      href: "/owner/users?status=INVITED",
      actionLabel: "View Invites",
    });
  }

  if (input.overloadedAssignmentCount > 0) {
    insights.push({
      id: "overloaded",
      category: "Staffing",
      severity: "NEW",
      message: `${input.overloadedAssignmentCount} user(s) have heavy project loads (8+). Consider redistributing work.`,
      href: "/owner/users?sort=name",
      actionLabel: "View Users",
    });
  }

  if (insights.length === 0 && input.inactiveUserCount > 0) {
    insights.push({
      id: "inactive-users",
      category: "Accounts",
      severity: "LOW",
      message: `${input.inactiveUserCount} inactive account(s) on file. Clean up access when no longer needed.`,
      href: "/owner/users?status=INACTIVE",
      actionLabel: "Review",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "healthy",
      category: "Team Health",
      severity: "LOW",
      message: "User access looks healthy — no pending invites or privileged inactive accounts.",
      href: "/owner/permissions",
      actionLabel: "Permissions",
    });
  }

  return insights.slice(0, 3);
}
