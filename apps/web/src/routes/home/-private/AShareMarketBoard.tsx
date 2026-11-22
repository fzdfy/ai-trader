import { BarChart3 } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import {
  formatMarketPrice,
  marketQualityLabel,
  type MarketBriefResponse,
  type MarketRange,
} from "../../../lib/market-brief";
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
  selectedSymbol: "000001.SH" | "399006.SZ";
  range: MarketRange;
  onSelectSymbol: (symbol: "000001.SH" | "399006.SZ") => void;
  onSelectRange: (range: MarketRange) => void;
}) {
  const chart = data.aShareChart;
  const ticker = data.tickers.find((item) => item.symbol === selectedSymbol);
  const symbols = [
    ["000001.SH", "上证指数"],
    ["399006.SZ", "创业板指"],
  ] as const;
  return (
    <Card className="market-radar-a-board flex min-h-0 flex-col overflow-hidden rounded-3xl border-app-line shadow-sm">
      <header className="flex flex-col gap-3 border-b border-app-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_10%,transparent)]" />
          <Heading level={2} className="text-base">
            A 股市场
          </Heading>
          <Text type="supporting" size="sm">
            风险判断主视图
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-app-surface p-1" role="tablist" aria-label="切换 A 股指数">
          {symbols.map(([symbol, label]) => (
            <button
              key={symbol}
              type="button"
              role="tab"
              aria-selected={selectedSymbol === symbol}
              tabIndex={selectedSymbol === symbol ? 0 : -1}
              onClick={() => onSelectSymbol(symbol)}
              className={`rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                selectedSymbol === symbol
                  ? "bg-app-panel text-app-ink shadow-sm"
                  : "text-app-muted hover:text-app-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] text-app-muted">
                <BarChart3 className="size-3 text-primary" />
                A 股趋势 · LAST CLOSE
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <strong className="text-lg">{chart.name}</strong>
                <span className="font-mono text-[11px] text-app-muted">{selectedSymbol}</span>
                <span className="text-[11px] font-semibold text-primary">参与 A 股 SIGNAL</span>
              </div>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[-0.05em]">
                {formatMarketPrice(ticker?.price ?? null, ticker?.priceUnit ?? "点")}
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-app-ink">
                  <span className={`size-1.5 rounded-full ${Number(ticker?.changePct ?? 0) >= 0 ? "bg-chart-up" : "bg-chart-down"}`} />
                  {ticker?.changePct == null ? "—" : `${ticker.changePct >= 0 ? "+" : ""}${ticker.changePct.toFixed(2)}%`}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={chart.quality === "available" ? "soft" : "warning"}>
                {marketQualityLabel(chart.quality, chart.staleReason)}
              </Badge>
              <div className="flex gap-1 rounded-lg bg-app-surface p-1" role="group" aria-label="A 股图表区间">
                {RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={range === item}
                    onClick={() => onSelectRange(item)}
                    className={`min-w-8 rounded-md px-1.5 py-1 text-[11px] ${range === item ? "bg-primary text-primary-foreground" : "text-app-muted"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <MarketAssetChart chart={chart} subjectName={chart.name} />
        <AShareSignalPanel signal={data.signal} />
      </div>
    </Card>
  );
}
