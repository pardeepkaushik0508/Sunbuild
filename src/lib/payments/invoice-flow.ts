import { InvoiceStatus, Role } from "@prisma/client";

export const CLIENT_REPORTABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.OVERDUE,
];

export function canClientReportPayment(status: InvoiceStatus | string) {
  return CLIENT_REPORTABLE_INVOICE_STATUSES.includes(status as InvoiceStatus);
}

export function canBookkeeperVerifyPayment(status: InvoiceStatus | string) {
  return status === InvoiceStatus.PAYMENT_REPORTED;
}

export function canBookkeeperMarkPaid(status: InvoiceStatus | string) {
  return (
    status === InvoiceStatus.PAYMENT_REPORTED ||
    status === InvoiceStatus.SENT ||
    status === InvoiceStatus.VIEWED ||
    status === InvoiceStatus.OVERDUE
  );
}

export function invoiceStatusLabel(status: InvoiceStatus | string) {
  switch (status) {
    case InvoiceStatus.PAYMENT_REPORTED:
      return "Payment reported";
    case InvoiceStatus.PAID:
      return "Paid";
    case InvoiceStatus.OVERDUE:
      return "Overdue";
    case InvoiceStatus.VIEWED:
      return "Viewed";
    case InvoiceStatus.SENT:
      return "Due";
    case InvoiceStatus.DRAFT:
      return "Draft";
    case InvoiceStatus.VOID:
      return "Void";
    default:
      return String(status).replace(/_/g, " ");
  }
}

export function isClientInvoicePayee(payeeUserId: string | null | undefined) {
  return !payeeUserId;
}

export function financeRolesCanSeeAllSubPayments(role: Role) {
  return (
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.PROJECT_MANAGER ||
    role === Role.BOOKKEEPER ||
    role === Role.OPERATIONS_ADMIN
  );
}
