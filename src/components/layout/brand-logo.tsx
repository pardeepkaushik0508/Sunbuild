import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  className,
  wordmarkClassName,
}: {
  href?: string | null;
  className?: string;
  wordmarkClassName?: string;
}) {
  const content = (
    <span
      className={cn(
        "sb-brand inline-block text-[28px] leading-none text-sb-orange",
        className,
        wordmarkClassName
      )}
    >
      Sunbuild
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="shrink-0" aria-label="Sunbuild home">
      {content}
    </Link>
  );
}
