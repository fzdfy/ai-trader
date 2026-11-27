import { BarChart3, BrainCircuit, GitCompareArrows, Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { AddWorkTaskButton } from "../../../../../components/AddWorkTaskButton";
import {
  useAddWatchlist,
  useRemoveWatchlist,
  useWatchlistQuery,
} from "../../../../../hooks/useInstruments";
import type { LatestQuote } from "../../../../../hooks/useMarketCenter";
import { stockComparePath } from "../../../../../lib/stock-analysis";
import type { StockWorkspaceMode } from "../../../../../lib/stock-workspace";

export interface StockWorkspaceStatusItem {
  label: string;
  value: string;
  tone: "success" | "warning" | "error" | "neutral";
}

export function StockWorkspaceHeader({
  symbol,
  displayName,
  quote,
  quoteChange,
  mode,
  statusItems,
  signalCount,
  isRefreshingQuotes,
  onRefreshQuotes,
  onModeChange,
}: {
  symbol: string;
  displayName: string;
  quote: LatestQuote | undefined;
  quoteChange: number | null;
  mode: StockWorkspaceMode;
  statusItems: StockWorkspaceStatusItem[];
  signalCount: number;
  isRefreshingQuotes: boolean;
  onRefreshQuotes: () => void;
  onModeChange: (mode: StockWorkspaceMode) => void;
}) {
  const watchlistQuery = useWatchlistQuery();
  const addWatchlist = useAddWatchlist();
  const removeWatchlist = useRemoveWatchlist();
  const watched = watchlistQuery.data?.includes(symbol) ?? false;
  const compareSymbols = [
    symbol,
    ...(watchlistQuery.data ?? []).filter((item) => item !== symbol).slice(0, 2),
  ];

  return (
    <>
      <header
        className="border-y border-app-line bg-app-panel px-4 py-4 sm:px-5"
        aria-labelledby="stock-workspace-title"
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold tracking-[0.11em] text-primary">
              STOCK WORKSPACE · {symbol}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1
                id="stock-workspace-title"
                className="truncate text-3xl font-bold tracking-[-0.045em] text-app-ink md:text-[38px]"
              >
                {displayName}
              </h1>
              <span className="font-mono text-xs text-app-muted">{symbol}</span>
              <span
                className={`font-mono text-2xl font-semibold tracking-tight ${
                  quoteChange == null
                    ? "text-app-ink"
                    : quoteChange > 0
                      ? "text-chart-up-strong"
                      : quoteChange < 0
                        ? "text-chart-down-strong"
                        : "text-app-ink"
                }`}
              >
                {quote?.last == null ? "—" : Number(quote.last).toFixed(2)}
              </span>
              <span
                className={`font-mono text-xs ${
                  quoteChange == null
                    ? "text-app-muted"
                    : quoteChange > 0
                      ? "text-chart-up-strong"
                      : quoteChange < 0
                        ? "text-chart-down-strong"
                        : "text-app-muted"
                }`}
              >
                {quoteChange == null
                  ? "行情待同步"
                  : `${quoteChange > 0 ? "+" : ""}${quoteChange.toFixed(2)}%`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-app-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-app-success" />
                正常交易
              </span>
              <span>成交额 {formatQuoteAmount(quote?.amount ?? null)}</span>
              <span>{quote?.source ?? "行情来源待确认"}</span>
              <span>{quote?.ts.slice(0, 16).replace("T", " ") ?? "时间待同步"}</span>
              {signalCount > 0 ? <span>{signalCount} 项技术证据</span> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              label={watched ? "移出自选" : "加入自选"}
              variant="secondary"
              size="sm"
              icon={watched ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
              isLoading={addWatchlist.isPending || removeWatchlist.isPending}
              onClick={() => {
                if (watched) removeWatchlist.mutate(symbol);
                else addWatchlist.mutate(symbol);
              }}
            />
            <Button
              label="加入对比"
              variant="secondary"
              size="sm"
              icon={<GitCompareArrows className="size-3.5" />}
              href={stockComparePath(compareSymbols)}
            />
            <AddWorkTaskButton sourceType="stock" sourceId={symbol} />
            <Button
              label="刷新行情"
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="size-3.5" />}
              isLoading={isRefreshingQuotes}
              onClick={onRefreshQuotes}
            />
          </div>
        </div>
        <div
          className="mt-4 grid grid-cols-2 gap-px border-y border-app-line bg-app-line xl:grid-cols-4"
          aria-label="个股数据状态"
        >
          {statusItems.map((item) => (
            <div key={item.label} className="bg-app-surface/45 px-3 py-2">
              <span className="block text-[11px] text-app-ink-secondary">{item.label}</span>
              <strong className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-medium text-app-ink">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    item.tone === "success"
                      ? "bg-app-success"
                      : item.tone === "warning"
                        ? "bg-app-warning"
                        : item.tone === "error"
                          ? "bg-destructive"
                          : "bg-app-faint"
                  }`}
                />
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </header>

      <div
        className="grid overflow-hidden rounded-xl border border-app-line bg-app-surface/55 md:grid-cols-2"
        role="group"
        aria-label="查看深度"
      >
        {[
          {
            value: "quick" as const,
            label: "快速看盘",
            description: "K 线、资金与关键信号，打开即看",
            icon: BarChart3,
            detail: "QUICK",
          },
          {
            value: "research" as const,
            label: "深度研究",
            description: "预测与风险、完整技术信号、财务与事件",
            icon: BrainCircuit,
            detail: "按需加载",
          },
        ].map((item) => {
          const Icon = item.icon;
          const selected = mode === item.value;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onModeChange(item.value)}
              className={`focus-ring flex min-h-16 items-center gap-3 border-b border-app-line px-4 py-3 text-left transition md:border-b-0 md:[&:first-child]:border-r ${
                selected
                  ? "bg-app-panel text-app-ink shadow-[inset_0_-2px_var(--primary)]"
                  : "text-app-muted hover:bg-app-panel/70 hover:text-app-ink"
              }`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                  selected ? "bg-primary/10 text-primary" : "bg-app-panel text-app-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-xs font-semibold">{item.label}</strong>
                <span className="mt-0.5 block text-[11px] leading-5">{item.description}</span>
              </span>
              <span className="font-mono text-[11px] text-app-muted">{item.detail}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function formatQuoteAmount(value: string | null): string {
  const amount = value == null ? Number.NaN : Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(2)}亿`;
  if (amount >= 10_000) return `${(amount / 10_000).toFixed(2)}万`;
  return amount.toFixed(0);
}
