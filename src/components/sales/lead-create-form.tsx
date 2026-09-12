"use client";

import { useState } from "react";
import { LeadStatus } from "@prisma/client";
import { Plus, X } from "lucide-react";
import { createLeadAction } from "@/lib/actions";
import { leadFormSchema } from "@/lib/validation";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  FormAlert,
  RequiredLegend,
  useValidatedAction,
} from "@/components/ui/validated-form";

export function LeadCreateForm({
  assignees,
  onSuccess,
  onCancel,
}: {
  assignees: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { onSubmit, errors, formError, pending } = useValidatedAction(
    leadFormSchema,
    async (fd) => {
      await createLeadAction(fd);
      onSuccess?.();
    },
    { successMessage: "Lead created" }
  );

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-2"
      noValidate
    >
      <div className="sm:col-span-2 space-y-2">
        <RequiredLegend />
        <FormAlert error={formError} />
      </div>
      <FormField label="First name" required error={errors.firstName}>
        <Input name="firstName" autoComplete="given-name" />
      </FormField>
      <FormField label="Last name" required error={errors.lastName}>
        <Input name="lastName" autoComplete="family-name" />
      </FormField>
      <FormField
        label="Email"
        error={errors.email}
        hint="Optional, must be valid if provided"
      >
        <Input name="email" type="email" autoComplete="email" />
      </FormField>
      <FormField
        label="Phone"
        error={errors.phone}
        hint="Optional, include country/area code"
      >
        <Input name="phone" type="tel" autoComplete="tel" />
      </FormField>
      <FormField
        label="Address"
        className="sm:col-span-2"
        error={errors.address}
      >
        <Input name="address" />
      </FormField>
      <FormField label="Status" required error={errors.status}>
        <Select name="status" defaultValue={LeadStatus.NEW}>
          {Object.values(LeadStatus).map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Assignee" error={errors.assigneeId}>
        <Select name="assigneeId" defaultValue="">
          <option value="">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Estimated value" error={errors.estimatedValue}>
        <Input
          name="estimatedValue"
          type="number"
          min="0"
          step="0.01"
          placeholder="Optional"
        />
      </FormField>
      <FormField label="Source" error={errors.source}>
        <Input name="source" placeholder="Website, Referral, Walk-in…" />
      </FormField>
      <FormField label="Next action" error={errors.nextAction}>
        <Input name="nextAction" placeholder="e.g. Schedule site visit" />
      </FormField>
      <FormField label="Follow-up date" error={errors.followUpAt}>
        <Input name="followUpAt" type="date" />
      </FormField>
      <FormField label="Notes" className="sm:col-span-2" error={errors.notes}>
        <Textarea name="notes" rows={3} />
      </FormField>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 pt-1">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create lead"}
        </Button>
      </div>
    </form>
  );
}

export function LeadCreateDialog({
  assignees,
}: {
  assignees: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Create lead
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-lead-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-lead-title"
                  className="text-lg font-semibold text-sb-ink"
                >
                  Create lead
                </h2>
                <p className="mt-0.5 text-sm text-sb-muted">
                  Add a new opportunity to the sales pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <LeadCreateForm
              assignees={assignees}
              onCancel={() => setOpen(false)}
              onSuccess={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
