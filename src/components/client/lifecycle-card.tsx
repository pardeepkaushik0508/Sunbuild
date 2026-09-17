import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ClientLifecycleRow = {
  id: string;
  title: string;
  detail?: string | null;
  status: string;
  amount?: number | null;
  dueDate?: string | null;
};

export function ClientLifecycleCard({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: ClientLifecycleRow[];
}) {
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-sb-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-sb-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-sb-ink">{row.title}</p>
                {row.detail ? (
                  <p className="text-xs text-sb-muted">{row.detail}</p>
                ) : null}
                {row.dueDate ? (
                  <p className="text-xs text-sb-muted">
                    Due {formatDate(row.dueDate)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge tone={statusTone(row.status)}>
                  {row.status.replace(/_/g, " ")}
                </StatusBadge>
                {row.amount != null ? (
                  <span className="text-sm font-semibold">
                    {formatCurrency(row.amount)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
