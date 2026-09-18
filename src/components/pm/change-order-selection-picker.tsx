"use client";

import { useMemo, useState } from "react";
import { FormField, Select } from "@/components/ui/form";

export type ChangeOrderSelectionOption = {
  id: string;
  projectId: string;
  title: string;
  category: string | null;
  status: string;
  allowance: number | null;
  imageUrl: string | null;
  clientChoice: string | null;
};

export function ChangeOrderSelectionPicker({
  projects,
  selections,
  defaultProjectId,
}: {
  projects: Array<{ id: string; name: string }>;
  selections: ChangeOrderSelectionOption[];
  defaultProjectId?: string;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const filtered = useMemo(
    () => selections.filter((s) => s.projectId === projectId),
    [selections, projectId]
  );

  return (
    <>
      <FormField label="Project">
        <Select
          name="projectId"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
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
      <FormField label="Linked selection">
        <Select name="selectionSectionId" defaultValue="" disabled={!projectId}>
          <option value="">None — not linked to a selection</option>
          {filtered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.category ? ` · ${s.category}` : ""}
              {s.status ? ` · ${s.status.replace(/_/g, " ")}` : ""}
              {s.clientChoice ? ` · ${s.clientChoice}` : ""}
            </option>
          ))}
        </Select>
        {!projectId ? (
          <p className="mt-1 text-[11px] text-sb-muted">
            Choose a project to load its selection list.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-1 text-[11px] text-sb-muted">
            No selections on this project yet.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {filtered.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-[8px] border border-sb-border px-2 py-1.5 text-[11px]"
              >
                {s.imageUrl ? (
                  <span
                    className="h-8 w-8 shrink-0 rounded bg-sb-canvas bg-cover bg-center"
                    style={{ backgroundImage: `url(${s.imageUrl})` }}
                    aria-hidden
                  />
                ) : (
                  <span className="inline-block h-8 w-8 rounded bg-sb-canvas" />
                )}
                <span className="min-w-0 truncate">
                  {s.title}
                  {s.allowance != null
                    ? ` · $${s.allowance.toLocaleString("en-CA")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FormField>
    </>
  );
}
