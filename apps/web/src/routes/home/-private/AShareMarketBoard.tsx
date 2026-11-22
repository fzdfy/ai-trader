import { BarChart3 } from "lucide-react";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import {
  formatChangePct,
  formatMarketNumber,
  formatMarketPrice,
  marketQualityLabel,
  type AShareIndexSymbol,
  type MarketBriefResponse,
  type MarketRange,
} from "../../../lib/market-brief";
import { AShareIndexOverview } from "./AShareIndexOverview";
import { AShareSignalPanel } from "./AShareSignalPanel";

const RANGES: MarketRange[] = ["1D", "5D", "1M", "YTD"];

export function AShareMarketBoard({
  data,
  selectedSymbol,
  range,
  onSelectSymbol,
  onSelectRange,
}: {
  data: MarketBriefResponse;
  selectedSymbol: AShareIndexSymbol;
  range: MarketRange;
  onSelectSymbol: (symbol: AShareIndexSymbol) => void;
  onSelectRange: (range: MarketRange) => void;
}) {
  const chart = data.aShareChart;
  const ticker = data.tickers.find((item) => item.symbol === selectedSymbol);
  const change = ticker?.changePct ?? null;
  const delta =
    ticker?.price != null && ticker.preClose != null
      ? ticker.price - ticker.preClose
      : null;
  const changeClass =
    change == null
      ? "text-app-muted"
      : change > 0
        ? "text-chart-up"
        : change < 0
          ? "text-chart-down"
          : "text-app-ink-secondary";
  return (
    <Card className="market-radar-a-board dashboard-panel-a flex min-h-0 flex-col overflow-hidden rounded-3xl border-primary/10 shadow-dashboard">
      <header className="flex flex-col gap-3 border-b border-primary/10 px-[18px] py-[15px] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <span className="size-[7px] rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_11%,transparent)]" />
          <Heading level={2} className="text-[15px] font-bold">
            A 股市场
          </Heading>
          <Text type="supporting" className="text-[11px]">
            风险判断主视图
          </Text>
        </div>
        <AShareIndexOverview
          data={data}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={onSelectSymbol}
        />
      </header>
      <div className="flex flex-1 flex-col">
        <div className="px-[18px] pt-[13px]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-app-ink-secondary">
                <BarChart3 className="size-3 text-primary" />
                A 股趋势 · LAST CLOSE
              </p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                <strong className="text-[15px] font-bold tracking-[-0.02em]">
                  {chart.name}
                </strong>
                <span className="font-mono text-[11px] text-app-ink-secondary">
                  {selectedSymbol}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary before:size-1 before:rounded-full before:bg-current">
                  参与 A 股风险信号
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-2.5 font-mono font-bold tracking-[-0.06em]">
                <span className="text-[28px] leading-none">
                  {formatMarketNumber(ticker?.price ?? null)}
                  {ticker?.price != null ? (
                    <small className="ml-1 font-sans text-[11px] font-medium tracking-normal text-app-muted">
                      {ticker.priceUnit}
                    </small>
                  ) : null}
                </span>
                <span className={`text-[11px] font-semibold tracking-normal ${changeClass}`}>
                  {delta == null
                    ? "—"
                    : `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("zh-CN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(delta)} / `}
                  {formatChangePct(change)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
              <span className="inline-flex min-h-8 items-center gap-1.5 text-[11px] text-app-ink-secondary">
                <span
                  className={`size-1.5 rounded-full ${
                    chart.quality === "available" ? "bg-app-success" : "bg-app-warning"
                  }`}
                />
                {marketQualityLabel(chart.quality, chart.staleReason)}
              </span>
              <div
                className="flex gap-0.5 rounded-[9px] border border-app-line bg-app-surface/75 p-[3px] shadow-[inset_0_1px_0_color-mix(in_srgb,white_60%,transparent)]"
                role="group"
                aria-label="A 股图表区间"
              >
                {RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={range === item}
                    onClick={() => onSelectRange(item)}
                    className={`focus-ring h-[26px] min-w-[34px] rounded-md px-1.5 font-mono text-[11px] font-semibold ${
                      range === item
                        ? "bg-primary text-primary-foreground shadow-[0_5px_12px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
                        : "text-app-ink-secondary hover:bg-app-panel hover:text-app-ink"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <MarketAssetChart
          chart={chart}
          subjectName={chart.name}
          fill
          referencePrice={range === "1D" ? ticker?.preClose ?? null : null}
        />
        <footer className="mx-[18px] mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-app-line/60 py-[9px] text-[11px] text-app-ink-secondary">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-[18px] rounded-full bg-primary" />
              {chart.name} · {ticker?.priceUnit ?? "点"}
            </span>
            {range === "1D" && ticker?.preClose != null ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-[18px] border-t border-dashed border-app-muted" />
                昨收 {formatMarketPrice(ticker.preClose, ticker.priceUnit)}
              </span>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-app-warning" />
            {chart.hasVolume ? "成交量来自真实分钟样本" : "当前标的无成交量口径"}
          </span>
        </footer>
        <AShareSignalPanel signal={data.signal} trendName={chart.name} />
      </div>
    </Card>
  );
}
