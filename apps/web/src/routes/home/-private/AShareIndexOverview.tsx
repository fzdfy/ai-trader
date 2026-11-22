import {
  buildAShareIndexOverview,
  formatChangePct,
  formatMarketPrice,
  type AShareIndexSymbol,
  type MarketBriefResponse,
} from "../../../lib/market-brief";

export function AShareIndexOverview({
  data,
  selectedSymbol,
  onSelectSymbol,
}: {
  data: MarketBriefResponse;
  selectedSymbol: AShareIndexSymbol;
  onSelectSymbol: (symbol: AShareIndexSymbol) => void;
}) {
  const items = buildAShareIndexOverview(data.tickers);
  return (
    <div
      className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-app-surface/65 p-1 sm:max-w-[430px]"
      role="group"
      aria-label="切换 A 股指数"
    >
      {items.map((item) => {
        const selected = item.symbol === selectedSymbol;
        const ticker = item.ticker;
        return (
          <button
            key={item.symbol}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectSymbol(item.symbol)}
            className={`focus-ring min-w-0 rounded-xl px-3 py-2 text-left transition ${
              selected
                ? "bg-dashboard-a text-app-ink shadow-sm ring-1 ring-primary/15"
                : "text-app-muted hover:bg-app-panel/70 hover:text-app-ink"
            }`}
          >
            <span className="flex min-w-0 items-baseline justify-between gap-2">
              <strong className="truncate text-xs">{item.label}</strong>
              <span className="shrink-0 font-mono text-[11px] text-app-ink-secondary">
                {item.symbol}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <strong className="whitespace-nowrap font-mono text-lg tracking-[-0.04em]">
                {formatMarketPrice(ticker?.price ?? null, ticker?.priceUnit ?? "点")}
              </strong>
              <span
                className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold ${
                  ticker == null
                    ? "text-app-muted"
                    : "text-app-ink"
                }`}
              >
                {ticker ? (
                  <span
                    className={`size-1.5 rounded-full ${
                      Number(ticker.changePct ?? 0) >= 0 ? "bg-chart-up" : "bg-chart-down"
                    }`}
                  />
                ) : null}
                {ticker == null ? "暂不可用" : formatChangePct(ticker.changePct)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
