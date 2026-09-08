"use client";

import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiInsightsPanel, type InsightCard } from "@/components/dashboard/ai-insights";
import { savePermissionMatrixAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import {
  MATRIX_ROLE_LABELS,
  MATRIX_ROLES,
  PERMISSION_MODULES,
  type MatrixRole,
  type PermissionMatrixState,
  type PermissionModuleKey,
} from "@/lib/permission-matrix";

type Props = {
  initialMatrix: PermissionMatrixState;
  insights: InsightCard[];
};

export function PermissionsMatrixClient({ initialMatrix, insights }: Props) {
  const [matrix, setMatrix] = useState<PermissionMatrixState>(initialMatrix);
  const [saved, setSaved] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const mod of PERMISSION_MODULES) {
      for (const role of MATRIX_ROLES) {
        if (matrix[mod.key][role] !== initialMatrix[mod.key][role]) n += 1;
      }
    }
    return n;
  }, [matrix, initialMatrix]);

  function toggle(moduleKey: PermissionModuleKey, role: MatrixRole) {
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [role]: !prev[moduleKey][role],
      },
    }));
    setSaved(false);
    setMessage(null);
  }

  function onConfigure() {
    startTransition(async () => {
      try {
        await savePermissionMatrixAction(matrix);
        setSaved(true);
        setMessage("Permissions saved. Changes apply to role checks for this company.");
      } catch (e) {
        setMessage(
          e instanceof Error ? e.message : "Could not save permissions."
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[16px] border border-sb-border bg-white shadow-[var(--sb-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sb-border px-5 py-4">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight text-sb-ink sm:text-[20px]">
              Permissions Matrix & Role Management
            </h2>
            <p className="mt-1 text-[13px] text-sb-muted">
              Toggle module access per role, then click Configure to save
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onConfigure}
            disabled={pending || (saved && dirtyCount === 0)}
            className="min-w-[120px] bg-sb-orange hover:bg-sb-orange-dark"
          >
            {pending ? "Saving…" : "Configure"}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-sb-border bg-[#fafafa]">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-sb-muted">
                  Module
                </th>
                {MATRIX_ROLES.map((role) => (
                  <th
                    key={role}
                    className="px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-sb-muted"
                  >
                    {MATRIX_ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((mod) => (
                <tr
                  key={mod.key}
                  className="border-b border-sb-border-subtle last:border-b-0"
                >
                  <td className="px-5 py-4 font-medium text-sb-ink">
                    {mod.label}
                  </td>
                  {MATRIX_ROLES.map((role) => {
                    const on = matrix[mod.key][role];
                    return (
                      <td key={role} className="px-3 py-4 text-center">
                        <label
                          className={cn(
                            "mx-auto inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition",
                            on
                              ? "bg-emerald-50 ring-1 ring-emerald-200"
                              : "hover:bg-sb-canvas"
                          )}
                          title={`${mod.label} · ${MATRIX_ROLE_LABELS[role]}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => toggle(mod.key, role)}
                            aria-label={`${mod.label} for ${MATRIX_ROLE_LABELS[role]}`}
                          />
                          {on ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="text-base font-medium text-sb-muted">
                              –
                            </span>
                          )}
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {message || dirtyCount > 0 ? (
          <div className="border-t border-sb-border px-5 py-3 text-xs text-sb-muted">
            {message ? (
              <span className="text-sb-ink">{message}</span>
            ) : (
              <span>
                {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"} — click
                Configure to apply.
              </span>
            )}
          </div>
        ) : null}
      </div>

      <AiInsightsPanel insights={insights} viewAllHref="/owner/alerts" />
    </div>
  );
}
