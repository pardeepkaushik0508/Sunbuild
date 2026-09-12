"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ProjectStatus } from "@prisma/client";
import { configureProjectAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { useOptionalToast } from "@/components/ui/toast";
import { projectStatusLabel } from "@/lib/jobs/status";
import { toSafeErrorMessage } from "@/lib/errors";
import type { JobsListItem } from "@/lib/jobs/load-jobs";

function toInputDate(date: Date | null) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ConfigureJobDialog({
  open,
  onClose,
  job,
  projectManagers,
  statuses,
}: {
  open: boolean;
  onClose: () => void;
  job: JobsListItem;
  projectManagers: Array<{ id: string; name: string }>;
  statuses: ProjectStatus[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useOptionalToast();

  if (!open) return null;

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await configureProjectAction(formData);
        toast?.success("Project updated");
        onClose();
        router.refresh();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to save configuration";
        setError(message);
        toast?.error(toSafeErrorMessage(e));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="configure-job-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="configure-job-title"
            className="text-lg font-semibold text-sb-ink"
          >
            Configure Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form ref={formRef} action={onSubmit} className="grid gap-4">
          <input type="hidden" name="projectId" value={job.id} />

          <FormField label="Project name" required>
            <Input name="name" required defaultValue={job.name} maxLength={160} />
          </FormField>

          <FormField label="Project Manager">
            <Select name="pmId" defaultValue={job.pmId ?? ""}>
              <option value="">Unassigned</option>
              {projectManagers.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Status" required>
            <Select name="status" required defaultValue={job.status}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Deadline">
            <Input
              name="targetClosing"
              type="date"
              defaultValue={toInputDate(job.deadline)}
            />
          </FormField>

          <FormField label="Total budget (CAD)">
            <Input
              name="purchasePrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={job.hasBudget ? job.budgetTotal : ""}
              placeholder="Purchase / project budget"
            />
          </FormField>

          <p className="text-xs text-sb-muted">
            Progress updates automatically from tasks, milestones, and schedule.
            Current: {job.progressPercent}%
          </p>

          {error ? (
            <p className="text-sm text-sb-red" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
