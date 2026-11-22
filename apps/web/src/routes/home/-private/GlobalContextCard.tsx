import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import {
  formatMarketPrice,
  type MarketBriefResponse,
  type MarketRange,
} from "../../../lib/market-brief";
import { GLOBAL_SYMBOLS } from "../../../lib/market-selection";

const RANGES: MarketRange[] = ["1D", "5D", "1M", "YTD"];

export function GlobalContextCard({
  data,
  selectedSymbol,
  range,
  onSelectSymbol,
  onSelectRange,
}: {
  data: MarketBriefResponse;
  selectedSymbol: (typeof GLOBAL_SYMBOLS)[number];
  range: MarketRange;
  onSelectSymbol: (symbol: (typeof GLOBAL_SYMBOLS)[number]) => void;
  onSelectRange: (range: MarketRange) => void;
}) {
  const chart = data.globalChart;
  const ticker = data.tickers.find((item) => item.symbol === selectedSymbol);
  return (
    <Card className="overflow-hidden rounded-2xl border-app-warning/30 bg-app-warning-soft/25 shadow-sm">
      <header className="flex items-start justify-between gap-2 px-3.5 py-2.5">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.1em] text-app-warning">
            GLOBAL · CONTEXT
          </p>
          <div className="mt-1.5 flex gap-1">
            {GLOBAL_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                type="button"
                aria-pressed={selectedSymbol === symbol}
                onClick={() => onSelectSymbol(symbol)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${selectedSymbol === symbol ? "bg-app-warning text-app-warning-foreground" : "text-app-muted"}`}
              >
                {symbol === "XAUUSD" ? "伦敦金" : "纳指"}
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <Heading level={2} className="text-sm">{chart.name}</Heading>
            <Text type="supporting" size="sm">{selectedSymbol}</Text>
          </div>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[-0.04em]">
            {formatMarketPrice(ticker?.price ?? null, ticker?.priceUnit ?? "点")}
            <span className={`ml-2 text-[11px] ${Number(ticker?.changePct ?? 0) >= 0 ? "text-chart-up" : "text-chart-down"}`}>
              {ticker?.changePct == null ? "—" : `${ticker.changePct >= 0 ? "+" : ""}${ticker.changePct.toFixed(2)}%`}
            </span>
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-app-panel/70 p-1" role="group" aria-label="跨市场图表区间">
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
      <MarketAssetChart chart={chart} subjectName={chart.name} compact />
      <footer className="flex items-center justify-between gap-2 border-t border-app-warning/20 px-3.5 py-2 pr-16 text-[11px] text-app-muted">
        <span>{selectedSymbol === "XAUUSD" ? "USD/oz · 不显示成交量" : "指数点 · 美股收盘"}</span>
        <span className="font-semibold text-app-warning">仅作背景，不进入 A 股信号</span>
      </footer>
    </Card>
  );
}
