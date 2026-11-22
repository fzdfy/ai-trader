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
import { ETF_SYMBOLS } from "../../../lib/market-selection";

const RANGES: MarketRange[] = ["1D", "5D", "1M", "YTD"];
const ETF_LABELS: Record<(typeof ETF_SYMBOLS)[number], string> = {
  "510300.SH": "沪深300ETF",
  "588000.SH": "科创50ETF",
  "159992.SZ": "创新药ETF",
};

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
    <Card className="dashboard-panel-etf flex min-h-0 flex-col overflow-hidden rounded-[18px] border-primary/15 shadow-dashboard">
      <header className="flex items-center justify-between gap-2 border-b border-app-line px-[15px] py-[11px]">
        <div className="flex items-baseline gap-2">
          <Heading level={2} className="text-sm font-bold">主流 ETF</Heading>
          <Text type="supporting" className="text-[11px]">A 股</Text>
        </div>
        <div
          className="flex gap-0.5 rounded-[9px] border border-app-line bg-app-surface/75 p-[3px]"
          role="group"
          aria-label="ETF 图表区间"
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
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-[15px] pb-[13px] pt-[9px]">
        <div
          className="focus-ring grid grid-cols-3 gap-1 rounded-xl bg-app-panel/65 p-1"
          role="tablist"
          aria-label="切换主流 ETF"
          aria-activedescendant={`etf-tab-${selectedSymbol}`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            onTabKeyDown(event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End");
          }}
        >
          {ETF_SYMBOLS.map((symbol) => {
            const itemTicker = data.tickers.find((item) => item.symbol === symbol);
            const change = itemTicker?.changePct ?? null;
            return (
              <button
                key={symbol}
                id={`etf-tab-${symbol}`}
                type="button"
                role="tab"
                data-etf-symbol={symbol}
                aria-selected={selectedSymbol === symbol}
                aria-controls="etf-chart-panel"
                tabIndex={-1}
                onClick={() => onSelectSymbol(symbol)}
                className={`grid min-w-0 content-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition ${
                  selectedSymbol === symbol
                    ? "bg-app-panel text-app-ink shadow-sm"
                    : "text-app-muted hover:bg-app-panel/65 hover:text-app-ink"
                }`}
              >
                <strong className="truncate text-[10px] font-semibold">
                  {ETF_LABELS[symbol]}
                </strong>
                <span className="truncate font-mono text-[9px] text-app-ink-secondary">
                  {symbol}
                </span>
                <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-1">
                  <strong className="whitespace-nowrap font-mono text-[11px] font-bold tracking-[-0.035em]">
                    {formatMarketNumber(itemTicker?.price ?? null)}
                    {itemTicker?.price != null ? (
                      <small className="ml-0.5 font-sans text-[9px] font-medium tracking-normal text-app-muted">
                        {itemTicker.priceUnit}
                      </small>
                    ) : null}
                  </strong>
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold ${
                    change == null
                      ? "text-app-muted"
                      : change > 0
                        ? "text-chart-up"
                        : change < 0
                          ? "text-chart-down"
                          : "text-app-ink-secondary"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        itemTicker?.quality === "available"
                          ? change == null
                            ? "bg-app-muted"
                            : change > 0
                              ? "bg-chart-up"
                              : change < 0
                                ? "bg-chart-down"
                                : "bg-app-muted"
                          : "bg-app-warning"
                      }`}
                    />
                    {formatChangePct(change)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div id="etf-chart-panel" className="flex min-h-0 flex-1 flex-col" role="tabpanel">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <strong className="truncate text-[11px] font-semibold">ETF 走势</strong>
              <span className="font-mono text-[11px] text-app-ink-secondary">
                {range} · 独立行情
              </span>
            </div>
            <span className="truncate text-[10px] text-app-ink-secondary">
              {marketQualityLabel(chart.quality, chart.staleReason)}
            </span>
          </div>
          <div className="mt-1 flex min-h-0 flex-1 flex-col">
            <MarketAssetChart
              chart={chart}
              subjectName={chart.name}
              compact
              dense
              referencePrice={range === "1D" ? ticker?.preClose ?? null : null}
            />
          </div>
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-primary/10 px-[15px] py-[9px] pr-16 text-[11px] text-app-ink-secondary">
        <span>真实分钟 · CNY</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          不进入 A 股 SIGNAL
        </span>
      </footer>
    </Card>
  );
}
