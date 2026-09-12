/**
 * All CRM routes need a session / DB — never prerender them at build time.
 * Keeps Render (and other low-RAM hosts) from exploding worker memory.
 */
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
