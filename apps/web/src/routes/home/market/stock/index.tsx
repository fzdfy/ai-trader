import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Pagination } from "@preline-ui/Pagination";
import { Text } from "@preline-ui/Text";
import {
  useInstrumentPageQuery,
  useWatchlistInstrumentPageQuery,
} from "../../../../hooks/useInstruments";
import { useLatestQuotes } from "../../../../hooks/useMarketCenter";
import { useStockTechnicalSummaries } from "../../../../hooks/useTechnicalSignals";
import { SignalCell } from "../../../../components/signals/SignalCell";
import { paginationTokens } from "../../../../lib/market-center";
import {
  normalizeStockPage,
  parseStockListSearch,
  STOCK_LIST_PAGE_SIZE,
  stockPageRange,
  toStockDetailSearch,
  type StockListSearch,
} from "../../../../lib/stock-list-state";
import { MarketCenterShell } from "../-private/MarketCenterShell";

export const Route = createFileRoute("/home/market/stock/")({
  validateSearch: (search: Record<string, unknown>): StockListSearch =>
    parseStockListSearch(search),
  component: StocksPage,
});

function StocksPage() {
  return (
    <MarketCenterShell>
      <StocksContent />
    </MarketCenterShell>
  );
}

function StocksContent() {
  const { tab, page, q } = Route.useSearch();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(q);
  const market = useInstrumentPageQuery(q, page);
  const watchlist = useWatchlistInstrumentPageQuery(q, page);
  const current = tab === "watchlist" ? watchlist : market;
  const rows = current.data?.data ?? [];
  const total = current.data?.total ?? 0;
  const totalPages = current.data?.totalPages ?? 0;
  const normalizedPage = normalizeStockPage(page, totalPages);
  const range = stockPageRange(normalizedPage, rows.length, total);
  const quotes = useLatestQuotes(rows.map((row) => row.symbol));
  const technicalSummaries = useStockTechnicalSummaries(rows.map((row) => row.symbol));
  const quoteBySymbol = new Map((quotes.data ?? []).map((quote) => [quote.symbol, quote]));
  const technicalBySymbol = new Map(
    (technicalSummaries.data ?? []).map((summary) => [summary.symbol, summary]),
  );

  useEffect(() => {
    setInputValue(q);
  }, [q]);

  useEffect(() => {
    if (!current.data || page === normalizedPage) return;
    void navigate({
      to: "/home/market/stock",
      search: { tab, page: normalizedPage, q },
      replace: true,
    });
  }, [current.data, navigate, normalizedPage, page, q, tab]);

  const setTab = (next: "stock" | "watchlist") => {
    void navigate({
      to: "/home/market/stock",
      search: { tab: next, page: 1, q },
    });
  };
  const submitSearch = () => {
    void navigate({
      to: "/home/market/stock",
      search: { tab, page: 1, q: inputValue.trim() },
    });
  };
  const setPage = (nextPage: number) => {
    void navigate({
      to: "/home/market/stock",
      search: { tab, page: nextPage, q },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg bg-app-surface p-0.5" role="group" aria-label="个股范围">
          {[
            ["stock", "全市场"],
            ["watchlist", "我的自选"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`focus-ring rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                tab === value ? "bg-app-panel text-primary shadow-sm" : "text-app-muted"
              }`}
              aria-pressed={tab === value}
              onClick={() => setTab(value as "stock" | "watchlist")}
            >
              {label}
            </button>
          ))}
        </div>
        <Text
          type="supporting"
          className={`text-[11px] ${quotes.isError ? "text-destructive" : ""}`}
        >
          {quotes.isError ? "行情读取失败，列表仍可查看" : "行情来自腾讯 · 最新可用快照"}
        </Text>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-10 w-full max-w-[520px] items-center gap-1 rounded-xl border border-app-line bg-app-surface p-1 pl-3 shadow-sm">
          <label className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-app-muted">
            <Search className="size-4 shrink-0" />
            <input
              className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-base text-app-ink shadow-none outline-none ring-0 placeholder:text-app-muted focus:border-0 focus:outline-none focus:ring-0 sm:text-sm"
              placeholder="搜索股票代码或名称"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            label="搜索"
            icon={<Search className="size-3.5" />}
            onClick={submitSearch}
          />
        </div>
        <span className="font-mono text-[11px] text-app-muted">
          按代码升序 · 每页 {STOCK_LIST_PAGE_SIZE} 只
        </span>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-app-line px-4 py-3">
          <div>
            <Heading level={2} className="text-sm">
              {tab === "watchlist" ? "自选行情" : "全市场行情"}
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              点击一行进入 K 线详情{q ? ` · 搜索“${q}”` : ""}
            </Text>
          </div>
          <span className="font-mono text-[11px] text-app-muted">{total} 只</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="bg-app-surface/70 text-left text-[11px] text-app-muted">
                <th className="px-4 py-2.5 font-medium">标的</th>
                <th className="px-3 py-2.5 text-right font-medium">最新价</th>
                <th className="px-3 py-2.5 text-right font-medium">涨跌幅</th>
                <th className="px-3 py-2.5 text-right font-medium">PE</th>
                <th className="px-3 py-2.5 font-medium">技术状态</th>
                <th className="px-4 py-2.5 text-right font-medium">查看</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const quote = quoteBySymbol.get(row.symbol);
                const change = Number(quote?.changePct);
                return (
                  <tr
                    key={row.symbol}
                    className="focus-ring cursor-pointer border-t border-app-line/60 hover:bg-primary/5"
                    role="link"
                    tabIndex={0}
                    aria-label={`查看 ${row.name} K 线详情`}
                    onClick={() =>
                      void navigate({
                        to: "/home/market/stock/$symbol",
                        params: { symbol: row.symbol },
                        search: toStockDetailSearch({ tab, page: normalizedPage, q }),
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      void navigate({
                        to: "/home/market/stock/$symbol",
                        params: { symbol: row.symbol },
                        search: toStockDetailSearch({ tab, page: normalizedPage, q }),
                      });
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <strong className="block text-xs text-app-ink">{row.name}</strong>
                      <span className="mt-0.5 block font-mono text-[11px] text-app-muted">
                        {row.symbol}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-app-ink">
                      {quote?.last ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono font-semibold ${
                        change >= 0 ? "text-chart-up-strong" : "text-chart-down-strong"
                      }`}
                    >
                      {quote?.changePct == null
                        ? "—"
                        : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-app-ink-secondary">
                      {quote?.pe ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {technicalBySymbol.get(row.symbol) &&
                      technicalBySymbol.get(row.symbol)!.quality !== "missing" &&
                      !technicalBySymbol.get(row.symbol)!.error ? (
                        <SignalCell
                          counts={technicalBySymbol.get(row.symbol)!.counts}
                          statusLabel={
                            technicalBySymbol.get(row.symbol)!.counts.triggered > 0
                              ? "技术活跃"
                              : "中性观察"
                          }
                          keyLabel={technicalBySymbol.get(row.symbol)!.keySignals[0]}
                        />
                      ) : (
                        <span className="text-[10px] text-app-muted">
                          {technicalSummaries.isLoading
                            ? "读取中"
                            : technicalBySymbol.get(row.symbol)?.error
                              ? "读取失败"
                              : "待生成"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] font-semibold text-primary">
                      查看
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {current.isError ? (
          <p className="py-14 text-center text-xs text-destructive">
            {tab === "watchlist" ? "自选列表读取失败，请稍后重试" : "个股列表读取失败，请稍后重试"}
          </p>
        ) : !current.isLoading && rows.length === 0 ? (
          <p className="py-14 text-center text-xs text-app-muted">
            {tab === "watchlist" ? "自选列表为空" : q ? "没有匹配的 A 股" : "个股列表为空"}
          </p>
        ) : null}
        {total > 0 && totalPages > 0 ? (
          <Pagination
            className="max-sm:pb-20"
            page={normalizedPage}
            pageCount={totalPages}
            total={total}
            rangeStart={range.rangeStart}
            rangeEnd={range.rangeEnd}
            tokens={paginationTokens(normalizedPage, totalPages)}
            label={tab === "watchlist" ? "自选个股分页" : "全市场个股分页"}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </div>
  );
}
