"use client";

import { useRouter } from "next/navigation";
import { setSelectedProjectAction } from "@/lib/pm/project-actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { useMemo, useState, useTransition } from "react";

export type SelectableProject = {
  id: string;
  name: string;
  municipalAddress?: string | null;
  status: string;
  buyerName?: string | null;
};

export function PmProjectPicker({
  projects,
  selectedProjectId,
  returnTo = "/pm",
  compact = false,
}: {
  projects: SelectableProject[];
  selectedProjectId?: string | null;
  returnTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(selectedProjectId ?? "");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) => {
      const hay = [p.name, p.municipalAddress, p.buyerName, p.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [projects, q]);

  function onSelect(projectId: string) {
    setValue(projectId);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("returnTo", returnTo);
    startTransition(async () => {
      await setSelectedProjectAction(fd);
      router.refresh();
    });
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Project" className="min-w-[220px] flex-1">
          <Select
            value={value}
            onChange={(e) => onSelect(e.target.value)}
            disabled={pending || projects.length === 0}
            aria-label="Select project"
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormField label="Search projects">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, address, client…"
          aria-label="Search projects"
        />
      </FormField>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-sb-muted">
            No matching projects.
          </p>
        ) : (
          filtered.map((p) => {
            const active = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                disabled={pending}
                onClick={() => onSelect(p.id)}
                className={`flex w-full flex-col rounded-[12px] border px-4 py-3 text-left transition ${
                  active
                    ? "border-sb-orange bg-sb-orange-soft"
                    : "border-sb-border bg-sb-surface hover:border-sb-orange/40"
                }`}
              >
                <span className="font-semibold text-sb-ink">{p.name}</span>
                <span className="text-xs text-sb-muted">
                  {[p.buyerName, p.municipalAddress, p.status.replace(/_/g, " ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            );
          })
        )}
      </div>
      {value ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onSelect(value)}
        >
          {pending ? "Loading…" : "Use selected project"}
        </Button>
      ) : null}
    </div>
  );
}
