import type { ReactNode } from "react";
import type { GovernanceTone } from "./governance-ui";

const TONE_CLASSES: Record<GovernanceTone, string> = {
  success: "bg-app-success-soft text-app-ink",
  warning: "bg-app-warning-soft text-app-ink",
  error: "bg-destructive/10 text-app-ink",
  blue: "bg-primary/10 text-app-ink",
  neutral: "bg-app-surface text-app-muted",
};

export function GovernanceStatusBadge({
  label,
  tone = "neutral",
  children,
}: {
  label?: ReactNode;
  tone?: GovernanceTone;
  children?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {children ?? label}
    </span>
  );
}
