/** Shared allowance / budget usage for selections (PM + Client). */

export type AllowanceUsage = {
  selected: number;
  allowance: number | null;
  /** 0–100+ (can exceed 100 on overage). Null when no allowance set. */
  percent: number | null;
  overage: number;
};

export function computeAllowanceUsage(input: {
  sectionAllowance?: number | null;
  items: Array<{
    selectedCost?: number | null;
    allowanceAmount?: number | null;
    overage?: number | null;
  }>;
}): AllowanceUsage {
  const selected = input.items.reduce(
    (sum, item) => sum + (item.selectedCost ?? 0),
    0
  );

  const itemAllowances = input.items
    .map((i) => i.allowanceAmount)
    .filter((v): v is number => v != null);
  const allowanceFromItems =
    itemAllowances.length > 0
      ? itemAllowances.reduce((a, b) => a + b, 0)
      : null;

  const allowance =
    input.sectionAllowance != null
      ? input.sectionAllowance
      : allowanceFromItems;

  if (allowance == null) {
    return { selected, allowance: null, percent: null, overage: 0 };
  }

  if (allowance <= 0) {
    return {
      selected,
      allowance,
      percent: selected > 0 ? 100 : 0,
      overage: Math.max(0, selected),
    };
  }

  const percent = Math.round((selected / allowance) * 100);
  const overage = Math.max(0, selected - allowance);
  return { selected, allowance, percent, overage };
}
