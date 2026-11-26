import { ChevronRight } from "lucide-react";
import type { SignalStatus } from "@ai-trader/signal-catalog/contracts";

export interface SignalCellProps {
  counts: Record<SignalStatus, number>;
  keyLabel?: string | null;
  statusLabel?: string;
  href?: string;
  label?: string;
}

export function SignalCell({
  counts,
  keyLabel,
  statusLabel,
  href,
  label = "查看技术信号",
}: SignalCellProps) {
  const content = (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-app-ink">
          {statusLabel ?? (counts.triggered > 0 ? "有触发" : "中性观察")}
        </span>
        {counts["low-confidence"] > 0 ? (
          <span className="rounded-full bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-app-ink">
            {counts["low-confidence"]} 低置信
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-app-muted">
        <span>触发 {counts.triggered}</span>
        <span>失效 {counts.invalidated}</span>
        <span>待接入 {counts.unavailable}</span>
        <span>不适用 {counts["not-applicable"]}</span>
      </div>
      {keyLabel ? <div className="mt-1 truncate text-[10px] text-app-muted">{keyLabel}</div> : null}
    </div>
  );
  return href ? (
    <a
      href={href}
      className="focus-ring group inline-flex items-center gap-1 rounded-md"
      aria-label={label}
    >
      {content}
      <ChevronRight className="size-3 text-app-muted transition group-hover:text-primary" />
    </a>
  ) : (
    content
  );
}
