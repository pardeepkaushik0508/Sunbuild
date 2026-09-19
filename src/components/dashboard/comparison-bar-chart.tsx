"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ef4444", "#9ca3af"];

export default function ComparisonBarChart({
  data,
  className,
  title = "Comparison",
}: {
  data: { name: string; value: number }[];
  className?: string;
  title?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = [...data].reverse();
  const colorFor = (name: string) =>
    COLORS[Math.max(0, data.findIndex((d) => d.name === name)) % COLORS.length];

  return (
    <div
      className={cn(
        "rounded-[16px] border border-sb-border bg-white p-4 shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <p className="text-sm font-semibold text-sb-ink">{title}</p>
      <div className="mt-2 h-[200px]">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-sb-muted">
            No projects yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 8, right: 36, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={84}
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {rows.map((d) => (
                  <Cell key={d.name} fill={colorFor(d.name)} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={12}
                  fill="#111827"
                />
              </Bar>
            </BarChart>
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
            <span className="font-medium text-sb-ink">
              {d.value}
              {total > 0 ? ` · ${Math.round((d.value / total) * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
