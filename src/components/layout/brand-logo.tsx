import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: {
  href?: string | null;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/figma/logo-mark-brand.svg"
        alt=""
        width={32}
        height={32}
        className={cn("h-8 w-8 shrink-0", markClassName)}
        priority
      />
      {showWordmark ? (
        <span
          className={cn(
            "sb-brand text-[28px] leading-none",
            wordmarkClassName
          )}
        >
          Sunbuild
        </span>
      ) : (
        <span className="sr-only">Sunbuild</span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="shrink-0" aria-label="Sunbuild home">
      {content}
    </Link>
  );
}
