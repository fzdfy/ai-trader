import { useDeferredValue, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, GitCompareArrows, Plus, Search, X } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { TextInput } from "@preline-ui/TextInput";
import { Link } from "@tanstack/react-router";
import { useInstrumentsQuery } from "../../../../../hooks/useInstruments";
import { useStockComparisonQuery } from "../../../../../hooks/useStockAnalysis";
import { formatAnalysisMoney, normalizeCompareSymbols } from "../../../../../lib/stock-analysis";

function formatPrice(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function qualityLabel(quality: string): { label: string; variant: string } {
  if (quality === "available") return { label: "可比较", variant: "success" };
  if (quality === "low") return { label: "低置信", variant: "warning" };
  return { label: "暂不可比较", variant: "neutral" };
}

export function StockComparison({ symbols }: { symbols: readonly string[] }) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const comparisonQuery = useStockComparisonQuery(symbols);
  const instrumentQuery = useInstrumentsQuery(deferredQuery);
  const searchResults = instrumentQuery.data?.pages.flatMap((page) => page.data).slice(0, 8) ?? [];
  const items = comparisonQuery.data?.items ?? [];
  const normalized = normalizeCompareSymbols(symbols);

  const updateSymbols = (next: string[]) => {
    void navigate({
      to: "/home/market/analysis/compare",
      search: { symbols: normalizeCompareSymbols(next).join(",") },
      replace: true,
    });
  };

  if (comparisonQuery.isLoading) {
    return (
      <div className="mx-auto space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-app-surface" />
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-app-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (comparisonQuery.isError) {
    return (
      <Card variant="detached" className="mx-auto max-w-xl p-8 text-center">
        <Heading level={2}>个股对比暂时无法读取</Heading>
        <Text as="p" type="supporting" className="mt-1.5">
          {comparisonQuery.error instanceof Error ? comparisonQuery.error.message : "请稍后重试"}
        </Text>
        <Button
          className="mt-4"
          label="重新加载"
          variant="secondary"
          onClick={() => void comparisonQuery.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto space-y-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
            STOCK RESEARCH · COMPARE {String(items.length).padStart(2, "0")}
          </p>
          <Heading level={1} className="mt-1 text-3xl tracking-[-0.04em] md:text-[42px]">
            个股对比
          </Heading>
          <Text as="p" type="supporting" className="mt-1.5">
            在同一时间截面比较行情、估值、机构覆盖和预测完整度。
          </Text>
        </div>
        <Button
          label="添加股票"
          icon={<Plus className="size-3.5" />}
          variant="primary"
          onClick={() => setPickerOpen((open) => !open)}
        />
      </header>

      {pickerOpen ? (
        <Card variant="detached" className="p-4">
          <div className="flex items-center gap-2">
            <TextInput
              label="搜索对比股票"
              isLabelHidden
              value={query}
              onChange={setQuery}
              placeholder="搜索名称或代码"
              startIcon={<Search className="size-3.5" />}
              hasClear
              className="min-w-0 flex-1"
            />
            <Button label="关闭" variant="ghost" onClick={() => setPickerOpen(false)} />
          </div>
          {deferredQuery ? (
            <div className="mt-3 divide-y divide-app-line overflow-hidden rounded-xl border border-app-line">
              {searchResults.length > 0 ? (
                searchResults.map((item) => {
                  const selected = normalized.includes(item.symbol);
                  return (
                    <button
                      key={item.symbol}
                      type="button"
                      className="focus-ring grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-app-surface disabled:opacity-50"
                      disabled={selected || normalized.length >= 5}
                      onClick={() => {
                        updateSymbols([...normalized, item.symbol]);
                        setQuery("");
                        setPickerOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-xs">{item.name}</strong>
                        <span className="mt-0.5 block font-mono text-[9px] text-app-muted">
                          {item.symbol}
                        </span>
                      </span>
                      <Badge variant={selected ? "neutral" : "default"}>
                        {selected ? "已选" : "加入"}
                      </Badge>
                    </button>
                  );
                })
              ) : instrumentQuery.isFetching ? (
                <p className="px-3 py-5 text-center text-xs text-app-muted">正在搜索…</p>
              ) : (
                <EmptyState title="没有匹配的 A 股" />
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card variant="detached" className="p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className="mr-2 text-xs text-app-ink">正在对比 {items.length} 只</strong>
          {items.map((item) => (
            <span
              key={item.symbol}
              className="inline-flex items-center gap-1.5 rounded-lg border border-app-line bg-app-panel px-2.5 py-1.5 text-[10px] text-app-ink"
            >
              <Link
                to="/home/market/analysis/$symbol"
                params={{ symbol: item.symbol }}
                className="hover:text-primary"
              >
                {item.name}
              </Link>
              <i className="font-mono text-[8px] not-italic text-app-muted">{item.symbol}</i>
              <button
                type="button"
                className="focus-ring grid size-5 place-items-center rounded text-app-muted hover:bg-app-surface hover:text-destructive"
                aria-label={`移除${item.name}`}
                onClick={() => updateSymbols(normalized.filter((symbol) => symbol !== item.symbol))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <span className="ml-auto text-[9px] text-app-muted">
            行情同为 {comparisonQuery.data?.asOf?.slice(0, 10) ?? "待确认"} · 最多 5 只
          </span>
        </div>
      </Card>

      {normalized.length === 0 ? (
        <Card variant="detached" className="p-8 text-center">
          <GitCompareArrows className="mx-auto size-6 text-primary" />
          <Heading level={2} className="mt-3">
            还没有加入对比的股票
          </Heading>
          <Text as="p" type="supporting" className="mt-1.5">
            搜索并加入股票；加入两只后即可比较行情、估值和预测完整度。
          </Text>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              label="添加股票"
              icon={<Plus className="size-3.5" />}
              onClick={() => setPickerOpen(true)}
            />
            <Link
              to="/home/market/analysis"
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl border border-app-line bg-app-panel px-4 text-xs font-medium text-app-ink"
            >
              返回个股分析
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => (
              <Card
                key={item.symbol}
                variant="detached"
                className={`p-4 ${index === 0 ? "border-primary/35 shadow-[inset_3px_0_var(--primary)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Heading level={2}>{item.name}</Heading>
                    <Text as="p" type="supporting" className="font-mono">
                      {item.symbol}
                    </Text>
                  </div>
                  <Badge variant={qualityLabel(item.quote.quality).variant}>
                    {qualityLabel(item.quote.quality).label}
                  </Badge>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <strong className="font-mono text-2xl tracking-tight">
                    {formatPrice(item.quote.last)}
                  </strong>
                  <span
                    className={`font-mono text-[10px] ${
                      item.quote.changePct == null
                        ? "text-app-muted"
                        : item.quote.changePct > 0
                          ? "text-chart-up"
                          : "text-chart-down"
                    }`}
                  >
                    {formatPercent(item.quote.changePct)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-app-line bg-app-line">
                  {[
                    ["PE TTM", formatPrice(item.quote.pe)],
                    ["PB", formatPrice(item.quote.pb)],
                    ["研报", `${item.reportCount} 篇`],
                  ].map(([label, value]) => (
                    <span key={label} className="bg-app-panel px-2 py-2 text-[9px] text-app-muted">
                      {label}
                      <b className="mt-1 block font-mono text-[10px] text-app-ink">{value}</b>
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,.7fr)]">
            <Card variant="detached" className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
                <div>
                  <Heading level={2}>核心指标对照</Heading>
                  <Text as="p" type="supporting">
                    相同列代表同一口径；缺失值不参与横向排名
                  </Text>
                </div>
                <Badge variant="neutral">
                  截至 {comparisonQuery.data?.asOf?.slice(0, 10) ?? "暂无"}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-app-surface px-3 py-2.5 text-left font-medium text-app-muted">
                        指标
                      </th>
                      {items.map((item) => (
                        <th
                          key={item.symbol}
                          className="bg-app-surface px-3 py-2.5 text-right font-medium text-app-muted"
                        >
                          {item.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "最新价",
                        read: (item: (typeof items)[number]) => formatPrice(item.quote.last),
                      },
                      {
                        label: "今日涨跌",
                        read: (item: (typeof items)[number]) => formatPercent(item.quote.changePct),
                      },
                      {
                        label: "PE TTM",
                        read: (item: (typeof items)[number]) => formatPrice(item.quote.pe),
                      },
                      {
                        label: "PB",
                        read: (item: (typeof items)[number]) => formatPrice(item.quote.pb),
                      },
                      {
                        label: "总市值",
                        read: (item: (typeof items)[number]) =>
                          formatAnalysisMoney(item.quote.totalMarketCap),
                      },
                      {
                        label: "研报覆盖",
                        read: (item: (typeof items)[number]) => `${item.reportCount} 篇`,
                      },
                      {
                        label: "预测完整度",
                        read: (item: (typeof items)[number]) =>
                          qualityLabel(item.forecastQuality).label,
                      },
                    ].map(({ label, read }) => (
                      <tr key={label} className="border-t border-app-line">
                        <td className="sticky left-0 z-10 bg-app-panel px-3 py-2.5 text-app-muted">
                          {label}
                        </td>
                        {items.map((item) => (
                          <td
                            key={item.symbol}
                            className="px-3 py-2.5 text-right font-mono text-app-ink"
                          >
                            {read(item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card variant="detached" className="overflow-hidden">
              <div className="border-b border-app-line px-4 py-3.5">
                <Heading level={2}>可比口径与缺项</Heading>
                <Text as="p" type="supporting">
                  先说明边界，再解释差异
                </Text>
              </div>
              <div className="space-y-2 p-3.5">
                <div className="rounded-r-lg border-l-2 border-primary bg-app-surface/60 p-3">
                  <span className="text-[9px] text-app-muted">机构覆盖</span>
                  <strong className="mt-1 block text-[11px]">
                    {items.toSorted((left, right) => right.reportCount - left.reportCount)[0]?.name}{" "}
                    的研报覆盖最高
                  </strong>
                  <p className="mt-1 text-[9px] leading-relaxed text-app-muted">
                    {items.map((item) => `${item.name} ${item.reportCount} 篇`).join(" / ")}
                    ；数量只说明信息量。
                  </p>
                </div>
                <div className="rounded-r-lg border-l-2 border-primary bg-app-surface/60 p-3">
                  <span className="text-[9px] text-app-muted">估值</span>
                  <strong className="mt-1 block text-[11px]">
                    PE 与 PB 仅在同一报告口径下比较
                  </strong>
                  <p className="mt-1 text-[9px] leading-relaxed text-app-muted">
                    当前来源为腾讯行情快照；亏损公司 PE 不参与估值排序。
                  </p>
                </div>
                <div className="rounded-r-lg border-l-2 border-app-warning bg-app-warning-soft/45 p-3">
                  <span className="text-[9px] text-app-muted">预测缺项</span>
                  <strong className="mt-1 block text-[11px]">
                    {items.filter((item) => item.forecastQuality === "available").length} /{" "}
                    {items.length} 只具备完整预测
                  </strong>
                  <p className="mt-1 text-[9px] leading-relaxed text-app-muted">
                    缺失输入不会补造数字，也不会把“无法比较”误读成低风险。
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card variant="detached" className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
              <div>
                <Heading level={2}>情景预测可比性</Heading>
                <Text as="p" type="supporting">
                  使用相同模型版本和最小样本后才进入数值比较
                </Text>
              </div>
              <Badge variant="neutral">
                {items.filter((item) => item.forecastQuality === "available").length} /{" "}
                {items.length} 可比较
              </Badge>
            </div>
            <div className="grid gap-px bg-app-line md:grid-cols-3">
              {items.map((item) => (
                <div
                  key={item.symbol}
                  className={`bg-app-panel p-3.5 ${item.forecastQuality === "missing" ? "bg-app-surface/30" : ""}`}
                >
                  <span className="text-[9px] text-app-muted">
                    {item.name} · {qualityLabel(item.forecastQuality).label}
                  </span>
                  {item.forecasts.every((forecast) => forecast.p50 == null) ? (
                    <>
                      <strong className="mt-2 block text-[10px]">等待补齐历史行情与模型版本</strong>
                      <p className="mt-1 text-[9px] text-app-muted">
                        当前不生成替代数字，也不参与组合排名。
                      </p>
                    </>
                  ) : (
                    <>
                      <strong className="mt-2 block font-mono text-[10px] leading-relaxed">
                        {item.forecasts
                          .map(
                            (forecast) =>
                              `${forecast.horizon} ${formatPrice(forecast.p10)}–${formatPrice(forecast.p90)}`,
                          )
                          .join(" · ")}
                      </strong>
                      <p className="mt-1 text-[9px] text-app-muted">
                        {item.forecasts
                          .map(
                            (forecast) =>
                              `${forecast.horizon} ${((forecast.upProbability ?? 0) * 100).toFixed(1)}%`,
                          )
                          .join(" / ")}{" "}
                        上涨概率。
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
