import { redirect } from "next/navigation";

/** Change Orders are shown on Payments (same ChangeOrder records). */
export default async function ClientChangeOrdersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.projectId ? `?projectId=${encodeURIComponent(sp.projectId)}` : "";
  redirect(`/client/payments${q}`);
}
