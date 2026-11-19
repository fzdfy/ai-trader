import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
  type ScenarioForecast,
  type StockAnalysisResponse,
} from "../../../../../hooks/useStockAnalysis";
import {
  formatAnalysisMoney,
  mergeRecentAnalyses,
  stockComparePath,
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
  const ingestReport = useIngestResearchReport(symbol);
  const [reportQuery, setReportQuery] = useState("");
  const deferredReportQuery = useDeferredValue(reportQuery.trim());
  const evidenceQuery = useResearchEvidenceQuery(symbol, deferredReportQuery);
  const data = analysisQuery.data;
  const watched = watchlistQuery.data?.includes(symbol) ?? false;
  const compareSymbols = useMemo(
    () => [symbol, ...(watchlistQuery.data ?? []).filter((item) => item !== symbol).slice(0, 2)],
    [symbol, watchlistQuery.data],
  );

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
          <Button
            label="重新分析"
            icon={<RefreshCw className="size-3.5" />}
            variant="primary"
            isLoading={refreshAnalysis.isPending}
            onClick={() => refreshAnalysis.mutate()}
          />
        </div>
      </header>

      <Card
        variant="detached"
        className="grid gap-2 bg-app-surface/55 p-2 sm:grid-cols-2 xl:grid-cols-5"
      >
        {[
          [
            "实时行情",
            data.quote.quality === "available"
              ? `${formatDate(data.quote.asOf, true)} · 可用`
              : "行情陈旧",
          ],
          [
            "历史 K 线",
            data.prices.quality === "available" ? `${data.prices.data.length} 根 · 可用` : "待同步",
          ],
          ["研报元数据", `${data.reportCount} 篇 · ${reportQuality.label}`],
          ["财务与估值", data.fundamentals.quality === "available" ? "可用" : "待接入"],
          [
            "向量索引",
            data.reports.data.some((item) => item.extractStatus === "extracted")
              ? "可用"
              : "待构建",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border border-app-line bg-app-panel px-3 py-2"
          >
            <span
              className={`size-1.5 rounded-full ${String(value).includes("待") ? "bg-app-warning" : "bg-app-success"}`}
            />
            <span className="text-[10px] text-app-muted">{label}</span>
            <strong className="ml-auto text-[10px] font-medium text-app-ink">{value}</strong>
          </div>
        ))}
      </Card>

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
                    title="没有匹配的研报证据"
                    description="换用更短的主题词，或先完成 PDF 全文提取。"
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
                            ? "提取中"
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

        <Card variant="detached" className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2}>新闻与事件</Heading>
              <Text as="p" type="supporting">
                新闻、公告、研报统一时间线
              </Text>
            </div>
            <Badge variant={qualityMeta(data.news.quality).variant}>
              关联 {data.news.data.length}
            </Badge>
          </div>
          {data.news.data.length > 0 || data.announcements.data.length > 0 ? (
            <div className="divide-y divide-app-line/60 px-4">
              {data.news.data.slice(0, 5).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 py-3 hover:text-primary"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px]">{item.title}</strong>
                    <span className="mt-0.5 block text-[9px] text-app-muted">
                      {item.source} · {formatDate(item.publishedAt, true)}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 text-app-faint" />
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无关联事件" description="当前没有可追溯的个股新闻或公告关联。" />
          )}
        </Card>
      </div>
    </div>
  );
}
