import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenText, Clock3, GitCompareArrows, Search, Target } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { TextInput } from "@preline-ui/TextInput";
import { useDashboardQuery } from "../../../../../hooks/useDashboard";
import {
  useInstrumentsQuery,
  useWatchlistInstrumentsQuery,
  type Instrument,
} from "../../../../../hooks/useInstruments";
import { useLatestQuotesQuery } from "../../../../../hooks/useStockAnalysis";
import { stockComparePath, type RecentStockAnalysis } from "../../../../../lib/stock-analysis";

const RECENT_ANALYSES_KEY = "apollo-stock-analysis-recent-v1";

function readRecentAnalyses(): RecentStockAnalysis[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_ANALYSES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is RecentStockAnalysis =>
        typeof item === "object" &&
        item !== null &&
        typeof item.symbol === "string" &&
        typeof item.name === "string" &&
        typeof item.viewedAt === "string",
    );
  } catch {
    return [];
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function quoteFor(quotes: ReturnType<typeof useLatestQuotesQuery>["data"], symbol: string) {
  return quotes?.get(symbol);
}

function StockRow({
  instrument,
  quotes,
}: {
  instrument: Instrument;
  quotes: ReturnType<typeof useLatestQuotesQuery>["data"];
}) {
  const quote = quoteFor(quotes, instrument.symbol);
  const change = quote?.changePct == null ? null : Number(quote.changePct);
  return (
    <Link
      to="/home/market/analysis/$symbol"
      params={{ symbol: instrument.symbol }}
      className="focus-ring grid grid-cols-[32px_minmax(0,1fr)_auto_16px] items-center gap-2.5 border-b border-app-line/60 px-4 py-3 transition last:border-b-0 hover:bg-primary/[0.035]"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary/10 font-mono text-[10px] font-semibold text-primary">
        {instrument.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-xs font-medium text-app-ink">
          {instrument.name}
        </strong>
        <span className="mt-0.5 block truncate font-mono text-[9px] text-app-muted">
          {instrument.symbol} · {instrument.exchange}
        </span>
      </span>
      <span className="text-right font-mono">
        <strong
          className={
            change == null ? "text-app-muted" : change > 0 ? "text-chart-up" : "text-chart-down"
          }
        >
          {quote?.last == null ? "—" : Number(quote.last).toFixed(2)}
        </strong>
        <small className="mt-0.5 block text-[9px] text-app-muted">
          {change == null ? "行情待同步" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        </small>
      </span>
      <ArrowRight className="size-3.5 text-app-faint" />
    </Link>
  );
}

export function StockAnalysisLanding() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [recent] = useState(readRecentAnalyses);
  const watchlistQuery = useWatchlistInstrumentsQuery();
  const searchQuery = useInstrumentsQuery(deferredQuery);
  const dashboardQuery = useDashboardQuery();
  const watchlist = watchlistQuery.data ?? [];
  const candidates = dashboardQuery.data?.stockPool.items ?? [];
  const symbols = useMemo(
    () => [
      ...new Set([
        ...watchlist.map((item) => item.symbol),
        ...candidates.map((item) => item.symbol),
      ]),
    ],
    [watchlist, candidates],
  );
  const quotesQuery = useLatestQuotesQuery(symbols);
  const searchResults = searchQuery.data?.pages.flatMap((page) => page.data).slice(0, 8) ?? [];
  const compareSymbols = watchlist.slice(0, 3).map((item) => item.symbol);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
            STOCK RESEARCH · ENTRY
          </p>
          <Heading level={1} className="mt-1 text-3xl tracking-[-0.04em] md:text-[42px]">
            个股分析
          </Heading>
          <Text as="p" type="supporting" className="mt-1.5 max-w-2xl">
            从行情、研报、预测和风险区间开始，建立一只股票的可追溯证据链。
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-app-muted">
            <Badge variant="neutral">自选 {watchlist.length} 只</Badge>
            <Badge variant="neutral">今日候选 {candidates.length} 只</Badge>
            <Badge variant="neutral">最近分析 {recent.length}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-app-line bg-app-panel px-3 text-[10px] text-app-muted">
            <span className="size-1.5 rounded-full bg-app-warning" />
            行情快照 {formatDate(dashboardQuery.data?.asOf.market)}
          </span>
          <Button
            label="对比股票"
            icon={<GitCompareArrows className="size-3.5" />}
            variant="secondary"
            href={stockComparePath(compareSymbols)}
          />
        </div>
      </header>

      <Card variant="detached" className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Search className="size-4" />
          </span>
          <TextInput
            label="搜索股票"
            isLabelHidden
            value={query}
            onChange={setQuery}
            placeholder="输入股票名称、代码或所属概念"
            startIcon={<Search className="size-4" />}
            hasClear
            className="min-w-0 flex-1"
          />
          <span className="hidden text-[10px] text-app-muted sm:block">选择后进入完整分析</span>
        </div>
        {deferredQuery ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-app-line">
            {searchResults.length > 0 ? (
              searchResults.map((item) => (
                <Link
                  key={item.symbol}
                  to="/home/market/analysis/$symbol"
                  params={{ symbol: item.symbol }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-app-line/60 px-3 py-2.5 last:border-b-0 hover:bg-app-surface"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs text-app-ink">{item.name}</strong>
                    <span className="mt-0.5 block font-mono text-[9px] text-app-muted">
                      {item.symbol} · {item.exchange}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 text-app-faint" />
                </Link>
              ))
            ) : searchQuery.isFetching ? (
              <p className="px-3 py-5 text-center text-xs text-app-muted">正在搜索…</p>
            ) : (
              <EmptyState title="没有匹配的 A 股" description="换用六位代码或更短的名称试试。" />
            )}
          </div>
        ) : null}
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,.75fr)]">
        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>自选观察</Heading>
              <Text as="p" type="supporting">
                已同步的股票可直接进入分析页
              </Text>
            </div>
            <Link
              to="/home/market/stock"
              search={{ tab: "watchlist" }}
              className="text-[10px] text-primary"
            >
              全部 {watchlist.length} 只
            </Link>
          </div>
          {watchlistQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-app-surface" />
              ))}
            </div>
          ) : watchlist.length > 0 ? (
            watchlist.map((instrument) => (
              <StockRow key={instrument.symbol} instrument={instrument} quotes={quotesQuery.data} />
            ))
          ) : (
            <EmptyState
              title="自选列表为空"
              description="从行情中心添加股票后，可在这里直接进入分析。"
            />
          )}
        </Card>

        <div className="space-y-4">
          <Card variant="detached" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-app-line px-4 py-3.5">
              <div>
                <Heading level={2} className="flex items-center gap-2">
                  <Target className="size-4 text-primary" />
                  今日候选
                </Heading>
                <Text as="p" type="supporting">
                  来自最新每日选股快照
                </Text>
              </div>
              <Link to="/home/screens" className="text-[10px] text-primary">
                查看选股
              </Link>
            </div>
            {candidates.length > 0 ? (
              <div>
                {candidates.slice(0, 6).map((item, index) => (
                  <Link
                    key={item.symbol}
                    to="/home/market/analysis/$symbol"
                    params={{ symbol: item.symbol }}
                    className="grid grid-cols-[24px_minmax(0,1fr)_48px] items-center gap-2 border-b border-app-line/60 px-4 py-2.5 last:border-b-0 hover:bg-app-surface"
                  >
                    <span className="text-center font-mono text-[9px] text-app-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-[11px] text-app-ink">
                        {item.name}
                      </strong>
                      <span className="mt-0.5 block truncate font-mono text-[8px] text-app-muted">
                        {item.symbol} · {item.source ?? "选股池"}
                      </span>
                    </span>
                    <Badge variant="default" className="justify-center font-mono">
                      {item.score?.toFixed(1) ?? "—"}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="今日暂无候选"
                description="运行每日选股后，候选标的会显示在这里。"
              />
            )}
          </Card>

          <Card variant="detached" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-app-line px-4 py-3.5">
              <div>
                <Heading level={2} className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" />
                  最近分析
                </Heading>
                <Text as="p" type="supporting">
                  分析记录会自动保存
                </Text>
              </div>
              <Badge variant="neutral">{recent.length} 条</Badge>
            </div>
            {recent.length > 0 ? (
              recent.slice(0, 4).map((item) => (
                <Link
                  key={item.symbol}
                  to="/home/market/analysis/$symbol"
                  params={{ symbol: item.symbol }}
                  className="flex items-center gap-3 border-b border-app-line/60 px-4 py-3 last:border-b-0 hover:bg-app-surface"
                >
                  <BookOpenText className="size-3.5 text-primary" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px] text-app-ink">{item.name}</strong>
                    <span className="mt-0.5 block font-mono text-[8px] text-app-muted">
                      {item.symbol} · {formatDate(item.viewedAt)}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 text-app-faint" />
                </Link>
              ))
            ) : (
              <EmptyState
                title="还没有分析记录"
                description="搜索股票，或从自选与今日候选中选择一只开始。"
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export { RECENT_ANALYSES_KEY };
