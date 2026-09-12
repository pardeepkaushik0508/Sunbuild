"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { updateTaskStatusAction } from "@/lib/actions";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";
import { isNextNavigationError } from "@/lib/navigation-errors";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: TaskStatus.TODO, label: "To do" },
  { value: TaskStatus.IN_PROGRESS, label: "In progress" },
  { value: TaskStatus.BLOCKED, label: "Blocked" },
  { value: TaskStatus.DONE, label: "Done" },
  { value: TaskStatus.CANCELLED, label: "Cancelled" },
];

function statusSelectClass(status: TaskStatus) {
  switch (status) {
    case TaskStatus.DONE:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case TaskStatus.IN_PROGRESS:
      return "border-sky-200 bg-sky-50 text-sky-800";
    case TaskStatus.BLOCKED:
      return "border-red-200 bg-red-50 text-red-800";
    case TaskStatus.CANCELLED:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
}

export function TaskStatusSelect({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [pending, startTransition] = useTransition();

  function onChange(next: TaskStatus) {
    if (next === status) return;
    startTransition(async () => {
      try {
        await updateTaskStatusAction(taskId, next);
        toast?.success(
          next === TaskStatus.DONE
            ? "Task marked done"
            : next === TaskStatus.IN_PROGRESS
              ? "Task set to in progress"
              : "Task status updated"
        );
        router.refresh();
      } catch (err) {
        if (isNextNavigationError(err)) throw err;
        toast?.error(toSafeErrorMessage(err));
      }
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      aria-label="Task status"
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      className={cn(
        "h-8 max-w-[10.5rem] rounded-[8px] border px-2 text-[11px] font-semibold uppercase tracking-wide outline-none disabled:opacity-60",
        statusSelectClass(status)
      )}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
