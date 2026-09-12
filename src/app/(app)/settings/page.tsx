import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { GoogleCalendarSettingsCard } from "@/components/settings/google-calendar-card";
import { MicrosoftTodoSettingsCard } from "@/components/settings/microsoft-todo-card";
import { requireSession } from "@/lib/session";
import { getPublicConnection } from "@/lib/google/calendar";
import { getPublicMicrosoftConnection } from "@/lib/microsoft/todo";
import { ROLE_HOME } from "@/lib/permissions";

export default async function StaffSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google?: string;
    microsoft?: string;
    message?: string;
  }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const [connection, microsoftTodo] = await Promise.all([
    getPublicConnection(session.user.id, session.membership.companyId),
    getPublicMicrosoftConnection(
      session.user.id,
      session.membership.companyId
    ),
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Connect your personal integrations for SUNBUILD"
        icon={<SettingsIcon size={18} />}
      />

      {googleFlash?.kind === "connected" ? (
        <p className="rounded-[10px] border border-sb-green/40 bg-sb-green-soft px-3 py-2 text-sm text-sb-ink">
          Google Calendar connected successfully
        </p>
      ) : null}
      {googleFlash?.kind === "disconnected" ? (
        <p className="rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-2 text-sm text-sb-ink">
          Google Calendar disconnected. Local SUNBUILD data was kept.
        </p>
      ) : null}
      {googleFlash?.kind === "error" ? (
        <p className="rounded-[10px] border border-sb-red/40 bg-sb-red-soft px-3 py-2 text-sm text-sb-ink">
          {googleFlash.message || "Could not connect Google Calendar"}
        </p>
      ) : null}
      {microsoftFlash?.kind === "connected" ? (
        <p className="rounded-[10px] border border-sb-green/40 bg-sb-green-soft px-3 py-2 text-sm text-sb-ink">
          Microsoft To Do connected successfully
        </p>
      ) : null}
      {microsoftFlash?.kind === "disconnected" ? (
        <p className="rounded-[10px] border border-sb-border bg-sb-canvas px-3 py-2 text-sm text-sb-ink">
          Microsoft To Do disconnected. SUNBUILD project tasks were kept.
        </p>
      ) : null}
      {microsoftFlash?.kind === "error" ? (
        <p className="rounded-[10px] border border-sb-red/40 bg-sb-red-soft px-3 py-2 text-sm text-sb-ink">
          {microsoftFlash.message || "Could not connect Microsoft To Do"}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-sb-ink">Integrations</h2>
        <GoogleCalendarSettingsCard
          connection={connection}
          canManage
          returnTo="/settings"
        />
        <MicrosoftTodoSettingsCard
          connection={microsoftTodo}
          canManage
          returnTo="/settings"
        />
        <p className="text-[12px] text-sb-muted">
          Tasks assigned to you (with a due date) and meetings you sync will
          appear on your connected Google Calendar. High-importance Microsoft To
          Do tasks appear in High Priority on the owner dashboard.
        </p>
        <p className="text-[12px] text-sb-muted">
          Home:{" "}
          <a
            href={ROLE_HOME[session.membership.role]}
            className="text-sb-ink underline"
          >
            Back to dashboard
          </a>
        </p>
      </section>
    </div>
  );
}
