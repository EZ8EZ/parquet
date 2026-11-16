import Link from "next/link";
import { cn } from "@/lib/ui";

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "bg-elevated text-ink hover:bg-border-strong",
  ghost: "text-accent-text hover:bg-surface-2",
};

export function buttonClasses({ variant = "primary", size = "md", block } = {}) {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-50",
    size === "sm" ? "px-3.5 text-note" : "px-5 text-body",
    VARIANTS[variant] ?? VARIANTS.primary,
    block && "w-full",
  );
}

/** A button. One primary per screen. */
export function Button({ variant, size, block, className, type = "button", ...rest }) {
  return <button type={type} className={cn(buttonClasses({ variant, size, block }), className)} {...rest} />;
}

/** A link that looks like a button. */
export function ButtonLink({ href, children, variant, size, block, className, ...rest }) {
  return (
    <Link href={href} className={cn(buttonClasses({ variant, size, block }), className)} {...rest}>
      {children}
    </Link>
  );
}
