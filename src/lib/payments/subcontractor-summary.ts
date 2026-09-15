import { InvoiceStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AppSession } from "@/lib/session";
import { financeRolesCanSeeAllSubPayments } from "@/lib/payments/invoice-flow";

export type SubcontractorPaymentRow = {
  subcontractorId: string;
  name: string;
  trade: string | null;
  paidAmount: number;
  reportedAmount: number;
  lastPaymentAt: Date | null;
  invoiceCount: number;
};

export async function loadProjectSubcontractorPayments(opts: {
  session: AppSession;
  projectId: string;
}): Promise<SubcontractorPaymentRow[]> {
  const { session, projectId } = opts;
  const role = session.membership.role;
  const seeAll = financeRolesCanSeeAllSubPayments(role);

  const access = await prisma.projectAccess.findMany({
    where: {
      projectId,
      role: Role.SUBCONTRACTOR,
      ...(seeAll ? {} : { userId: session.user.id }),
    },
    include: {
      user: { select: { id: true, name: true, trade: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const invoices = await prisma.invoice.findMany({
    where: {
      projectId,
      payeeUserId: {
        in: seeAll
          ? access.map((a) => a.userId)
          : [session.user.id],
      },
    },
    select: {
      payeeUserId: true,
      amount: true,
      status: true,
      verifiedPaidAt: true,
      updatedAt: true,
    },
  });

  const byPayee = new Map<
    string,
    { paid: number; reported: number; last: Date | null; count: number }
  >();
  for (const inv of invoices) {
    if (!inv.payeeUserId) continue;
    const row = byPayee.get(inv.payeeUserId) ?? {
      paid: 0,
      reported: 0,
      last: null,
      count: 0,
    };
    row.count += 1;
    if (inv.status === InvoiceStatus.PAID) {
      row.paid += inv.amount;
      const at = inv.verifiedPaidAt ?? inv.updatedAt;
      if (!row.last || at > row.last) row.last = at;
    } else if (inv.status === InvoiceStatus.PAYMENT_REPORTED) {
      row.reported += inv.amount;
    }
    byPayee.set(inv.payeeUserId, row);
  }

  return access.map((a) => {
    const totals = byPayee.get(a.userId);
    return {
      subcontractorId: a.user.id,
      name: a.user.name,
      trade: a.user.trade,
      paidAmount: totals?.paid ?? 0,
      reportedAmount: totals?.reported ?? 0,
      lastPaymentAt: totals?.last ?? null,
      invoiceCount: totals?.count ?? 0,
    };
  });
}
