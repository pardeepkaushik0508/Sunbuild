import { redirect } from "next/navigation";

/** Invoices live under Payments (same Invoice records). */
export default async function ClientInvoicesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.projectId ? `?projectId=${encodeURIComponent(sp.projectId)}` : "";
  redirect(`/client/payments${q}`);
}
