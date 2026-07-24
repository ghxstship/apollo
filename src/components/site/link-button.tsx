import Link from "next/link";
import type React from "react";

/* A next/link styled as a design-system button — for navigation CTAs where a
   real <button> would be wrong. Class contract matches components.css. */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  inverse = false,
  fullWidth = false,
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "brass" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = [
    "ls-btn",
    "ls-btn--" + variant,
    "ls-btn--" + size,
    inverse ? "ls-btn--inverse" : "",
    fullWidth ? "ls-btn--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
