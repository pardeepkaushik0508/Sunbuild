import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "outline"
  | "whatsapp"
  | "orange"
  | "yellow"
  | "purple";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#1f2937] text-white hover:bg-black border border-[#1f2937]",
  secondary: "bg-sb-orange text-white hover:bg-sb-orange-dark border border-sb-orange",
  orange:
    "bg-sb-orange-soft text-sb-orange border border-sb-orange/40 hover:bg-orange-100",
  yellow:
    "bg-sb-yellow text-sb-ink border border-sb-yellow hover:bg-sb-yellow-dark",
  purple:
    "bg-sb-purple text-white border border-sb-purple hover:bg-[#7c3aed]",
  ghost: "bg-transparent hover:bg-sb-canvas text-sb-body",
  danger:
    "bg-white text-sb-red border border-red-300 hover:bg-red-50",
  outline:
    "bg-white border border-[#d1d5db] text-[#4b5563] hover:bg-sb-canvas",
  whatsapp:
    "bg-sb-green-soft text-sb-green border border-sb-green-border hover:bg-green-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[8px]",
  md: "h-9 px-4 text-[13px] rounded-[8px]",
  lg: "h-10 px-5 text-sm rounded-[10px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
});
