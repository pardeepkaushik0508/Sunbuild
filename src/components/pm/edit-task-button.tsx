"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Priority, TaskStatus } from "@prisma/client";
import { Pencil, X } from "lucide-react";
import { updateTaskAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";
import { isNextNavigationError } from "@/lib/navigation-errors";

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  priority: Priority;
  status: TaskStatus;
  assigneeId: string | null;
  startDate: string;
  dueDate: string;
};

function toDateInputValue(isoOrEmpty: string) {
  if (!isoOrEmpty) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrEmpty)) return isoOrEmpty.slice(0, 10);
  return "";
}

/** Compact edit control — status changes live in the Status column dropdown. */
export function EditTaskButton({
  task,
  projects,
  assignees,
}: {
  task: EditableTask;
  projects: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useOptionalToast();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);

  async function onSubmit(formData: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      formData.set("taskId", task.id);
      await updateTaskAction(formData);
      toast?.success("Task updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (isNextNavigationError(err)) throw err;
      toast?.error(toSafeErrorMessage(err));
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-sb-muted hover:bg-sb-canvas hover:text-sb-ink"
        aria-label={`Edit ${task.title}`}
        title="Edit task"
      >
        <Pencil size={14} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-task-${task.id}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                id={`edit-task-${task.id}`}
                className="text-lg font-semibold text-sb-ink"
              >
                Edit task
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form ref={formRef} action={onSubmit} className="grid gap-4">
              <FormField label="Project" required>
                <Select name="projectId" required defaultValue={task.projectId}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Title" required>
                <Input name="title" required defaultValue={task.title} />
              </FormField>
              <FormField label="Description">
                <Textarea
                  name="description"
                  defaultValue={task.description ?? ""}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Priority">
                  <Select name="priority" defaultValue={task.priority}>
                    {Object.values(Priority).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Status">
                  <Select name="status" defaultValue={task.status}>
                    {Object.values(TaskStatus).map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField label="Subcontractor">
                <Select name="assigneeId" defaultValue={task.assigneeId ?? ""}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Start date">
                  <Input
                    name="startDate"
                    type="date"
                    defaultValue={toDateInputValue(task.startDate)}
                  />
                </FormField>
                <FormField label="Due date">
                  <Input
                    name="dueDate"
                    type="date"
                    defaultValue={toDateInputValue(task.dueDate)}
                  />
                </FormField>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
