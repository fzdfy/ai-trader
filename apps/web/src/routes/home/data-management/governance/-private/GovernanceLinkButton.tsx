import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function GovernanceLinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const classes = {
    primary:
      "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
    secondary:
      "border-app-line bg-app-panel text-app-ink hover:bg-app-surface",
    ghost:
      "border-transparent bg-transparent text-app-muted hover:bg-app-surface hover:text-app-ink",
  }[variant];
  return (
    <Link
      to={href as "/home/data-management/governance"}
      className={`focus-ring inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium transition ${classes}`}
    >
      {children}
    </Link>
  );
}
