import { cn } from "@/lib/utils";

export function DataTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[16px] border border-sb-border bg-white shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-sb-border bg-[#fafafa] text-[11px] uppercase tracking-wide text-sb-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sb-border-subtle">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn("px-4 py-3.5 align-middle text-sb-body", className)}
    >
      {children}
    </td>
  );
}
