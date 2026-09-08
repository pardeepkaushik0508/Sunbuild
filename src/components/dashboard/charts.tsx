"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ef4444", "#9ca3af"];

export function StatusDonutChart({
  data,
  className,
  title = "Status mix",
}: {
  data: { name: string; value: number }[];
  className?: string;
  title?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div
      className={cn(
        "rounded-[16px] border border-sb-border bg-white p-4 shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <p className="text-sm font-semibold text-sb-ink">{title}</p>
      <div className="mt-2 h-[180px]">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-sb-muted">
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <ul className="mt-1 space-y-1">
        {data.map((d, i) => (
          <li
            key={d.name}
            className="flex items-center justify-between text-xs text-sb-muted"
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              {d.name}
            </span>
            <span className="font-medium text-sb-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MetricBarChart({
  data,
  className,
  title = "Activity",
}: {
  data: { name: string; value: number }[];
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-sb-border bg-white p-4 shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <p className="text-sm font-semibold text-sb-ink">{title}</p>
      <div className="mt-2 h-[200px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-sb-muted">
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
