import type { SignalStatus } from "@ai-trader/signal-catalog/contracts";
import { Card } from "@preline-ui/Card";
import { SignalCell } from "./SignalCell";

export interface MarketRegimeStripProps {
  stateLabel: string;
  summary: string;
  counts: Record<SignalStatus, number>;
  evidence: readonly string[];
  keySignal?: string | null;
  href?: string;
}

export function MarketRegimeStrip({
  stateLabel,
  summary,
  counts,
  evidence,
  keySignal,
  href,
}: MarketRegimeStripProps) {
  return (
    <Card className="grid gap-4 border-app-line bg-app-panel p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary">
          A 股宏观状态
        </span>
        <strong className="mt-2 block text-base text-app-ink">{stateLabel}</strong>
        <p className="mt-1 text-xs leading-5 text-app-muted">{summary}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidence.map((item) => (
            <span
              key={item}
              className="rounded-full bg-app-surface px-2 py-1 text-[10px] text-app-muted"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
      <SignalCell
        counts={counts}
        keyLabel={keySignal}
        statusLabel={stateLabel}
        href={href}
        label="打开 A 股宏观状态详情"
      />
    </Card>
  );
}
