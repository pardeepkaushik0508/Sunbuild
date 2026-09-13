"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/form";
import type { PersonOption } from "@/lib/users/person-label";

type PersonSelectProps = {
  name: string;
  people: PersonOption[];
  defaultValue?: string;
  emptyLabel?: string;
  required?: boolean;
  /** When set, only people with this project (or no projectIds) are listed. */
  projectId?: string | null;
  className?: string;
  id?: string;
};

/** Renders people with designation labels (trade / role). */
export function PersonSelect({
  name,
  people,
  defaultValue = "",
  emptyLabel = "Unassigned",
  required,
  projectId,
  className,
  id,
}: PersonSelectProps) {
  const options = useMemo(() => {
    if (!projectId) return people;
    return people.filter(
      (p) => !p.projectIds || p.projectIds.includes(projectId)
    );
  }, [people, projectId]);

  const valueStillValid =
    !defaultValue || options.some((o) => o.id === defaultValue);

  return (
    <Select
      id={id}
      name={name}
      required={required}
      defaultValue={valueStillValid ? defaultValue : ""}
      className={className}
      key={`${projectId ?? "all"}-${defaultValue}`}
    >
      <option value="">{emptyLabel}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}

type ProjectScopedAssigneeSelectProps = {
  name?: string;
  people: PersonOption[];
  /** Name of the sibling project &lt;select&gt; to watch. */
  projectFieldName?: string;
  defaultValue?: string;
  defaultProjectId?: string | null;
  emptyLabel?: string;
  formSelector?: string;
};

/**
 * Assignee dropdown that filters to subcontractors assigned to the selected project.
 * Watches a sibling project select in the same form.
 */
export function ProjectScopedAssigneeSelect({
  name = "assigneeId",
  people,
  projectFieldName = "projectId",
  defaultValue = "",
  defaultProjectId = null,
  emptyLabel = "Unassigned",
}: ProjectScopedAssigneeSelectProps) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");

  useEffect(() => {
    const form = document.querySelector(
      `select[name="${projectFieldName}"]`
    )?.closest("form");
    if (!form) return;

    const projectSelect = form.querySelector<HTMLSelectElement>(
      `select[name="${projectFieldName}"]`
    );
    if (!projectSelect) return;

    const sync = () => setProjectId(projectSelect.value);
    sync();
    projectSelect.addEventListener("change", sync);
    return () => projectSelect.removeEventListener("change", sync);
  }, [projectFieldName]);

  return (
    <PersonSelect
      name={name}
      people={people}
      projectId={projectId || null}
      defaultValue={defaultValue}
      emptyLabel={emptyLabel}
    />
  );
}
