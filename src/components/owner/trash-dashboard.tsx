"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { useOptionalToast } from "@/components/ui/toast";
import { ROLE_LABELS } from "@/lib/permissions";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import {
  restoreUserAction,
  restoreProjectAction,
  permanentlyDeleteUserAction,
  permanentlyDeleteProjectAction,
} from "@/lib/trash/actions";
import type { TrashData } from "@/lib/trash/load-trash";

export function TrashDashboard({ data }: { data: TrashData }) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [pending, startTransition] = useTransition();

  function run(
    label: string,
    action: () => Promise<{ ok: true }>,
    confirmMsg: string
  ) {
    if (!window.confirm(confirmMsg)) return;
    startTransition(async () => {
      try {
        await action();
        toast?.success(label);
        router.refresh();
      } catch (err) {
        toast?.error(toSafeErrorMessage(err));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Soft-deleted users and projects stay here for{" "}
            <strong>{data.retentionDays} days</strong>, then are permanently
            removed automatically. You can restore or permanently delete anytime.
            Deleted users cannot sign in. Deleted projects are hidden from every
            role.
          </p>
        </div>
      </div>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-sb-ink">
          Deleted users ({data.users.length})
        </h2>
        {data.users.length === 0 ? (
          <EmptyState title="No users in Trash" description="Deleted users will appear here." />
        ) : (
          <div className="divide-y divide-sb-border overflow-hidden rounded-lg border border-sb-border">
            {data.users.map((u) => (
              <div
                key={u.id}
                className="flex flex-col gap-3 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sb-ink">{u.name}</p>
                  <p className="truncate text-xs text-sb-muted">{u.email}</p>
                  <p className="mt-1 text-[11px] text-sb-muted">
                    {u.role ? ROLE_LABELS[u.role as Role] ?? u.role : "—"} · Deleted{" "}
                    {formatDate(u.deletedAt)} · {u.daysLeft}d left
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        "User restored",
                        () => restoreUserAction(u.id),
                        `Restore ${u.name}? They will be able to sign in again.`
                      )
                    }
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() =>
                      run(
                        "User permanently deleted",
                        () => permanentlyDeleteUserAction(u.id),
                        `Permanently delete ${u.name}? This cannot be undone.`
                      )
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-sb-ink">
          Deleted projects ({data.projects.length})
        </h2>
        {data.projects.length === 0 ? (
          <EmptyState
            title="No projects in Trash"
            description="Deleted projects will appear here."
          />
        ) : (
          <div className="divide-y divide-sb-border overflow-hidden rounded-lg border border-sb-border">
            {data.projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sb-ink">{p.name}</p>
                  <p className="mt-1 text-[11px] text-sb-muted">
                    {p.status.replace(/_/g, " ")} · Deleted {formatDate(p.deletedAt)} ·{" "}
                    {p.daysLeft}d left
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        "Project restored",
                        () => restoreProjectAction(p.id),
                        `Restore project "${p.name}"? It will be visible again.`
                      )
                    }
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() =>
                      run(
                        "Project permanently deleted",
                        () => permanentlyDeleteProjectAction(p.id),
                        `Permanently delete project "${p.name}" and remove it from the database? This cannot be undone.`
                      )
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
