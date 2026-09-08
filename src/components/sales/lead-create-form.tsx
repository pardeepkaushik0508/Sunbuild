"use client";

import { createLeadAction } from "@/lib/actions";
import { leadFormSchema } from "@/lib/validation";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  FormAlert,
  RequiredLegend,
  useValidatedAction,
} from "@/components/ui/validated-form";
import { LeadStatus } from "@prisma/client";

export function LeadCreateForm({
  assignees,
}: {
  assignees: Array<{ id: string; name: string }>;
}) {
  const { onSubmit, errors, formError, pending } = useValidatedAction(
    leadFormSchema,
    createLeadAction
  );

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2" noValidate>
      <RequiredLegend />
      <FormAlert error={formError} />
      <FormField label="First name" required error={errors.firstName}>
        <Input name="firstName" autoComplete="given-name" />
      </FormField>
      <FormField label="Last name" required error={errors.lastName}>
        <Input name="lastName" autoComplete="family-name" />
      </FormField>
      <FormField label="Email" error={errors.email} hint="Optional, must be valid if provided">
        <Input name="email" type="email" autoComplete="email" />
      </FormField>
      <FormField label="Phone" error={errors.phone} hint="Optional, include country/area code">
        <Input name="phone" type="tel" autoComplete="tel" />
      </FormField>
      <FormField label="Address" className="md:col-span-2" error={errors.address}>
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
        <Input name="estimatedValue" type="number" min="0" step="0.01" placeholder="Optional" />
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
      <FormField label="Notes" className="md:col-span-2" error={errors.notes}>
        <Textarea name="notes" rows={3} />
      </FormField>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Create lead"}
        </Button>
      </div>
    </form>
  );
}
