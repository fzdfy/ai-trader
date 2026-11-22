import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import {
  formatMarketPrice,
  type MarketBriefResponse,
  type MarketRange,
} from "../../../lib/market-brief";
import { ETF_SYMBOLS } from "../../../lib/market-selection";

const RANGES: MarketRange[] = ["1D", "5D", "1M", "YTD"];

export function ETFContextCard({
  data,
  selectedSymbol,
  range,
  onSelectSymbol,
  onSelectRange,
  onTabKeyDown,
}: {
  data: MarketBriefResponse;
  selectedSymbol: (typeof ETF_SYMBOLS)[number];
  range: MarketRange;
  onSelectSymbol: (symbol: (typeof ETF_SYMBOLS)[number]) => void;
  onSelectRange: (range: MarketRange) => void;
  onTabKeyDown: (key: "ArrowLeft" | "ArrowRight" | "Home" | "End") => void;
}) {
  const chart = data.etfChart;
  const ticker = data.tickers.find((item) => item.symbol === selectedSymbol);
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-app-line shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-app-line px-3.5 py-2.5">
        <div className="flex items-baseline gap-2">
          <Heading level={2} className="text-sm">主流 ETF</Heading>
          <Text type="supporting" size="sm">A 股</Text>
        </div>
        <div className="flex gap-1 rounded-lg bg-app-surface p-1" role="group" aria-label="ETF 图表区间">
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={range === item}
              onClick={() => onSelectRange(item)}
              className={`min-w-7 rounded-md px-1 py-1 text-[11px] ${range === item ? "bg-primary text-primary-foreground" : "text-app-muted"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-3.5 py-2.5">
        <div className="flex gap-4 overflow-x-auto border-b border-app-line pb-1" role="tablist" aria-label="切换主流 ETF">
          {ETF_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              role="tab"
              aria-selected={selectedSymbol === symbol}
              tabIndex={selectedSymbol === symbol ? 0 : -1}
              onClick={() => onSelectSymbol(symbol)}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  onTabKeyDown(event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End");
                }
              }}
              className={`shrink-0 border-b-2 px-0.5 pb-2 text-[11px] font-semibold transition ${
                selectedSymbol === symbol
                  ? "border-primary text-app-ink"
                  : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {symbol === "510300.SH" ? "沪深300ETF" : symbol === "588000.SH" ? "科创50ETF" : "创新药ETF"}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <strong className="text-sm">{chart.name}</strong>
            <span className="font-mono text-[11px] text-app-muted">{selectedSymbol}</span>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[-0.04em]">
            {formatMarketPrice(ticker?.price ?? null, ticker?.priceUnit ?? "元")}
            <span className={`ml-2 text-[11px] ${Number(ticker?.changePct ?? 0) >= 0 ? "text-chart-up" : "text-chart-down"}`}>
              {ticker?.changePct == null ? "—" : `${ticker.changePct >= 0 ? "+" : ""}${ticker.changePct.toFixed(2)}%`}
            </span>
          </p>
        </div>
        <div className="mt-1 flex min-h-0 flex-1 flex-col">
          <MarketAssetChart chart={chart} subjectName={chart.name} compact />
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-app-line px-3.5 py-2 pr-16 text-[11px] text-app-muted">
        <span>真实分钟 · CNY</span>
        <span className="font-semibold text-primary">不进入 A 股 SIGNAL</span>
      </footer>
    </Card>
  );
}
