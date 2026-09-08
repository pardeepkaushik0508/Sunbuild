import Link from "next/link";
import { Eye, Mail, Phone, Zap } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ActionLead } from "@/lib/dashboard/load-sales-overview";

export function LeadsRequiringAction({
  leads,
  error,
}: {
  leads: ActionLead[];
  error?: string | null;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Zap size={16} />
        </span>
        <div>
          <h3 className="text-[16px] font-semibold text-sb-ink">
            Leads Requiring Action
          </h3>
          <p className="text-[12px] text-sb-muted">
            Follow-ups due, proposals awaiting response, and flagged leads
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-[16px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
          {error}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
          No leads currently require immediate follow-up.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <article
              key={lead.id}
              className="rounded-[16px] border border-sb-border bg-sb-surface p-4 shadow-[var(--sb-shadow)] sm:p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-sb-ink">
                    {lead.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-sb-muted">
                    {lead.email ? <span>{lead.email}</span> : null}
                    {lead.phone ? <span>{lead.phone}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#facc15] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#111827]">
                    Priority
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#8b5cf6] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8b5cf6]">
                    {lead.statusLabel}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-sb-border pt-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sb-muted">
                    Value
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-sb-ink">
                    {formatCurrency(lead.estimatedValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sb-muted">
                    Source
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-sb-ink">
                    {lead.source || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sb-muted">
                    Assigned
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-sb-ink">
                    {lead.assigneeName || "Unassigned"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sb-muted">
                    Next Action
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-sb-ink">
                    {lead.nextAction || "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-sb-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-sb-muted">
                  Last Contact: {formatDate(lead.lastContactAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {lead.phone ? (
                    <a
                      href={`tel:${lead.phone}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-sb-border bg-white px-3.5 text-[12px] font-semibold text-sb-ink hover:bg-sb-canvas"
                    >
                      <Phone size={14} />
                      Call
                    </a>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-sb-border px-3.5 text-[12px] text-sb-muted">
                      <Phone size={14} />
                      No phone
                    </span>
                  )}
                  {lead.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#8b5cf6] px-3.5 text-[12px] font-semibold text-white hover:bg-[#7c3aed]"
                      )}
                    >
                      <Mail size={14} />
                      Email
                    </a>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-sb-border px-3.5 text-[12px] text-sb-muted">
                      <Mail size={14} />
                      No email
                    </span>
                  )}
                  <Link
                    href={lead.href}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-sb-border bg-white text-sb-ink hover:bg-sb-canvas"
                    aria-label={`View ${lead.name}`}
                    title="View lead"
                  >
                    <Eye size={16} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
