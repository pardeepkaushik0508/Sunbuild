import { Role } from "@prisma/client";
import { Settings as SettingsIcon } from "lucide-react";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { PageHeader } from "@/components/ui/card";
import { SettingsDashboard } from "@/components/settings/settings-dashboard";
import { buildProjectInsights, depositOpenStatuses } from "@/lib/insights";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings/store";
import { canEditSettings } from "@/lib/permissions";
import { getPublicConnection } from "@/lib/google/calendar";
import { getPublicMicrosoftConnection } from "@/lib/microsoft/todo";

export default async function OwnerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google?: string;
    microsoft?: string;
    message?: string;
  }>;
}) {
  const session = await requireRole(Role.OWNER);
  const companyId = session.membership.companyId;
  const sp = await searchParams;

  let settings;
  let loadError: string | null = null;
  try {
    settings = await getCompanySettings(companyId);
  } catch {
    loadError = "Unable to load settings. Please try again.";
    settings = null;
  }

  const [googleCalendar, microsoftTodo] = await Promise.all([
    getPublicConnection(session.user.id, companyId),
    getPublicMicrosoftConnection(session.user.id, companyId),
  ]);

  const googleFlash =
    sp.google === "connected"
      ? ({ kind: "connected" } as const)
      : sp.google === "disconnected"
        ? ({ kind: "disconnected" } as const)
        : sp.google === "error"
          ? ({
              kind: "error",
              message: sp.message
                ? decodeURIComponent(sp.message).slice(0, 180)
                : undefined,
            } as const)
          : null;

  const microsoftFlash =
    sp.microsoft === "connected"
      ? ({ kind: "connected" } as const)
      : sp.microsoft === "disconnected"
        ? ({ kind: "disconnected" } as const)
        : sp.microsoft === "error"
          ? ({
              kind: "error",
              message: sp.message
                ? decodeURIComponent(sp.message).slice(0, 180)
                : undefined,
            } as const)
          : null;

  const [delayed, depositSum, docs] = await Promise.all([
    prisma.scheduleItem.count({
      where: {
        status: "DELAYED",
        project: { companyId },
      },
    }),
    prisma.deposit.aggregate({
      where: {
        project: { companyId },
        status: { in: depositOpenStatuses() },
      },
      _sum: { amount: true },
    }),
    prisma.document.count({ where: { project: { companyId } } }),
  ]);

  const insights = buildProjectInsights({
    delayedScheduleCount: delayed,
    expectedDepositAmount: depositSum._sum.amount ?? 0,
    pendingDocCount: Math.min(docs, 12),
  });

  const canEdit = canEditSettings(
    session.membership.role,
    session.membership.canEditSettings
  );
  const canEditSecurity = session.membership.role === Role.OWNER && canEdit;
  const canEditOperational =
    (session.membership.role === Role.OWNER ||
      session.membership.role === Role.OPERATIONS_ADMIN) &&
    canEdit;

  return (
    <div className="space-y-5">
      <OwnerTabs />
      <PageHeader
        title="Settings"
        description={`Workspace configuration for ${session.membership.companyName}`}
        icon={<SettingsIcon size={18} />}
      />

      {loadError || !settings ? (
        <div className="sb-card p-6 text-center">
          <p className="text-sm font-medium text-sb-ink">
            {loadError ?? "Settings unavailable"}
          </p>
          <p className="mt-2 text-sm text-sb-muted">
            Refresh the page or contact support if this continues.
          </p>
        </div>
      ) : (
        <SettingsDashboard
          initialSettings={settings}
          insights={insights}
          canEditSecurity={canEditSecurity}
          canEditOperational={canEditOperational}
          googleCalendar={googleCalendar}
          googleFlash={googleFlash}
          microsoftTodo={microsoftTodo}
          microsoftFlash={microsoftFlash}
        />
      )}
    </div>
  );
}
