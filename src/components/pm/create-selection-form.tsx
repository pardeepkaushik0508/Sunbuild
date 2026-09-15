import { createSelectionAction } from "@/lib/pm/selection-actions";
import { Card } from "@/components/ui/card";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUploadField } from "@/components/ui/image-upload-field";

/**
 * PM creates a selection category with multiple client-facing options.
 * Each option can have its own images; shared gallery images also attach.
 */
export function CreateSelectionForm({
  projectId,
  projects,
}: {
  projectId: string;
  projects: Array<{ id: string; name: string }>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-sb-ink">Create Selection</h2>
      <p className="mt-1 text-sm text-sb-muted">
        Add options with photos. Clients choose from these options on their
        portal when the selection is client-visible.
      </p>
      <ActionForm
        action={createSelectionAction}
        successMessage="Selection created"
        encType="multipart/form-data"
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <FormField label="Project" required>
          <Select name="projectId" required defaultValue={projectId}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Selection title" required>
          <Input name="title" required placeholder="e.g. Kitchen Countertop" />
        </FormField>
        <FormField label="Category">
          <Input name="category" placeholder="e.g. Flooring, Cabinets" />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea name="notes" rows={2} />
        </FormField>
        <FormField label="Instructions for client">
          <Input name="instructions" placeholder="Pick one option…" />
        </FormField>
        <FormField label="Allowance / budget">
          <Input name="budgetAmount" type="number" min="0" step="0.01" />
        </FormField>
        <FormField label="Due date">
          <Input name="dueDate" type="date" />
        </FormField>
        <FormField label="Priority">
          <Select name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </FormField>
        <FormField label="Status">
          <Select name="status" defaultValue="DRAFT">
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
          </Select>
        </FormField>
        <FormField label="Client visibility">
          <Select name="clientVisible" defaultValue="true">
            <option value="true">Visible to client</option>
            <option value="false">Internal only</option>
          </Select>
        </FormField>

        <div className="sm:col-span-2 lg:col-span-3 space-y-4 rounded-[12px] border border-sb-border bg-sb-canvas/40 p-4">
          <h3 className="text-sm font-semibold text-sb-ink">
            Selection options (client chooses)
          </h3>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="grid gap-3 border-t border-sb-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-2"
            >
              <FormField
                label={`Option ${n} label${n === 1 ? " *" : ""}`}
                required={n === 1}
              >
                <Input
                  name={`optionLabel${n}`}
                  required={n === 1}
                  placeholder={
                    n === 1
                      ? "e.g. Quartz — Calacatta"
                      : "Optional additional choice"
                  }
                />
              </FormField>
              <FormField label={`Option ${n} notes / cost`}>
                <Input
                  name={`optionNotes${n}`}
                  placeholder="Spec, upgrade cost…"
                />
              </FormField>
              <div className="sm:col-span-2">
                <ImageUploadField
                  name={`optionImages${n}`}
                  multiple
                  label={`Option ${n} photos`}
                  maxFiles={6}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <ImageUploadField
            name="images"
            multiple
            label="Shared selection gallery (optional)"
            maxFiles={10}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <SubmitButton pendingLabel="Saving…">Create Selection</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
