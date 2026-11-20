import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CircleAlert,
  ExternalLink,
  GitCompareArrows,
  Minus,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { TextInput } from "@preline-ui/TextInput";
import { AddWorkTaskButton } from "../../../../../components/AddWorkTaskButton";
import {
  useAddWatchlist,
  useRemoveWatchlist,
  useWatchlistQuery,
} from "../../../../../hooks/useInstruments";
import {
  useStockAnalysisQuery,
  useRefreshStockAnalysis,
  useIngestResearchReport,
  useResearchEvidenceQuery,
  useStartResearchIndexWindow,
  type ScenarioForecast,
  type StockAnalysisResponse,
} from "../../../../../hooks/useStockAnalysis";
import {
  buildStockContentTimeline,
  formatAnalysisMoney,
  formatContentRefreshSummary,
  formatResearchIndexStatus,
  mergeRecentAnalyses,
  selectStockContentPreview,
  stockComparePath,
  type ContentRefreshSummary,
  type StockContentTimelineItem,
} from "../../../../../lib/stock-analysis";
import { RECENT_ANALYSES_KEY } from "./StockAnalysisLanding";

function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatPrice(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function sourceLabel(source: string): string {
  if (source === "quote_latest") return "实时行情";
  if (source === "bar1d_qfq") return "前复权日线";
  if (source === "eastmoney") return "东方财富";
  if (source === "research_report") return "本地研报库";
  return source;
}

function compactSourceLabel(source: string): string {
  if (source === "eastmoney" || source === "eastmoney_stock" || source === "eastmoney_global") {
    return "东财";
  }
  if (source === "cninfo") return "巨潮";
  if (source === "sina") return "新浪";
  if (source === "cls") return "财联社";
  if (source === "news_article") return "新闻库";
  if (source === "company_announcement") return "公告库";
  if (source === "research_report") return "研报库";
  return source;
}

function qualityMeta(quality: string): { label: string; variant: string } {
  if (quality === "available") return { label: "可用", variant: "success" };
  if (quality === "low") return { label: "低置信", variant: "warning" };
  return { label: "待接入", variant: "neutral" };
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-app-line bg-app-panel px-3 py-2.5">
      <span className="block text-[10px] text-app-muted">{label}</span>
      <strong className="mt-1 block font-mono text-sm text-app-ink">{value}</strong>
      {note ? <span className="mt-1 block text-[9px] text-app-faint">{note}</span> : null}
    </div>
  );
}

function statusDotClass(tone: "success" | "warning" | "error" | "neutral"): string {
  if (tone === "success") return "bg-app-success";
  if (tone === "warning") return "bg-app-warning";
  if (tone === "error") return "bg-destructive";
  return "bg-app-muted";
}

function TimelineRow({ item }: { item: StockContentTimelineItem }) {
  const tone =
    item.type === "announcement"
      ? "text-app-warning bg-app-warning/10"
      : item.type === "report"
        ? "text-app-success bg-app-success/10"
        : "text-primary bg-primary/10";
  const content = (
    <>
      <span
        className={`inline-flex w-fit rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${tone}`}
      >
        {item.type === "news" ? "新闻" : item.type === "announcement" ? "公告" : "研报"}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-[11px] leading-relaxed">{item.title}</strong>
        <span className="mt-0.5 block truncate text-[9px] text-app-muted">
          {item.source} · {item.meta}
        </span>
      </span>
      <span className="flex items-center gap-1 font-mono text-[9px] text-app-faint">
        {formatDate(item.publishedAt, item.type === "news")}
        {item.href ? <ExternalLink className="size-3" /> : null}
      </span>
    </>
  );
  const className =
    "grid grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-2.5 py-3 transition-colors";
  return item.href ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={`${className} hover:text-primary`}
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function PriceTrendChart({ prices }: { prices: StockAnalysisResponse["prices"]["data"] }) {
  const geometry = useMemo(() => {
    if (prices.length < 2) return null;
    const width = 760;
    const height = 250;
    const left = 42;
    const right = 14;
    const top = 18;
    const bottom = 28;
    const lows = prices.map((bar) => bar.low);
    const highs = prices.map((bar) => bar.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = max - min || 1;
    const x = (index: number) => left + (index / (prices.length - 1)) * (width - left - right);
    const y = (value: number) => top + ((max - value) / span) * (height - top - bottom);
    const points = prices.map((bar, index) => `${x(index).toFixed(1)},${y(bar.close).toFixed(1)}`);
    const line = `M${points.join(" L")}`;
    const area = `${line} L${x(prices.length - 1).toFixed(1)},${height - bottom} L${left},${height - bottom} Z`;
    const gridValues = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4);
    return { width, height, left, right, top, bottom, x, y, line, area, gridValues };
  }, [prices]);

  if (!geometry) {
    return (
      <EmptyState title="历史行情不足" description="至少需要两个交易日的 K 线才能绘制走势。" />
    );
  }
  return (
    <svg
      className="h-[250px] w-full"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label="最近 120 个交易日收盘价走势"
    >
      <defs>
        <linearGradient id="stock-analysis-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity=".16" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {geometry.gridValues.map((value) => (
        <g key={value}>
          <line
            x1={geometry.left}
            x2={geometry.width - geometry.right}
            y1={geometry.y(value)}
            y2={geometry.y(value)}
            stroke="var(--line)"
          />
          <text
            x={geometry.left - 7}
            y={geometry.y(value) + 3}
            textAnchor="end"
            fill="var(--ink-faint)"
            fontSize="8"
            fontFamily="monospace"
          >
            {value.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={geometry.area} fill="url(#stock-analysis-area)" />
      <path
        d={geometry.line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle
        cx={geometry.x(prices.length - 1)}
        cy={geometry.y(prices.at(-1)!.close)}
        r="4"
        fill="var(--primary)"
        stroke="var(--panel)"
        strokeWidth="3"
      />
    </svg>
  );
}

function ForecastCard({ forecast }: { forecast: ScenarioForecast }) {
  const missing = forecast.p50 == null;
  return (
    <div className="rounded-xl bg-app-surface/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] text-app-muted">
          {forecast.horizon} · P10 / P50 / P90
        </span>
        <Badge variant={qualityMeta(forecast.quality).variant}>
          {qualityMeta(forecast.quality).label}
        </Badge>
      </div>
      <strong className="mt-3 block font-mono text-lg tracking-tight text-app-ink">
        {missing ? "—" : `${formatPrice(forecast.p10)}–${formatPrice(forecast.p90)}`}
      </strong>
      <p className="mt-1.5 text-[10px] text-app-muted">
        {missing
          ? `样本 ${forecast.sampleCount} 个，暂不展示数值`
          : `中位 ${formatPrice(forecast.p50)} · 上涨概率 ${((forecast.upProbability ?? 0) * 100).toFixed(1)}%`}
      </p>
      {!missing ? (
        <p className="mt-1 text-[8px] text-app-faint">
          滚动样本外命中{" "}
          {forecast.backtestSampleCount > 0 && forecast.backtestHitRate != null
            ? `${(forecast.backtestHitRate * 100).toFixed(1)}% · ${forecast.backtestSampleCount} 次`
            : "待验证"}
        </p>
      ) : null}
      <div className="mt-2.5 flex h-1 overflow-hidden rounded-full bg-app-line-strong">
        <span
          className="bg-chart-down"
          style={{ width: `${Math.max(0, Math.min(100, (forecast.upProbability ?? 0) * 100))}%` }}
        />
        <span
          className="bg-chart-up"
          style={{
            width: `${Math.max(0, Math.min(100, 100 - (forecast.upProbability ?? 0) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

export function StockAnalysisDetail({ symbol }: { symbol: string }) {
  const analysisQuery = useStockAnalysisQuery(symbol);
  const watchlistQuery = useWatchlistQuery();
  const addWatchlist = useAddWatchlist();
  const removeWatchlist = useRemoveWatchlist();
  const refreshAnalysis = useRefreshStockAnalysis(symbol);
  const researchIndexTrigger = useStartResearchIndexWindow(symbol);
  const ingestReport = useIngestResearchReport(symbol);
  const startedIndexAction = useRef<string | null>(null);
  const [indexTriggerError, setIndexTriggerError] = useState<string | null>(null);
  const [reportQuery, setReportQuery] = useState("");
  const deferredReportQuery = useDeferredValue(reportQuery.trim());
  const evidenceQuery = useResearchEvidenceQuery(symbol, deferredReportQuery);
  const data = analysisQuery.data;
  const reportIndexAction = data?.reportIndex.action;
  const watched = watchlistQuery.data?.includes(symbol) ?? false;
  const compareSymbols = useMemo(
    () => [symbol, ...(watchlistQuery.data ?? []).filter((item) => item !== symbol).slice(0, 2)],
    [symbol, watchlistQuery.data],
  );
  const timeline = useMemo(
    () =>
      data
        ? buildStockContentTimeline({
            news: data.news.data,
            announcements: data.announcements.data,
            reports: data.reports.data,
          })
        : [],
    [data],
  );
  const timelinePreview = useMemo(() => selectStockContentPreview(timeline), [timeline]);
  const refreshSummary: ContentRefreshSummary | null = refreshAnalysis.isError
    ? {
        tone: "error",
        label: "内容刷新请求失败",
        detail:
          refreshAnalysis.error instanceof Error ? refreshAnalysis.error.message : "请稍后重试。",
        failedModules: ["新闻", "公告", "研报"],
      }
    : refreshAnalysis.data
      ? formatContentRefreshSummary(refreshAnalysis.data)
      : null;

  const queueResearchIndex = useCallback(async () => {
    setIndexTriggerError(null);
    try {
      await researchIndexTrigger.mutateAsync();
    } catch (error) {
      startedIndexAction.current = null;
      setIndexTriggerError(error instanceof Error ? error.message : "研报索引任务提交失败");
    }
  }, [researchIndexTrigger.mutateAsync]);

  useEffect(() => {
    if (!reportIndexAction) return;
    if (reportIndexAction === "none") {
      startedIndexAction.current = null;
      setIndexTriggerError(null);
      return;
    }
    if (startedIndexAction.current === reportIndexAction) return;
    startedIndexAction.current = reportIndexAction;
    void queueResearchIndex();
  }, [queueResearchIndex, reportIndexAction]);

  useEffect(() => {
    if (!data?.name) return;
    try {
      const raw = globalThis.localStorage?.getItem(RECENT_ANALYSES_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const latest = {
        symbol: data.symbol,
        name: data.name,
        viewedAt: new Date().toISOString(),
      };
      globalThis.localStorage?.setItem(
        RECENT_ANALYSES_KEY,
        JSON.stringify(mergeRecentAnalyses(Array.isArray(existing) ? existing : [], latest)),
      );
    } catch {
      // Recent-analysis persistence is optional.
    }
  }, [data?.name, data?.symbol]);

  if (analysisQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4" aria-label="正在加载个股分析">
        <div className="h-28 animate-pulse rounded-2xl bg-app-surface" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
          <div className="h-80 animate-pulse rounded-2xl bg-app-surface" />
          <div className="h-80 animate-pulse rounded-2xl bg-app-surface" />
        </div>
      </div>
    );
  }

  if (analysisQuery.isError || !data) {
    return (
      <Card variant="detached" className="mx-auto max-w-xl p-8 text-center">
        <CircleAlert className="mx-auto size-5 text-destructive" />
        <Heading level={2} className="mt-3">
          个股分析暂时无法读取
        </Heading>
        <Text as="p" type="supporting" className="mt-1.5">
          {analysisQuery.error instanceof Error ? analysisQuery.error.message : "请稍后重试"}
        </Text>
        <Button
          className="mt-4"
          label="重新加载"
          variant="secondary"
          onClick={() => void analysisQuery.refetch()}
        />
      </Card>
    );
  }

  const quote = data.quote.data;
  const technical = data.technical.data;
  const change = quote?.changePct ?? null;
  const reportQuality = qualityMeta(data.reports.quality);
  const fundQuality = qualityMeta(data.funds.quality);
  const forecast20 = data.forecasts.data.find((item) => item.horizon === "20D");
  const risk = data.riskReferenceRange.data;
  const refreshModules = refreshAnalysis.data?.modules;
  const newsSource = compactSourceLabel(data.news.data[0]?.source ?? "");
  const announcementSource = compactSourceLabel(data.announcements.data[0]?.source ?? "");
  const reportSource = compactSourceLabel(data.reports.data[0]?.source ?? "");
  const reportIndexView = formatResearchIndexStatus(data.reportIndex);
  const statusItems: Array<{
    label: string;
    value: string;
    tone: "success" | "warning" | "error" | "neutral";
    detail?: string;
    isActive?: boolean;
  }> = [
    {
      label: "实时行情",
      value:
        data.quote.quality === "available"
          ? `${formatDate(data.quote.asOf, true)} · 可用`
          : "行情陈旧",
      tone: data.quote.quality === "available" ? "success" : "warning",
    },
    {
      label: "个股新闻",
      value: refreshModules
        ? refreshModules.news.ok
          ? `${refreshModules.news.total} 条 · ${newsSource || "新闻库"} · ${formatDate(refreshModules.news.observedAt, true)}`
          : "刷新失败 · 保留旧数据"
        : `${data.news.data.length} 条 · ${newsSource || "待接入"} · ${formatDate(data.news.asOf, true)}`,
      tone: refreshModules
        ? refreshModules.news.ok
          ? "success"
          : "error"
        : data.news.quality === "available"
          ? "success"
          : "neutral",
    },
    {
      label: "公司公告",
      value: refreshModules
        ? refreshModules.announcements.ok
          ? `${refreshModules.announcements.total} 条 · ${announcementSource || "公告库"} · ${formatDate(refreshModules.announcements.observedAt, true)}`
          : "刷新失败 · 保留旧数据"
        : `${data.announcements.data.length} 条 · ${announcementSource || "待接入"} · ${formatDate(data.announcements.asOf, true)}`,
      tone: refreshModules
        ? refreshModules.announcements.ok
          ? "success"
          : "error"
        : data.announcements.quality === "available"
          ? "success"
          : "warning",
    },
    {
      label: "研报元数据",
      value: refreshModules
        ? refreshModules.reports.ok
          ? `${refreshModules.reports.total} 篇 · ${reportSource || "研报库"} · ${formatDate(refreshModules.reports.observedAt, true)}`
          : "刷新失败 · 保留旧数据"
        : `${data.reportCount} 篇 · ${reportSource || "待接入"} · ${formatDate(data.reports.asOf, true)}`,
      tone: refreshModules
        ? refreshModules.reports.ok
          ? "success"
          : "error"
        : data.reportCount > 0
          ? "success"
          : "neutral",
    },
    {
      label: "研报全文",
      value: reportIndexView.label,
      tone: reportIndexView.tone,
      detail: reportIndexView.detail,
      isActive: reportIndexView.isActive,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
            STOCK RESEARCH · {data.symbol}
          </p>
          <div className="mt-1 flex items-center gap-2.5">
            <Heading level={1} className="text-4xl tracking-[-0.05em] md:text-[48px]">
              {data.name}
            </Heading>
            <Badge variant="neutral" className="font-mono">
              {data.symbol}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="neutral">{data.exchange} 交易所</Badge>
            <Badge variant="neutral">{data.status === "listed" ? "正常交易" : data.status}</Badge>
            <Badge variant={reportQuality.variant}>研报 {data.reportCount} 篇</Badge>
            <Badge variant={fundQuality.variant}>资金 {fundQuality.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-baseline gap-2">
            <strong
              className={`font-mono text-3xl tracking-tight ${change == null ? "text-app-ink" : change > 0 ? "text-chart-up" : "text-chart-down"}`}
            >
              {formatPrice(quote?.last)}
            </strong>
            <span
              className={`font-mono text-[11px] ${change == null ? "text-app-muted" : change > 0 ? "text-chart-up" : "text-chart-down"}`}
            >
              {formatPercent(change)}
            </span>
          </div>
          <Badge variant={qualityMeta(data.quote.quality).variant}>
            {sourceLabel(data.quote.source)} · {formatDate(data.quote.asOf, true)}
          </Badge>
          <Button
            label={watched ? "移出自选" : "加入自选"}
            icon={watched ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
            variant="secondary"
            isLoading={addWatchlist.isPending || removeWatchlist.isPending}
            onClick={() => {
              if (watched) removeWatchlist.mutate(symbol);
              else addWatchlist.mutate(symbol);
            }}
          />
          <Button
            label="加入对比"
            icon={<GitCompareArrows className="size-3.5" />}
            variant="secondary"
            href={stockComparePath(compareSymbols)}
          />
          <AddWorkTaskButton
            sourceType="stock"
            sourceId={symbol}
            label="加入工作任务"
          />
          <Button
            label="重新分析"
            icon={<RefreshCw className="size-3.5" />}
            variant="primary"
            isLoading={refreshAnalysis.isPending}
            onClick={() => refreshAnalysis.mutate()}
          />
        </div>
      </header>

      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5"
        aria-label="内容刷新与数据完整度"
      >
        {statusItems.map((item, index) => (
          <div
            key={item.label}
            title={item.detail}
            className={`min-w-0 rounded-lg border border-app-line bg-app-panel/75 px-2.5 py-2 ${
              index === statusItems.length - 1 ? "col-span-2 md:col-span-1" : ""
            }`}
          >
            <span className="block text-[11px] text-app-muted">{item.label}</span>
            <strong className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-medium text-app-ink">
              <span
                className={`size-1.5 shrink-0 rounded-full ${statusDotClass(item.tone)} ${
                  item.isActive ? "animate-pulse motion-reduce:animate-none" : ""
                }`}
              />
              {item.value}
            </strong>
          </div>
        ))}
      </div>

      {refreshSummary && refreshSummary.tone !== "success" ? (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed ${
            refreshSummary.tone === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-app-warning/30 bg-app-warning/5 text-app-ink"
          }`}
        >
          <CircleAlert
            className={`mt-0.5 size-4 shrink-0 ${
              refreshSummary.tone === "error" ? "text-destructive" : "text-app-warning"
            }`}
          />
          <span>
            <strong className="mr-1">{refreshSummary.label}</strong>
            {refreshSummary.detail}
          </span>
        </div>
      ) : null}

      {indexTriggerError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-[11px] leading-relaxed text-destructive"
        >
          <CircleAlert className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">研报索引任务提交失败：{indexTriggerError}</span>
          <Button
            label="重试提交"
            variant="secondary"
            isLoading={researchIndexTrigger.isPending}
            onClick={() => void queueResearchIndex()}
          />
        </div>
      ) : null}

      {data.reportIndex.failed > 0 ? (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed ${
            data.reportIndex.extracted > 0
              ? "border-app-warning/30 bg-app-warning/5 text-app-ink"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          <CircleAlert
            className={`mt-0.5 size-4 shrink-0 ${
              data.reportIndex.extracted > 0 ? "text-app-warning" : "text-destructive"
            }`}
          />
          <span>
            <strong className="mr-1">
              {data.reportIndex.extracted > 0 ? "研报全文部分失败" : "研报全文提取失败"}
            </strong>
            {reportIndexView.detail}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>价格与趋势</Heading>
              <Text as="p" type="supporting">
                前复权日线 · 最近 {data.prices.data.length} 个交易日
              </Text>
            </div>
            <Badge variant={qualityMeta(data.prices.quality).variant}>
              K 线 · {formatDate(data.prices.asOf)}
            </Badge>
          </div>
          <div className="px-4 pb-4 pt-3">
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-app-muted">
              {technical ? (
                <>
                  <span>
                    MA20 <b className="font-mono text-app-ink">{technical.ma20.toFixed(2)}</b>
                  </span>
                  <span>
                    MA60 <b className="font-mono text-app-ink">{technical.ma60.toFixed(2)}</b>
                  </span>
                  <span>
                    RSI14 <b className="font-mono text-app-ink">{technical.rsi14.toFixed(1)}</b>
                  </span>
                  <span>
                    20日支撑{" "}
                    <b className="font-mono text-app-ink">{technical.support20.toFixed(2)}</b>
                  </span>
                  <span>
                    60日压力{" "}
                    <b className="font-mono text-app-ink">{technical.resistance60.toFixed(2)}</b>
                  </span>
                </>
              ) : (
                <span>技术指标待生成</span>
              )}
            </div>
            <PriceTrendChart prices={data.prices.data} />
            <div className="flex justify-between text-[9px] text-app-muted">
              <span>{data.prices.data.at(0)?.time.slice(0, 10) ?? "暂无"}</span>
              <span>{data.prices.data.at(-1)?.time.slice(0, 10) ?? "暂无"}</span>
            </div>
          </div>
        </Card>

        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>研究摘要</Heading>
              <Text as="p" type="supporting">
                事实、推断与情景分层展示
              </Text>
            </div>
            <Badge variant={qualityMeta(data.summary.quality).variant}>
              {qualityMeta(data.summary.quality).label}
            </Badge>
          </div>
          <div className="p-4">
            <p className="font-mono text-[9px] font-semibold tracking-[0.1em] text-primary">
              DETERMINISTIC SYNTHESIS · EVIDENCE LINKED
            </p>
            <Heading level={2} className="mt-3 text-xl leading-snug">
              {data.summary.title}
            </Heading>
            <Text as="p" type="supporting" className="mt-3 leading-relaxed">
              {data.summary.body}
            </Text>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.summary.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-4 border-t border-app-line pt-3 text-[9px] leading-relaxed text-app-faint">
              本页为研究辅助，不构成投资建议。预测数字来自历史统计模型，正式结论需通过滚动样本外验证。
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>情景预测</Heading>
              <Text as="p" type="supporting">
                历史收益 bootstrap · 非目标价
              </Text>
            </div>
            <Badge variant={qualityMeta(data.forecasts.quality).variant}>
              {qualityMeta(data.forecasts.quality).label}
            </Badge>
          </div>
          <div className="grid gap-2 p-3.5">
            {data.forecasts.data.map((forecast) => (
              <ForecastCard key={forecast.horizon} forecast={forecast} />
            ))}
          </div>
        </Card>

        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>风险参考区间</Heading>
              <Text as="p" type="supporting">
                技术、估值与情景分别解释
              </Text>
            </div>
            <Badge variant={qualityMeta(data.riskReferenceRange.quality).variant}>20D</Badge>
          </div>
          <div className="p-4">
            <div className="mt-2 grid h-8 grid-cols-3 overflow-hidden rounded-lg bg-app-surface text-center font-mono text-[9px]">
              <span className="grid place-items-center bg-chart-down/10 text-chart-down">
                {formatPrice(forecast20?.p10)}
              </span>
              <span className="grid place-items-center bg-primary/10 text-primary">
                {formatPrice(forecast20?.p50)}
              </span>
              <span className="grid place-items-center bg-chart-up/10 text-chart-up">
                {formatPrice(forecast20?.p90)}
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <Metric
                label="技术区间"
                value={
                  risk.technical
                    ? `${risk.technical.low.toFixed(2)}–${risk.technical.high.toFixed(2)}`
                    : "待接入"
                }
              />
              <Metric
                label="估值区间"
                value={
                  risk.valuation
                    ? `${risk.valuation.low.toFixed(2)}–${risk.valuation.high.toFixed(2)}`
                    : "待接入"
                }
              />
              <Metric
                label="情景区间"
                value={
                  risk.scenario
                    ? `${risk.scenario.low.toFixed(2)}–${risk.scenario.high.toFixed(2)}`
                    : "待接入"
                }
              />
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-app-muted">
              风险参考区间不是保本价格。估值区间需要一致预期 EPS 与历史 PE 分位。
            </p>
          </div>
        </Card>

        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>机构预测</Heading>
              <Text as="p" type="supporting">
                一致预期与研报样本
              </Text>
            </div>
            <Badge variant={qualityMeta(data.consensus.quality).variant}>
              {qualityMeta(data.consensus.quality).label}
            </Badge>
          </div>
          {data.consensus.data ? (
            <div className="grid grid-cols-2 gap-px bg-app-line">
              <Metric
                label={`${data.consensus.data.fiscalYear} EPS 区间`}
                value={`${formatPrice(data.consensus.data.epsMin)}–${formatPrice(data.consensus.data.epsMax)}`}
                note={`均值 ${formatPrice(data.consensus.data.epsMean)}`}
              />
              <Metric
                label="覆盖机构"
                value={`${data.consensus.data.analystCount ?? "—"} 家`}
                note={data.consensus.source}
              />
              <Metric
                label="预测年份"
                value={`FY ${data.consensus.data.fiscalYear}`}
                note={`截至 ${formatDate(data.consensus.asOf)}`}
              />
              <Metric
                label="一致预期状态"
                value={qualityMeta(data.consensus.quality).label}
                note="不生成目标价"
              />
            </div>
          ) : (
            <EmptyState
              title="一致预期待接入"
              description="同花顺 EPS 数据进入后，才计算前瞻估值区间。"
            />
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>研报与证据检索</Heading>
              <Text as="p" type="supporting">
                按标的、主题和页码检索原文片段
              </Text>
            </div>
            <Badge variant={reportQuality.variant}>{data.reportCount} 篇</Badge>
          </div>
          <div className="px-4 py-3">
            <TextInput
              label="检索研报全文"
              isLabelHidden
              value={reportQuery}
              onChange={setReportQuery}
              placeholder={
                reportQuality.label === "待接入"
                  ? "研报同步后可按主题检索全文"
                  : "搜索海外、盈利、估值、风险…"
              }
              startIcon={<Search className="size-3.5" />}
              hasClear
              isDisabled={reportQuality.label === "待接入"}
            />
            {deferredReportQuery ? (
              <div className="mt-2 divide-y divide-app-line/60">
                {evidenceQuery.isLoading ? (
                  <p className="py-5 text-center text-xs text-app-muted">正在检索证据…</p>
                ) : evidenceQuery.data?.items.length ? (
                  evidenceQuery.data.items.map((evidence) => (
                    <div
                      key={`${evidence.reportId}-${evidence.pageFrom}-${evidence.excerpt?.slice(0, 12)}`}
                      className="py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="min-w-0 truncate text-[11px] text-app-ink">
                          {evidence.title}
                        </strong>
                        <Badge variant="neutral">
                          {evidence.pageFrom == null
                            ? "元数据"
                            : `p.${evidence.pageFrom}–${evidence.pageTo}`}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-app-muted">
                        {evidence.excerpt ?? "该研报仅完成元数据同步，暂无全文片段。"}
                      </p>
                      <p className="mt-1 text-[8px] text-app-faint">
                        {evidence.institution ?? "机构未知"} · {evidence.publishDate}
                        {evidence.similarity == null
                          ? " · 关键词匹配"
                          : ` · ${(evidence.similarity * 100).toFixed(1)}%`}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title={reportIndexView.isActive ? "全文索引尚未完成" : "没有匹配的研报证据"}
                    description={
                      reportIndexView.isActive
                        ? "全文索引正在后台处理，完成后可按页码检索原文片段。"
                        : reportIndexView.tone === "neutral"
                          ? reportIndexView.detail
                          : "换用更短的主题词，或检查是否有可检索的研报全文。"
                    }
                  />
                )}
              </div>
            ) : data.reports.data.length > 0 ? (
              <div className="mt-2 divide-y divide-app-line/60">
                {data.reports.data.map((report) => (
                  <div
                    key={report.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5"
                  >
                    {report.rating ? (
                      <Badge variant="error">{report.rating}</Badge>
                    ) : (
                      <BookOpenText className="size-3.5 text-primary" />
                    )}
                    <div className="min-w-0">
                      <strong className="block truncate text-[11px] text-app-ink">
                        {report.title}
                      </strong>
                      <span className="mt-0.5 block truncate text-[9px] text-app-muted">
                        {report.institution ?? "机构未知"} · {report.extractStatus ?? "元数据"}
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] text-app-faint">
                      {report.publishDate.slice(5)}
                      {report.storageKey || report.pdfUrl ? (
                        <a
                          href={
                            report.storageKey
                              ? `/api/v1/research-reports/${report.id}/pdf`
                              : report.pdfUrl!
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring rounded text-primary"
                          aria-label={`打开研报：${report.title}`}
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                      {report.pdfUrl && report.extractStatus !== "extracted" ? (
                        <button
                          type="button"
                          className="focus-ring rounded text-[8px] text-primary hover:underline"
                          disabled={ingestReport.isPending && ingestReport.variables === report.id}
                          onClick={() => ingestReport.mutate(report.id)}
                        >
                          {ingestReport.isPending && ingestReport.variables === report.id
                            ? "提交中"
                            : report.extractStatus === "failed"
                              ? "重试全文"
                              : "提取全文"}
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="尚无本地研报"
                description="研报元数据同步后，会展示评级、机构、EPS 和 PDF 状态。"
              />
            )}
          </div>
        </Card>

        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>财务与估值</Heading>
              <Text as="p" type="supporting">
                最新快照与历史分位
              </Text>
            </div>
            <Badge variant={qualityMeta(data.fundamentals.quality).variant}>
              {qualityMeta(data.fundamentals.quality).label}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3.5">
            <Metric
              label="PE TTM"
              value={formatPrice(quote?.pe)}
              note={sourceLabel(data.quote.source)}
            />
            <Metric
              label="PB"
              value={formatPrice(quote?.pb)}
              note={sourceLabel(data.quote.source)}
            />
            <Metric
              label="总市值"
              value={formatAnalysisMoney(quote?.totalMarketCap)}
              note="实时行情"
            />
            <Metric label="换手率" value={formatPercent(quote?.turnoverRate)} note="实时行情" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>资金与筹码</Heading>
              <Text as="p" type="supporting">
                主力净流入与筹码推演
              </Text>
            </div>
            <Badge variant={fundQuality.variant}>资金 {formatDate(data.funds.asOf)}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3.5">
            <Metric label="最新主力" value={formatAnalysisMoney(data.fundSummary.latest)} />
            <Metric label="近 5 日" value={formatAnalysisMoney(data.fundSummary.fiveDay)} />
            <Metric label="近 20 日" value={formatAnalysisMoney(data.fundSummary.twentyDay)} />
          </div>
          <div className="mx-4 mb-4 rounded-lg border border-dashed border-app-line-strong bg-app-surface/45 p-3 text-[9px] leading-relaxed text-app-muted">
            筹码分布将在历史 OHLC 与换手率完整接入后推演，并明确标注为模型估算值。
          </div>
        </Card>

        <Card variant="detached" className="overflow-hidden" data-stock-events>
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>新闻与事件</Heading>
              <Text as="p" type="supporting">
                新闻、公告、研报统一时间线 · 各来源独立更新
              </Text>
            </div>
            <Badge variant="neutral">{timeline.length} 条</Badge>
          </div>
          {timeline.length > 0 ? (
            <div className="divide-y divide-app-line/60 px-4">
              {timelinePreview.map((item) => (
                <TimelineRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="暂无关联事件"
              description="重新分析后，新闻、公告和研报会按时间进入统一事件流。"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
