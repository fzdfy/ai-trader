import { useId, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { ToggleButton, ToggleButtonGroup } from "@preline-ui/ToggleButton";
import { useMainBenchmarkRotation } from "../../../../hooks/useMarketCenter";
import { formatChangePct, formatMarketPrice } from "../../../../lib/market-brief";
import {
  formatExcessReturn,
  mainIndexSampleLabel,
  rotationQualityLabel,
  splitMainIndices,
  type MainIndexItem,
  type MainIndexSection,
  type MarketRotationResponse,
  type RotationWindow,
} from "../../../../lib/market-center";

type MainIndexMode = "quote" | "benchmark";

const BENCHMARK_SURFACE =
  "linear-gradient(110deg, color-mix(in srgb, var(--primary) 6%, var(--panel)) 0%, color-mix(in srgb, var(--primary) 3%, var(--panel)) 42%, var(--panel) 88%)";
const MARKET_BREADTH_SURFACE = "color-mix(in srgb, var(--surface) 52%, var(--panel))";

interface MainIndexPanelProps {
  data: MainIndexSection;
  breadth: {
    industry: { total: number; rising: number; falling: number; flat: number };
    asOf: string | null;
    narrative: string;
  };
}

function sourceLabel(source: MainIndexItem["source"]): string {
  if (source === "tencent") return "腾讯";
  if (source === "csindex") return "中证官方";
  if (source === "quote_latest") return "行情缓存";
  return "暂无来源";
}

function dateLabel(value: string | null): string {
  if (!value) return "暂无日期";
  const date = value.slice(5, 10).replace("-", "/");
  return value.includes("T") ? date : `${date} 收盘`;
}

function priceTone(item: MainIndexItem): string {
  if (item.quality === "missing") return "text-app-muted";
  if ((item.changePct ?? 0) > 0) return "text-chart-up-strong";
  if ((item.changePct ?? 0) < 0) return "text-chart-down-strong";
  return "text-app-ink";
}

function changeTone(item: MainIndexItem): string {
  if ((item.changePct ?? 0) > 0) return "bg-chart-up/10 text-chart-up-strong";
  if ((item.changePct ?? 0) < 0) return "bg-chart-down/10 text-chart-down-strong";
  return "bg-app-surface text-app-muted";
}

function MiniTrend({ item, className = "" }: { item: MainIndexItem; className?: string }) {
  const gradientId = useId();
  const values = item.trend.slice(-28);
  const tone = (item.changePct ?? 0) >= 0 ? "text-chart-up" : "text-chart-down";
  if (values.length < 2) {
    return (
      <div
        className={`h-9 rounded-md border border-dashed border-app-line ${className}`}
        aria-label={`${item.name} 历史走势暂无数据`}
      />
    );
  }
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || 1;
  const points = values.map((point, index) => {
    const x = (index / (values.length - 1)) * 160;
    const y = 32 - ((point.value - min) / range) * 25;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,36 ${points.join(" ")} 160,36`;
  return (
    <svg
      viewBox="0 0 160 36"
      preserveAspectRatio="none"
      className={`h-12 w-full ${tone} ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function QuoteBenchmark({ item }: { item: MainIndexItem | null }) {
  if (!item) {
    return (
      <div className="flex min-h-32 items-center justify-center border-b border-app-line bg-app-surface/45 text-xs text-app-muted">
        上证指数数据暂不可用
      </div>
    );
  }
  return (
    <article
      className="grid min-h-36 grid-cols-[minmax(0,1fr)_minmax(120px,.65fr)] items-center gap-4 rounded-[13px] px-5 py-5"
      style={{ background: BENCHMARK_SURFACE }}
    >
      <div className="min-w-0">
        <span className="inline-flex rounded-md bg-primary/8 px-2 py-1 text-[10px] font-semibold text-primary">
          市场基准
        </span>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <strong className="text-xl text-app-ink">{item.name}</strong>
          <span className="font-mono text-[11px] text-app-muted">{item.code}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
          <span
            className={`whitespace-nowrap font-mono text-[26px] font-bold tracking-[-0.045em] sm:text-[32px] ${priceTone(item)}`}
          >
            {formatMarketPrice(item.price, item.priceUnit)}
          </span>
          <span
            className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold ${changeTone(item)}`}
          >
            {formatChangePct(item.changePct)}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-app-muted">
          {sourceLabel(item.source)} · {dateLabel(item.asOf)}
          {item.quality === "low" ? " · 陈旧" : ""}
          {item.quality === "missing" ? " · 缺失" : ""}
        </p>
      </div>
      <div className="min-w-0">
        <MiniTrend item={item} className="h-14" />
        <p className="mt-1 text-right font-mono text-[9px] text-app-muted">近 28 个收盘</p>
      </div>
    </article>
  );
}

function QuoteStyleCard({ item }: { item: MainIndexItem }) {
  return (
    <article className="flex min-h-0 min-w-0 flex-col bg-app-panel px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-primary/7 px-1.5 py-1 text-[9px] font-semibold text-primary">
          {item.role}
        </span>
        <span
          className={`rounded-md px-1.5 py-1 font-mono text-[10px] font-semibold ${changeTone(item)}`}
        >
          {formatChangePct(item.changePct)}
        </span>
      </div>
      <strong className="mt-2.5 block truncate text-sm text-app-ink">{item.name}</strong>
      <span className="mt-0.5 block font-mono text-[10px] text-app-muted">{item.code}</span>
      <p
        className={`mt-2 whitespace-nowrap font-mono text-[20px] font-bold tracking-[-0.045em] sm:text-[24px] ${priceTone(item)}`}
      >
        {formatMarketPrice(item.price, item.priceUnit)}
      </p>
      <div className="mt-auto pt-2">
        <MiniTrend item={item} className="h-12 max-h-12" />
        <p className="mt-1 truncate text-[9px] text-app-muted">
          {sourceLabel(item.source)} · {dateLabel(item.asOf)}
          {item.quality !== "available" ? ` · ${rotationQualityLabel(item.quality)}` : ""}
        </p>
      </div>
    </article>
  );
}

function QuoteMode({ data }: { data: MainIndexSection }) {
  const { benchmark, styles } = splitMainIndices(data.items);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <QuoteBenchmark item={benchmark} />
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-px overflow-hidden rounded-[13px] bg-app-line md:grid-cols-3 md:grid-rows-2">
        {styles.map((item) => (
          <QuoteStyleCard key={item.code} item={item} />
        ))}
      </div>
    </div>
  );
}

function BenchmarkRow({
  row,
  maxAbs,
}: {
  row: MarketRotationResponse["rows"][number];
  maxAbs: number;
}) {
  const value = row.relativeReturn;
  const width = value == null ? 0 : Math.max(7, Math.min(100, (Math.abs(value) / maxAbs) * 100));
  return (
    <div className="grid min-h-[68px] grid-cols-[28px_minmax(110px,1fr)_minmax(70px,1.5fr)_72px] items-center gap-2 border-b border-app-line/70 px-1 last:border-0 sm:gap-3">
      <span className="font-mono text-[10px] text-app-muted">
        {row.rank == null ? "—" : String(row.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <strong className="block truncate text-xs text-app-ink">{row.name}</strong>
        <span className="mt-0.5 block truncate font-mono text-[9px] text-app-muted">
          {row.code}
          {row.quality === "missing" ? " · 数据缺失" : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-app-surface" aria-hidden="true">
        <div
          className={`h-full rounded-full ${value == null ? "bg-app-line" : "bg-primary"}`}
          style={{ width: `${value == null ? 0 : width}%` }}
        />
      </div>
      <span
        className={`text-right font-mono text-[11px] font-semibold ${
          value == null
            ? "text-app-muted"
            : value >= 0
              ? "text-chart-up-strong"
              : "text-chart-down-strong"
        }`}
      >
        {formatExcessReturn(value)}
      </span>
    </div>
  );
}

function BenchmarkMode({
  data,
  window,
}: {
  data: MarketRotationResponse | undefined;
  window: RotationWindow;
}) {
  const maxAbs = Math.max(1, ...(data?.rows.map((row) => Math.abs(row.relativeReturn ?? 0)) ?? []));
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="rounded-xl border border-app-line bg-app-surface/45 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-app-ink">上证指数 · 市场基准</strong>
              <span className="rounded-full bg-app-panel px-2 py-1 text-[9px] text-app-muted">
                {window.replace("D", "")} 日区间
              </span>
            </div>
            <p className="mt-1 text-[10px] text-app-muted">
              风格指数超额收益 = 指数区间涨跌幅 − 上证指数区间涨跌幅
            </p>
          </div>
          <div className="text-right">
            <span className="block font-mono text-[10px] text-app-muted">基准涨跌幅</span>
            <strong className="mt-0.5 block font-mono text-sm text-app-ink">
              {formatChangePct(data?.benchmark?.returnPct ?? null)}
            </strong>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="mt-2 grid flex-1 gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`benchmark-skeleton-${index}`}
              className="h-14 animate-pulse rounded-lg bg-app-surface"
            />
          ))}
        </div>
      ) : (
        <div className="mt-1 flex-1">
          {data.rows.map((row) => (
            <BenchmarkRow key={row.code} row={row} maxAbs={maxAbs} />
          ))}
          {data.rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <CircleAlert className="size-5 text-app-muted" />
              <strong className="mt-2 text-xs text-app-ink">相对大盘数据不可用</strong>
              <p className="mt-1 text-[10px] text-app-muted">仍可切换到行情查看逐项报价。</p>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-line pt-2 text-[10px] text-app-muted">
        <span>共同交易日 {data?.asOf ? dateLabel(data.asOf) : "—"}</span>
        <span className={data?.status === "low" ? "text-app-warning-strong" : ""}>
          {mainIndexSampleLabel(data?.status ?? "missing", data?.validStyleCount ?? 0)}
        </span>
      </div>
    </div>
  );
}

function MarketBreadthFooter({ breadth }: { breadth: MainIndexPanelProps["breadth"] }) {
  const risingRatio =
    breadth.industry.total > 0 ? (breadth.industry.rising / breadth.industry.total) * 100 : 0;
  return (
    <div
      className="grid gap-4 border-t border-app-line px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,.55fr)] md:items-end"
      style={{ background: MARKET_BREADTH_SURFACE }}
    >
      <div>
        <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
          A-SHARE BREADTH
        </p>
        <strong className="mt-1.5 block text-sm text-app-ink">{breadth.narrative}</strong>
        <p className="mt-1 text-[10px] text-app-muted">
          {breadth.industry.rising} 上涨 / {breadth.industry.falling} 下跌 ·{" "}
          {breadth.industry.total} 个行业 · 上涨占比 {risingRatio.toFixed(1)}%
        </p>
      </div>
      <div>
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-chart-down/20"
          role="img"
          aria-label={`行业上涨 ${breadth.industry.rising} 个，下跌 ${breadth.industry.falling} 个`}
        >
          <div
            className="h-full bg-chart-up"
            style={{ width: `${Math.min(Math.max(risingRatio, 0), 100)}%` }}
          />
          <div className="h-full flex-1 bg-chart-down" />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-app-muted">
          <span className="text-chart-up-strong">上涨 {risingRatio.toFixed(1)}%</span>
          <span className="text-chart-down-strong">下跌 {(100 - risingRatio).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export function MainIndexPanel({ data, breadth }: MainIndexPanelProps) {
  const [mode, setMode] = useState<MainIndexMode>("quote");
  const [window, setWindow] = useState<RotationWindow>("20D");
  const benchmark = useMainBenchmarkRotation(window, mode === "benchmark");

  return (
    <Card className="flex h-[1430px] flex-col overflow-hidden rounded-3xl lg:h-[940px]">
      <div className="flex min-h-[76px] flex-col gap-3 border-b border-app-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level={2} className="text-base">
            主要指数
          </Heading>
          <Text type="supporting" as="p" className="mt-1 text-[11px]">
            A 股市场结构 · 1 个市场基准 + 6 个风格指数
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleButtonGroup
            label="主要指数观察模式"
            value={mode}
            onChange={(value) => setMode(value as MainIndexMode)}
          >
            <ToggleButton value="quote" label="行情" />
            <ToggleButton value="benchmark" label="相对大盘" />
          </ToggleButtonGroup>
          {mode === "benchmark" ? (
            <ToggleButtonGroup
              label="相对大盘统计窗口"
              value={window}
              onChange={(value) => setWindow(value as RotationWindow)}
            >
              <ToggleButton value="5D" label="5日" />
              <ToggleButton value="20D" label="20日" />
              <ToggleButton value="60D" label="60日" />
            </ToggleButtonGroup>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-app-surface px-2.5 py-1.5 text-[9px] text-app-muted">
            <span
              className={`size-1.5 rounded-full ${
                data.status === "available" ? "bg-app-success" : "bg-app-warning"
              }`}
            />
            逐项日期
          </span>
        </div>
      </div>

      {mode === "quote" ? (
        <QuoteMode data={data} />
      ) : benchmark.isError ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <CircleAlert className="size-6 text-destructive" />
          <strong className="mt-2 text-sm text-app-ink">相对大盘暂时无法读取</strong>
          <p className="mt-1 max-w-sm text-[10px] leading-5 text-app-muted">
            {benchmark.error instanceof Error ? benchmark.error.message : "请稍后重试"}
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            label="重新加载"
            icon={<RefreshCw className="size-4" />}
            onClick={() => void benchmark.refetch()}
          />
        </div>
      ) : (
        <BenchmarkMode data={benchmark.data} window={window} />
      )}

      <MarketBreadthFooter breadth={breadth} />
    </Card>
  );
}
