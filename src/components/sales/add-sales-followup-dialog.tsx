"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Priority } from "@prisma/client";
import { X } from "lucide-react";
import { createSalesFollowUpAction } from "@/lib/sales/follow-up-actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";

export function AddSalesFollowUpDialog({
  open,
  onClose,
  leads,
  assignees,
}: {
  open: boolean;
  onClose: () => void;
  leads: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);

  if (!open) return null;

  async function onSubmit(formData: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      await createSalesFollowUpAction(formData);
      formRef.current?.reset();
      onClose();
      router.refresh();
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-sales-followup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="add-sales-followup-title"
            className="text-lg font-semibold text-sb-ink"
          >
            Add Follow-up
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
          <FormField label="Title" required>
            <Input name="title" required placeholder="Follow-up title" />
          </FormField>
          <FormField label="Related lead" required>
            <Select name="leadId" required defaultValue={leads[0]?.id ?? ""}>
              <option value="" disabled>
                Select lead
              </option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description">
            <Textarea name="description" placeholder="Optional details" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Due date" required>
              <Input name="dueDate" type="date" required />
            </FormField>
            <FormField label="Time">
              <Input name="dueTime" type="time" />
            </FormField>
          </div>
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
            <FormField label="Activity type">
              <Select name="activityType" defaultValue="FOLLOW_UP">
                <option value="FOLLOW_UP">Follow-up</option>
                <option value="CALL">Call</option>
                <option value="MEETING">Meeting</option>
                <option value="SITE_VISIT">Site visit</option>
                <option value="PROPOSAL">Proposal follow-up</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Assignee">
            <Select name="assigneeId" defaultValue="">
              <option value="">Current user</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save follow-up</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
