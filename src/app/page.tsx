import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { ROLE_HOME } from "@/lib/permissions";

export default async function HomePage() {
  const session = await requireSession();
  redirect(ROLE_HOME[session.membership.role]);
}
