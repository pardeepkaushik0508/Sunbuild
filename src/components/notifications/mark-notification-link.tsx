"use client";

import Link from "next/link";
import { markNotificationReadAction } from "@/lib/notifications-actions";

type Props = {
  href: string;
  notificationId: string | null;
  className?: string;
  children: React.ReactNode;
};

export function MarkNotificationLink({
  href,
  notificationId,
  className,
  children,
}: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (notificationId) {
          void markNotificationReadAction(notificationId);
        }
      }}
    >
      {children}
    </Link>
  );
}
