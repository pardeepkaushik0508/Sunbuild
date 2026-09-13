import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions";

export type PersonOption = {
  id: string;
  name: string;
  /** Display text for selects: "Name (Trade)" or "Name (Role)". */
  label: string;
  role?: Role;
  trade?: string | null;
  /** Projects this person is assigned to (for project-scoped filtering). */
  projectIds?: string[];
};

/**
 * Dropdown label with designation: trade for subcontractors, role otherwise.
 * Examples: "Terry Trade (Painter)", "Sam Sales (Sales Manager)"
 */
export function formatPersonOptionLabel(
  name: string,
  opts?: { role?: Role | null; trade?: string | null }
): string {
  const trade = opts?.trade?.trim() || null;
  const role = opts?.role ?? null;

  if (role === Role.SUBCONTRACTOR) {
    return `${name} (${trade || ROLE_LABELS.SUBCONTRACTOR})`;
  }
  if (trade && role) {
    return `${name} (${ROLE_LABELS[role]} · ${trade})`;
  }
  if (role) {
    return `${name} (${ROLE_LABELS[role]})`;
  }
  if (trade) {
    return `${name} (${trade})`;
  }
  return name;
}

export function toPersonOption(input: {
  id: string;
  name: string;
  role?: Role | null;
  trade?: string | null;
  projectIds?: string[];
}): PersonOption {
  return {
    id: input.id,
    name: input.name,
    label: formatPersonOptionLabel(input.name, {
      role: input.role,
      trade: input.trade,
    }),
    role: input.role ?? undefined,
    trade: input.trade ?? null,
    projectIds: input.projectIds,
  };
}
