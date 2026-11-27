import type { FundFlowHistoryRow } from "../../../../hooks/useMarketCenter";
import { formatMoney } from "../../../../lib/market-center";

export function FundStructure({
  row,
  emptyLabel = "资金结构暂无数据",
  isLoading = false,
  isError = false,
  tone = "default",
}: {
  row: FundFlowHistoryRow | null | undefined;
  emptyLabel?: string;
  isLoading?: boolean;
  isError?: boolean;
  tone?: "default" | "quoteCanvas";
}) {
  const isQuoteCanvas = tone === "quoteCanvas";
  const emptySurfaceClass = isQuoteCanvas
    ? "bg-quote-surface text-quote-muted"
    : "bg-app-surface text-app-muted";
  const errorSurfaceClass = isQuoteCanvas
    ? "border border-quote-line bg-quote-surface text-quote-up"
    : "bg-destructive/10 text-destructive";
  const tileClass = isQuoteCanvas ? "bg-quote-surface" : "bg-app-surface";
  const labelClass = isQuoteCanvas ? "text-quote-axis" : "text-app-muted";

  if (isLoading) {
    return (
      <div
        className={`h-[58px] animate-pulse rounded-xl ${isQuoteCanvas ? "bg-quote-surface" : "bg-app-surface"}`}
        aria-label="资金结构加载中"
      />
    );
  }
  if (isError) {
    return (
      <div className={`rounded-xl px-3 py-4 text-center text-[11px] ${errorSurfaceClass}`}>
        资金结构读取失败
      </div>
    );
  }
  if (!row) {
    return (
      <div className={`rounded-xl px-3 py-4 text-center text-[11px] ${emptySurfaceClass}`}>
        {emptyLabel}
      </div>
    );
  }
  const entries = [
    ["主力净流入", row.mainNetInflow],
    ["超大单", row.superLargeNetInflow],
    ["大单", row.largeNetInflow],
    ["中单", row.mediumNetInflow],
    ["小单", row.smallNetInflow],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {entries.map(([label, value]) => (
        <div key={label} className={`rounded-xl px-3 py-2.5 ${tileClass}`}>
          <span className={`block text-[11px] ${labelClass}`}>{label}</span>
          <strong
            className={`mt-1 block font-mono text-xs ${
              value >= 0
                ? isQuoteCanvas
                  ? "text-quote-up"
                  : "text-chart-up-strong"
                : isQuoteCanvas
                  ? "text-quote-down"
                  : "text-chart-down-strong"
            }`}
          >
            {formatMoney(value)}
          </strong>
        </div>
      ))}
    </div>
  );
}
