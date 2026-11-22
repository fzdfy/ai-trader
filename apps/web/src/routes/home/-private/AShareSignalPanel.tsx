import { Sparkles } from "lucide-react";
import type { MarketSignal } from "../../../lib/market-brief";

export function AShareSignalPanel({ signal }: { signal: MarketSignal }) {
  const low = signal.quality !== "available";
  return (
    <section
      className={`relative overflow-hidden px-5 py-4 ${
        low
          ? "bg-app-surface text-app-ink"
          : "bg-primary text-primary-foreground"
      }`}
      aria-label="A 股确定性市场信号"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
            low
              ? "bg-app-surface-2 text-app-muted"
              : "bg-app-warning-soft text-app-ink ring-1 ring-app-warning/30"
          }`}
        >
          <Sparkles className="size-3.5" />
          {low ? "证据不足 · 中性" : "A 股 SIGNAL · 规则判定"}
        </span>
        <span className={`text-right text-xs ${low ? "text-app-muted" : "text-primary-foreground/80"}`}>
          <strong className="block font-mono text-lg">{signal.dataConfidence}%</strong>
          数据质量 · 非预测准确率
        </span>
      </div>
      <p className={`mt-3 font-mono text-[11px] tracking-[0.12em] ${low ? "text-app-muted" : "text-primary-foreground/80"}`}>
        TODAY&apos;S MARKET REGIME
      </p>
      <h2 className="mt-1.5 max-w-2xl text-xl font-bold tracking-[-0.035em]">
        {signal.headline}
      </h2>
      <p className={`mt-2 max-w-3xl text-xs leading-5 ${low ? "text-app-muted" : "text-primary-foreground/80"}`}>
        {signal.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {signal.factors.map((factor) => (
          <span
            key={factor.key}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              low ? "bg-app-surface-2 text-app-muted" : "bg-primary-foreground/10 text-primary-foreground"
            }`}
            title={factor.evidence}
          >
            {factor.label} <strong className="font-mono">{factor.score ?? "缺失"}</strong>
          </span>
        ))}
      </div>
      <div className={`mt-2 text-[11px] ${low ? "text-app-muted" : "text-primary-foreground/80"}`}>
        输入 · 上证趋势 / 创业板广度 / 行业资金与涨停
      </div>
    </section>
  );
}
