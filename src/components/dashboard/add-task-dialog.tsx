"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Priority } from "@prisma/client";
import { X } from "lucide-react";
import { createTaskAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";
import { isNextNavigationError } from "@/lib/navigation-errors";

export function AddTaskDialog({
  open,
  onClose,
  projects,
  assignees,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; name: string }>;
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);

  if (!open) return null;

  async function onSubmit(formData: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      await createTaskAction(formData);
      formRef.current?.reset();
      toast?.success("Task created");
      onClose();
      router.refresh();
    } catch (err) {
      if (isNextNavigationError(err)) throw err;
      toast?.error(toSafeErrorMessage(err));
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="add-task-title" className="text-lg font-semibold text-sb-ink">
            Add New Task
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form ref={formRef} action={onSubmit} className="grid gap-4">
          <FormField label="Project" required>
            <Select
              name="projectId"
              required
              defaultValue={defaultProjectId ?? projects[0]?.id ?? ""}
            >
              <option value="" disabled>
                Select project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title" required>
            <Input name="title" required placeholder="Task title" />
          </FormField>
          <FormField label="Description">
            <Textarea name="description" placeholder="Optional details" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <Select name="priority" defaultValue={Priority.MEDIUM}>
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Subcontractor">
              <Select name="assigneeId" defaultValue="">
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date">
              <Input name="startDate" type="date" />
            </FormField>
            <FormField label="Due date">
              <Input name="dueDate" type="date" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save task</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
