import {
  buildAShareIndexOverview,
  formatChangePct,
  formatMarketNumber,
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
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-app-surface p-1 sm:min-w-[420px] sm:max-w-[480px]"
      role="group"
      aria-label="切换 A 股指数"
    >
      {items.map((item) => {
        const selected = item.symbol === selectedSymbol;
        const ticker = item.ticker;
        const change = ticker?.changePct ?? null;
        return (
          <button
            key={item.symbol}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectSymbol(item.symbol)}
            className={`focus-ring min-w-0 rounded-lg px-2.5 py-[7px] text-left transition sm:px-3 ${
              selected
                ? "bg-app-panel text-app-ink shadow-sm"
                : "text-app-muted hover:bg-app-panel/65 hover:text-app-ink"
            }`}
          >
            <span className="flex min-w-0 items-baseline justify-between gap-1.5">
              <strong className="truncate text-[11px] font-semibold">{item.label}</strong>
              <span className="shrink-0 font-mono text-[11px] text-app-ink-secondary">
                {item.symbol}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <strong className="inline-flex items-baseline gap-1 whitespace-nowrap font-mono text-[18px] font-bold leading-none tracking-[-0.045em]">
                {formatMarketNumber(ticker?.price ?? null)}
                {ticker?.price != null ? (
                  <small className="font-sans text-[10px] font-medium tracking-normal text-app-muted">
                    {ticker.priceUnit}
                  </small>
                ) : null}
              </strong>
              <span
                className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold ${
                  change == null
                    ? "text-app-muted"
                    : change > 0
                      ? "text-chart-up-strong"
                      : change < 0
                        ? "text-chart-down-strong"
                        : "text-app-ink-secondary"
                }`}
              >
                {ticker ? (
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
                ) : null}
                {ticker == null ? "暂不可用" : formatChangePct(change)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
