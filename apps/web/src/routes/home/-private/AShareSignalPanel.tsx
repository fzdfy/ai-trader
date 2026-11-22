import { ArrowUpRight, Sparkles } from "lucide-react";
import { requestAssistant } from "../../../lib/assistant";
import { formatFactorScore, type MarketSignal } from "../../../lib/market-brief";

export function AShareSignalPanel({
  signal,
  trendName,
}: {
  signal: MarketSignal;
  trendName: string;
}) {
  const low = signal.quality !== "available";
  return (
    <section
      className={`relative overflow-hidden px-[18px] py-4 ${
        low ? "bg-app-surface text-app-ink" : "dashboard-signal-surface text-white"
      }`}
      aria-label="A 股确定性市场信号"
    >
      <span
        className={`pointer-events-none absolute -bottom-20 -right-12 size-[190px] rounded-full border ${
          low ? "border-app-line" : "border-white/10"
        }`}
        aria-hidden="true"
      />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[11px] font-bold tracking-[0.05em] ${
            low ? "bg-app-surface-strong text-app-muted" : "bg-app-warning text-app-ink"
          }`}
        >
          <Sparkles className="size-3.5" />
          {low ? "证据不足 · 中性" : "A 股 SIGNAL · 规则判定"}
        </span>
        <span className={`text-right text-[11px] ${low ? "text-app-muted" : "text-white/80"}`}>
          <strong
            className={`mb-0.5 block font-mono text-[17px] ${low ? "text-app-ink" : "text-white"}`}
          >
            {signal.dataConfidence}%
          </strong>
          数据质量 · 非预测准确率
        </span>
      </div>
      <div className="relative z-10 mt-2.5 grid gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p
            className={`font-mono text-[11px] font-semibold tracking-[0.13em] ${low ? "text-app-muted" : "text-white/65"}`}
          >
            TODAY&apos;S MARKET REGIME
          </p>
          <h2 className="mt-1.5 max-w-[620px] text-[23px] font-bold leading-[1.24] tracking-[-0.04em]">
            {signal.headline}
          </h2>
          <p
            className={`mt-2 max-w-[650px] text-xs leading-[1.65] ${low ? "text-app-muted" : "text-white/80"}`}
          >
            {signal.body}
          </p>
          <div className={`mt-2 text-[11px] ${low ? "text-app-muted" : "text-white/70"}`}>
            输入 · {trendName}趋势 / 行业广度 / 行业资金与涨停
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap gap-1.5" aria-label="信号因子">
            {signal.factors.map((factor) => (
              <span
                key={factor.key}
                className={`inline-flex min-h-[27px] items-center gap-1.5 rounded-full px-2 text-[11px] ${
                  low ? "bg-app-line/30 text-app-muted" : "bg-white/10 text-white/85"
                }`}
                title={factor.evidence}
              >
                {factor.label}
                <strong className={`font-mono text-[11px] ${low ? "text-app-ink" : "text-white"}`}>
                  {formatFactorScore(factor.score)}
                </strong>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-app-warning px-2.5 text-[11px] font-bold text-app-ink transition hover:bg-app-warning/85"
            onClick={requestAssistant}
          >
            <Sparkles className="size-3.5" />
            追问 AI
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
