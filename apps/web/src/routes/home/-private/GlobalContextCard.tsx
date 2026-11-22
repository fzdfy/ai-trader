import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { MarketAssetChart } from "../../../components/charts/MarketAssetChart";
import {
  formatChangePct,
  formatMarketNumber,
  marketQualityLabel,
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
  const change = ticker?.changePct ?? null;
  return (
    <Card
      className={`dashboard-panel-global overflow-hidden rounded-[18px] border-app-warning/25 shadow-dashboard ${
        selectedSymbol === "IXIC" ? "is-nasdaq border-assistant/25" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-2.5 px-[15px] pt-3.5">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-[0.1em] text-app-ink-secondary">
            GLOBAL · CONTEXT
          </p>
          <div className="mt-2 flex gap-1" role="group" aria-label="切换跨市场背景">
            {GLOBAL_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                type="button"
                aria-pressed={selectedSymbol === symbol}
                onClick={() => onSelectSymbol(symbol)}
                className={`focus-ring min-h-7 rounded-md px-2 text-[11px] font-semibold ${
                  selectedSymbol === symbol
                    ? symbol === "IXIC"
                      ? "bg-assistant/15 text-app-ink"
                      : "bg-app-warning/25 text-app-ink"
                    : "bg-app-panel/65 text-app-ink-secondary hover:text-app-ink"
                }`}
              >
                {symbol === "XAUUSD" ? "伦敦金" : "纳指"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <Heading level={2} className="text-sm font-semibold">
              {chart.name}
            </Heading>
            <Text type="supporting" className="font-mono text-[11px]">
              {selectedSymbol}
            </Text>
          </div>
          <p className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap font-mono text-2xl font-bold tracking-[-0.055em]">
            <span>
              {formatMarketNumber(ticker?.price ?? null)}
              {ticker?.price != null ? (
                <small className="ml-1 font-sans text-[11px] font-medium tracking-normal text-app-muted">
                  {ticker.priceUnit}
                </small>
              ) : null}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                change == null
                  ? "text-app-muted"
                  : change > 0
                    ? "text-chart-up-strong"
                    : change < 0
                      ? "text-chart-down-strong"
                      : "text-app-ink-secondary"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  change == null
                    ? "bg-app-muted"
                    : change > 0
                      ? "bg-chart-up"
                      : change < 0
                        ? "bg-chart-down"
                        : "bg-app-muted"
                }`}
              />
              {formatChangePct(change)}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className="flex gap-0.5 rounded-[9px] border border-app-line bg-app-surface/75 p-[3px]"
            role="group"
            aria-label="跨市场图表区间"
          >
            {RANGES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={range === item}
                onClick={() => onSelectRange(item)}
                className={`focus-ring h-6 min-w-[29px] rounded-md px-1 font-mono text-[11px] font-semibold ${
                  range === item
                    ? "bg-primary text-primary-foreground"
                    : "text-app-ink-secondary hover:bg-app-panel"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-app-ink-secondary">
            <span
              className={`size-1.5 rounded-full ${
                chart.quality === "available" ? "bg-app-success" : "bg-app-warning"
              }`}
            />
            {marketQualityLabel(chart.quality, chart.staleReason)}
          </span>
        </div>
      </header>
      <div className="px-1 pt-1">
        <MarketAssetChart
          chart={chart}
          subjectName={chart.name}
          compact
          tone={selectedSymbol === "IXIC" ? "cyan" : "warning"}
          referencePrice={range === "1D" ? (ticker?.preClose ?? null) : null}
        />
      </div>
      <footer className="mx-[15px] flex items-center justify-between gap-2 whitespace-nowrap border-t border-app-warning/20 py-[9px] text-[11px] text-app-ink-secondary">
        <span>{selectedSymbol === "XAUUSD" ? "USD/oz · 无成交量" : "指数点 · 美股收盘"}</span>
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${selectedSymbol === "IXIC" ? "text-assistant" : "text-app-warning"}`}
        >
          <span
            className={`size-1.5 rounded-full ${selectedSymbol === "IXIC" ? "bg-assistant" : "bg-app-warning"}`}
          />
          仅作背景，不进入 A 股信号
        </span>
      </footer>
    </Card>
  );
}
