import type { MarketRotationResponse } from "../../../../lib/market-center";
import { formatMoney, formatRotationValue } from "../../../../lib/market-center";

export function MarketBoardAnomaly({
  data,
  onOpen,
}: {
  data: MarketRotationResponse;
  onOpen: (code: string) => void;
}) {
  const rows = [...data.rows]
    .filter((row) => row.phase !== "数据不足")
    .sort((left, right) => Math.abs(right.moneyConfirmation ?? 0) - Math.abs(left.moneyConfirmation ?? 0))
    .slice(0, 6);
  return (
    <div>
      <div className="divide-y divide-app-line/60 px-3">
        {rows.map((row, index) => (
          <button
            key={row.code}
            type="button"
            className="focus-ring grid min-h-12 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 text-left hover:bg-primary/5"
            onClick={() => onOpen(row.code)}
          >
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 font-mono text-[11px] text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-xs text-app-ink">{row.name}</strong>
              <span className="mt-0.5 block truncate text-[11px] text-app-muted">
                主力 {formatMoney(row.moneyConfirmation)} · 相对 {formatRotationValue(row.relativeReturn)}
              </span>
            </span>
            <span className="rounded-full bg-app-surface px-2 py-1 text-[11px] text-app-ink-secondary">
              {row.phase}
            </span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-14 text-center text-xs text-app-muted">当前没有满足规则的结构异动</p>
      ) : null}
      <p className="border-t border-app-line px-4 py-2.5 text-[11px] leading-5 text-app-muted">
        异动表示规则命中的主力资金或结构极值，不构成交易建议。
      </p>
    </div>
  );
}
