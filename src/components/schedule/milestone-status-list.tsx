import { ScheduleStatus } from "@prisma/client";
import {
  updateMilestoneStatusAction,
  updateScheduleItemStatusAction,
} from "@/lib/actions";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolveScheduleDisplayStatus } from "@/lib/schedule/display-status";
import { formatDate } from "@/lib/utils";

type MilestoneRow = {
  id: string;
  title: string;
  status: ScheduleStatus;
  dueDate: Date | string | null;
  projectName: string;
};

type ScheduleRow = {
  id: string;
  title: string;
  status: ScheduleStatus;
  endDate: Date | string;
  projectName: string;
  trade?: string | null;
};

export function MilestoneStatusList({
  milestones,
  canManage = false,
}: {
  milestones: MilestoneRow[];
  canManage?: boolean;
}) {
  if (milestones.length === 0) return null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-sb-ink">Milestones</h2>
      <ul className="mt-4 space-y-2">
        {milestones.map((m) => {
          const display = resolveScheduleDisplayStatus(m.status, m.dueDate);
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-sb-border px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-sb-ink">{m.title}</p>
                <p className="text-xs text-sb-muted">{m.projectName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sb-muted">{formatDate(m.dueDate)}</span>
                <StatusBadge tone={statusTone(display)}>
                  {display.replace(/_/g, " ")}
                </StatusBadge>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.status !== ScheduleStatus.COMPLETED ? (
                      <form
                        action={updateMilestoneStatusAction.bind(
                          null,
                          m.id,
                          ScheduleStatus.COMPLETED
                        )}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          Mark complete
                        </Button>
                      </form>
                    ) : null}
                    {m.status !== ScheduleStatus.IN_PROGRESS ? (
                      <form
                        action={updateMilestoneStatusAction.bind(
                          null,
                          m.id,
                          ScheduleStatus.IN_PROGRESS
                        )}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          In progress
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ScheduleItemStatusList({
  items,
  canManage = false,
}: {
  items: ScheduleRow[];
  canManage?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-sb-ink">Schedule items</h2>
      <ul className="mt-4 space-y-2">
        {items.map((item) => {
          const display = resolveScheduleDisplayStatus(
            item.status,
            item.endDate
          );
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-sb-border px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-sb-ink">{item.title}</p>
                <p className="text-xs text-sb-muted">
                  {item.projectName}
                  {item.trade ? ` · ${item.trade}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sb-muted">
                  Due {formatDate(item.endDate)}
                </span>
                <StatusBadge tone={statusTone(display)}>
                  {display.replace(/_/g, " ")}
                </StatusBadge>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.status !== ScheduleStatus.COMPLETED ? (
                      <form
                        action={updateScheduleItemStatusAction.bind(
                          null,
                          item.id,
                          ScheduleStatus.COMPLETED
                        )}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          Mark complete
                        </Button>
                      </form>
                    ) : null}
                    {item.status !== ScheduleStatus.IN_PROGRESS ? (
                      <form
                        action={updateScheduleItemStatusAction.bind(
                          null,
                          item.id,
                          ScheduleStatus.IN_PROGRESS
                        )}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          In progress
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
