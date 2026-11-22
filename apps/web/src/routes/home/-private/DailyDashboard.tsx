import { Link } from "@tanstack/react-router";
import { useReducer, type ReactNode } from "react";
import {
  ChartNoAxesCombined,
  CircleAlert,
  Clock3,
  Database,
  History,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import {
  useDashboardQuery,
  type DashboardData,
  type DashboardFundFlowItem,
} from "../../../hooks/useDashboard";
import { useSyncModules } from "../../../hooks/useDataSync";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useMarketBriefQuery } from "../../../hooks/useMarketBrief";
import { useSystemFeaturesQuery } from "../../../hooks/useSystemFeatures";
import { useTodayWorkflowRunsQuery, useWorkflowsQuery } from "../../../hooks/useWorkflows";
import { WORKFLOW_STATUS_META, type WorkflowRunSummary } from "../../../lib/workflows";
import { formatMarketBriefDate, shouldLoadMarketRadar } from "../../../lib/market-brief";
import { initialMarketSelection, reduceMarketSelection } from "../../../lib/market-selection";
import { MarketRadarHero } from "./MarketRadarHero";
import { TodayExecutionSection } from "./TodayExecutionSection";

const SOURCE_LABELS: Record<string, string> = {
  cls: "财联社",
  eastmoney_global: "东财全球",
  eastmoney_stock: "东财个股",
};

const SOURCE_BADGES: Record<string, string> = {
  cls: "CLS",
  eastmoney_global: "全球",
  eastmoney_stock: "个股",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function daysLag(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatSignedMoney(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

function formatScore(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
}

function compactSummary(value: string, maxLength = 260): string {
  const plain = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

function splitReviewSummary(value: string): { headline: string; body: string } {
  const text = compactSummary(value, 720);
  const splitAt = text.search(/[。！？]/);
  if (splitAt < 0) return { headline: text, body: "" };
  return {
    headline: text.slice(0, splitAt + 1),
    body: text.slice(splitAt + 1).trim(),
  };
}

function latestWorkflowRun(runs: WorkflowRunSummary[]): WorkflowRunSummary | null {
  return (
    runs.toSorted(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )[0] ?? null
  );
}

function statusMeta(status: string) {
  return WORKFLOW_STATUS_META[status] ?? WORKFLOW_STATUS_META.pending!;
}

function FundFlowColumn({ title, items }: { title: string; items: DashboardFundFlowItem[] }) {
  return (
    <section className="min-w-0 px-[15px] py-[13px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-app-muted">
          {title}
        </span>
        <span className="font-mono text-[10px] text-app-faint">TOP 5</span>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-app-line/60">
          {items.map((item, index) => (
            <div
              key={`${item.code}-${item.rank}`}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"
            >
              <span className="text-center font-mono text-[10px] text-app-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-app-ink">{item.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-app-muted">
                  {item.topStockName ? `领涨 ${item.topStockName}` : "暂无代表个股"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] font-semibold text-chart-up-strong">
                  {formatSignedMoney(item.mainNetInflow)}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-app-muted">
                  {formatPercent(item.changePercent)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-app-muted">暂无资金流数据</p>
      )}
    </section>
  );
}

function DashboardCardHeader({
  title,
  kicker,
  asOf,
  action,
}: {
  title: string;
  kicker: string;
  asOf?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-app-line px-[16px] py-[14px]">
      <div>
        <Heading level={2} className="text-[13px] font-bold tracking-[-0.015em]">
          {title}
        </Heading>
        <Text type="supporting" as="p" className="mt-1 text-[11px]">
          {kicker}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {asOf ? (
          <span className="whitespace-nowrap rounded-[5px] bg-app-line/45 px-1.5 py-1 font-mono text-[10px] text-app-muted">
            {asOf}
          </span>
        ) : null}
        {action}
      </div>
    </header>
  );
}

function DailyPicksCard({
  stockPool,
  fallbackDate,
}: {
  stockPool: DashboardData["stockPool"];
  fallbackDate: string | null;
}) {
  const snapshotDate = formatDate(stockPool.date ?? fallbackDate);
  return (
    <Card className="overflow-hidden">
      <DashboardCardHeader
        title="每日选股"
        kicker="当前股票池中的最高评分候选"
        asOf={snapshotDate === "暂无" ? "暂无快照" : `${snapshotDate} 快照`}
        action={
          <Link
            to="/home/screens"
            className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
          >
            全部候选 <span aria-hidden="true">→</span>
          </Link>
        }
      />
      <div className="px-[15px] pb-1 pt-1">
        {stockPool.items.length > 0 ? (
          stockPool.items.slice(0, 5).map((item, index) => (
            <div
              key={item.symbol}
              className="grid grid-cols-[22px_minmax(0,1fr)_46px] items-center gap-2 border-b border-app-line/70 py-2.5 last:border-b-0 sm:grid-cols-[22px_minmax(0,1fr)_minmax(72px,.35fr)_46px]"
            >
              <span className="text-center font-mono text-[10px] text-app-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-app-ink">{item.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-app-muted">{item.symbol}</p>
              </div>
              <span className="hidden truncate text-right text-[10px] text-app-muted sm:block">
                {item.source ?? "未标注来源"}
              </span>
              <span className="rounded-[7px] bg-primary/10 py-1.5 text-center font-mono text-[11px] font-bold text-primary">
                {formatScore(item.score)}
              </span>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-xs text-app-muted">当前股票池暂无标的</p>
        )}
      </div>
    </Card>
  );
}

function NewsCard({ data }: { data: DashboardData }) {
  return (
    <Card className="overflow-hidden">
      <DashboardCardHeader
        title="资讯增量"
        kicker={`${SOURCE_LABELS[data.news[0]?.source ?? ""] ?? "最新来源"} · 当前仅展示最新快照`}
        asOf={`${formatDate(data.asOf.news)} 更新`}
        action={
          <Link
            to="/home/research"
            className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
          >
            全部 <span aria-hidden="true">→</span>
          </Link>
        }
      />
      <div className="px-[15px] pb-1.5 pt-1">
        {data.news.length > 0 ? (
          data.news.slice(0, 3).map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="group grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2 border-b border-app-line/70 py-2.5 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
            >
              <span className="grid h-5 place-items-center rounded-md bg-primary/10 font-mono text-[9px] font-semibold text-primary">
                {SOURCE_BADGES[article.source] ?? article.source.slice(0, 2)}
              </span>
              <span className="truncate text-[11px] font-medium text-app-ink-secondary transition group-hover:text-primary">
                {article.title}
              </span>
              <time className="hidden font-mono text-[10px] text-app-faint sm:block">
                {formatDateTime(article.publishedAt)}
              </time>
            </a>
          ))
        ) : (
          <p className="py-8 text-center text-xs text-app-muted">暂无资讯数据</p>
        )}
      </div>
    </Card>
  );
}

function ReviewCard({
  review,
  hasDataGap,
  compact = false,
}: {
  review: DashboardData["review"];
  hasDataGap: boolean;
  compact?: boolean;
}) {
  const summary = review ? splitReviewSummary(review.summary) : null;
  return (
    <Card className="overflow-hidden">
      <DashboardCardHeader
        title="最近复盘"
        kicker="保留数据缺口说明，不以空数据推导结论"
        action={
          <Link
            to="/home/reviews/history"
            className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
          >
            历史复盘 <span aria-hidden="true">→</span>
          </Link>
        }
      />
      {review && summary ? (
        <div className={`px-[16px] pb-[15px] pt-[14px] ${compact ? "" : "max-w-[980px]"}`}>
          <p className="flex items-center gap-2 font-mono text-[10px] text-app-muted">
            <span className="size-1.5 rounded-full bg-app-warning" />
            {review.date} · 最近更新 {formatDateTime(review.updatedAt)}
          </p>
          <h3 className="mt-2.5 text-[15px] font-bold leading-[1.45] tracking-[-0.02em] text-app-ink">
            {summary.headline}
          </h3>
          {summary.body ? (
            <p className="mt-2 line-clamp-3 text-[12px] leading-6 text-app-muted">{summary.body}</p>
          ) : null}
          {hasDataGap ? (
            <p className="mt-3 rounded-lg bg-app-warning-soft px-2.5 py-2 text-[11px] leading-5 text-app-warning">
              该复盘包含数据缺口说明；市场模块按各自最新完整快照展示，请勿将空数据解读为真实市场状态。
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-xs text-app-muted">暂无复盘记录</p>
      )}
    </Card>
  );
}

export function DailyDashboard() {
  const currentUser = useCurrentUser();
  const featuresQuery = useSystemFeaturesQuery();
  const [marketSelection, dispatchMarketSelection] = useReducer(
    reduceMarketSelection,
    undefined,
    initialMarketSelection,
  );
  const marketRadarEnabled = shouldLoadMarketRadar(featuresQuery.data);
  const marketBriefQuery = useMarketBriefQuery(marketSelection, marketRadarEnabled);
  const dashboardQuery = useDashboardQuery();
  const syncQuery = useSyncModules({
    enabled: currentUser.data?.role === "super_admin",
  });
  const workflowsQuery = useWorkflowsQuery();
  const todayWorkflowRunsQuery = useTodayWorkflowRunsQuery();
  const data = dashboardQuery.data;
  const allWorkflowRuns =
    workflowsQuery.data?.items.flatMap((workflow) =>
      workflow.latestRun ? [workflow.latestRun] : [],
    ) ?? [];
  const latestRun = latestWorkflowRun(allWorkflowRuns);
  const todayRuns = todayWorkflowRunsQuery.data?.items ?? [];
  const failedModules =
    syncQuery.data?.modules.filter((module) => module.status === "failed").length ?? 0;

  if (dashboardQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1480px] space-y-4" aria-label="正在加载每日看板">
        <div className="flex items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="h-3 w-36 animate-pulse rounded bg-app-surface" />
            <div className="h-11 w-44 animate-pulse rounded-lg bg-app-surface" />
          </div>
          <div className="h-9 w-52 animate-pulse rounded-lg bg-app-surface" />
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(300px,.78fr)]">
          <div className="h-[536px] animate-pulse rounded-3xl bg-app-surface" />
          <div className="grid grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="h-64 animate-pulse rounded-[18px] bg-app-surface" />
            <div className="animate-pulse rounded-[18px] bg-app-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !data) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center">
        <CircleAlert className="mx-auto size-5 text-destructive" />
        <Heading level={2} className="mt-3">
          每日看板暂时无法读取
        </Heading>
        <Text as="p" type="supporting" className="mt-1.5">
          {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "请稍后重试"}
        </Text>
        <Button
          className="mt-4"
          variant="secondary"
          label="重新加载"
          onClick={() => void dashboardQuery.refetch()}
        />
      </Card>
    );
  }

  const marketLag = daysLag(data.asOf.market);
  const industryBreadth = data.breadth.industry;
  const fundBreadth = data.fundFlow.breadth.industry;
  const risingRatio =
    industryBreadth.total > 0 ? (industryBreadth.rising / industryBreadth.total) * 100 : 0;
  const inflowRatio = fundBreadth.total > 0 ? (fundBreadth.positive / fundBreadth.total) * 100 : 0;
  const topPick = data.stockPool.items[0];
  const latestRunStatus = latestRun ? statusMeta(latestRun.status) : null;
  const briefDate = formatMarketBriefDate(marketBriefQuery.data?.asOf ?? data.asOf.market);
  const reviewHasDataGap = Boolean(
    data.review && /数据提示|缺失|空档|空数据/.test(data.review.summary),
  );

  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-primary before:h-0.5 before:w-[18px] before:rounded-full before:bg-current">
            {briefDate.weekday} {briefDate.date} · MARKET RADAR
          </p>
          <Heading level={1} className="mt-1.5 text-3xl tracking-[-0.055em] md:text-[46px]">
            每日看板
          </Heading>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span className="inline-flex h-[34px] items-center gap-2 rounded-full border border-app-warning/30 bg-app-panel/75 px-3 text-[11px] font-medium text-app-warning">
            <span className="size-1.5 rounded-full bg-app-warning shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-app-warning)_12%,transparent)]" />
            最近收盘 {formatDate(data.asOf.market)}
          </span>
          <Link
            to="/home/reviews/today"
            className="focus-ring inline-flex h-[34px] items-center gap-2 rounded-[10px] border border-app-line bg-app-panel px-3 text-[11px] font-medium text-app-ink-secondary transition hover:border-app-line-strong hover:bg-app-surface"
          >
            <History className="size-3.5" />
            查看收盘复盘
          </Link>
        </div>
      </header>

      {marketRadarEnabled ? (
        <div className="space-y-6">
          {marketBriefQuery.isLoading ? (
            <div
              className="grid min-h-[536px] gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(300px,.78fr)]"
              aria-label="行情雷达加载中"
            >
              <div className="h-[536px] animate-pulse rounded-3xl bg-app-surface" />
              <div className="grid grid-rows-2 gap-3">
                <div className="animate-pulse rounded-2xl bg-app-surface" />
                <div className="animate-pulse rounded-2xl bg-app-surface" />
              </div>
            </div>
          ) : marketBriefQuery.isError || !marketBriefQuery.data ? (
            <Card className="flex min-h-[360px] items-center justify-center border-app-line bg-app-panel p-8 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-app-warning-soft font-mono text-lg font-bold text-app-warning">
                  !
                </span>
                <p className="mt-3 text-lg font-semibold text-app-ink">行情雷达暂不可用</p>
                <p className="mt-2 text-xs leading-6 text-app-muted">
                  Market Brief
                  聚合请求失败。页面不会使用静态样例替代真实数据；今日任务可从独立接口继续加载。
                </p>
                <Button
                  className="mt-4"
                  variant="secondary"
                  label="重新加载行情"
                  onClick={() => void marketBriefQuery.refetch()}
                />
              </div>
            </Card>
          ) : (
            <MarketRadarHero
              data={marketBriefQuery.data}
              selection={marketSelection}
              dispatch={dispatchMarketSelection}
            />
          )}
          <TodayExecutionSection />
        </div>
      ) : null}

      <Card className="grid gap-4 rounded-[14px] border-app-warning/20 bg-app-warning-soft/45 px-4 py-3.5 md:grid-cols-[minmax(260px,.9fr)_minmax(0,1.5fr)] md:items-center">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-app-ink-secondary">
            DATA STATUS
          </p>
          <p className="mt-1 text-[12px] font-semibold text-app-ink">
            {marketLag == null
              ? "暂无市场快照"
              : marketLag === 0
                ? "市场快照更新至今日"
                : `行情快照滞后 ${marketLag} 天`}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-app-muted">
            {failedModules > 0
              ? `${failedModules} 个同步模块异常；市场模块使用各自最新完整快照。`
              : "市场模块使用各自最新完整快照，不与当前日历日期混用。"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["行情与资金", formatDate(data.asOf.market), marketLag != null && marketLag <= 1],
            ["资讯", formatDate(data.asOf.news), daysLag(data.asOf.news) === 0],
            ["每日复盘", formatDate(data.asOf.review), Boolean(data.review)],
            ["工作流", formatDate(latestRun?.createdAt), Boolean(latestRun)],
          ].map(([label, value, current]) => (
            <div
              key={String(label)}
              className="rounded-[9px] border border-app-line bg-app-panel/65 px-2.5 py-2"
            >
              <p className="text-[10px] text-app-muted">{label}</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold text-app-ink">
                <span
                  className={`size-1.5 rounded-full ${current ? "bg-app-success" : "bg-app-warning"}`}
                />
                {value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid overflow-hidden rounded-[18px] border border-app-line bg-app-surface shadow-dashboard sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "行业广度",
            value: `${industryBreadth.rising}`,
            suffix: `/ ${industryBreadth.falling} 跌`,
            note: `${industryBreadth.total} 个行业 · 上涨占比 ${risingRatio.toFixed(1)}%`,
            progress: risingRatio,
            icon: ChartNoAxesCombined,
          },
          {
            label: "资金广度",
            value: `${fundBreadth.positive}`,
            suffix: `/ ${fundBreadth.total} 净流入`,
            note: `行业主力净流入占比 ${inflowRatio.toFixed(1)}%`,
            progress: inflowRatio,
            icon: Database,
          },
          {
            label: "涨停家数",
            value: `${data.limitUp.total}`,
            suffix: "家",
            note: `最高 ${data.limitUp.maxBoard} 板 · 平均换手 ${data.limitUp.avgTurnover.toFixed(2)}%`,
            progress: Math.min(data.limitUp.total * 1.1, 100),
            icon: TrendingUp,
          },
          {
            label: "今日候选",
            value: `${data.stockPool.total}`,
            suffix: "只",
            note: topPick
              ? `Top 1 ${topPick.name} · ${formatScore(topPick.score)} 分`
              : "暂无候选标的",
            progress: topPick?.score ?? 0,
            icon: Target,
          },
        ].map(({ label, value, suffix, note, progress, icon: Icon }, index) => (
          <article
            key={label}
            className={`px-4 py-3.5 ${index < 3 ? "border-b border-app-line sm:border-r xl:border-b-0" : ""}`}
          >
            <div className="flex items-center justify-between text-[11px] text-app-muted">
              <span>{label}</span>
              <Icon className="size-3.5 text-primary" />
            </div>
            <p className="mt-2 flex items-baseline gap-1.5 font-mono text-[24px] font-bold leading-none tracking-[-0.055em] text-app-ink">
              {value}
              <span className="font-sans text-[10px] font-normal text-app-muted">{suffix}</span>
            </p>
            <p className="mt-1.5 text-[10px] text-app-muted">{note}</p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-app-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.78fr)]">
        <Card className="overflow-hidden">
          <DashboardCardHeader
            title="市场主线"
            kicker="资金净流入与板块强度交叉观察"
            asOf={`${formatDate(data.asOf.fundFlow)} 收盘`}
            action={
              <Link
                to="/home/market"
                className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
              >
                资金流明细 <span aria-hidden="true">→</span>
              </Link>
            }
          />
          <div className="grid md:grid-cols-2 md:divide-x md:divide-app-line">
            <FundFlowColumn title="行业资金" items={data.fundFlow.industry} />
            <FundFlowColumn title="概念资金" items={data.fundFlow.concept} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <DashboardCardHeader
            title="市场温度"
            kicker="涨停池与连板梯队"
            asOf={`${formatDate(data.asOf.limitUp)} 收盘`}
          />
          <div className="px-4 py-[14px]">
            <div className="flex items-end justify-between gap-3">
              <p className="font-mono text-[48px] font-bold leading-none tracking-[-0.08em] text-app-ink">
                {data.limitUp.total}
                <span className="ml-1.5 font-sans text-[10px] font-normal tracking-normal text-app-muted">
                  涨停
                </span>
              </p>
              <span className="rounded-[7px] bg-destructive/10 px-2 py-1.5 text-[10px] font-semibold text-chart-up-strong">
                最高 {data.limitUp.maxBoard} 板
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["最大封单", formatMoney(data.limitUp.maxSealAmount)],
                ["平均换手", `${data.limitUp.avgTurnover.toFixed(2)}%`],
                ["开板样本", `${data.limitUp.openedCount} 只`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-app-line/35 px-2 py-2">
                  <p className="text-[10px] text-app-muted">{label}</p>
                  <p className="mt-1 font-mono text-[12px] font-semibold text-app-ink">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-app-line pt-2">
              {data.limitUp.ladder.length > 0 ? (
                data.limitUp.ladder.map((item) => (
                  <div
                    key={item.count}
                    className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 py-1"
                  >
                    <span className="grid h-5 place-items-center rounded-md bg-destructive/10 font-mono text-[9px] font-semibold text-chart-up-strong">
                      {item.count} 板
                    </span>
                    <span className="truncate text-[11px] text-app-ink-secondary">
                      {item.names.slice(0, 3).join(" · ")}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-app-muted">暂无连板数据</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {marketRadarEnabled ? (
        <>
          <section className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
            <DailyPicksCard
              stockPool={data.stockPool}
              fallbackDate={data.asOf.stockPool ?? data.asOf.market}
            />
            <NewsCard data={data} />
          </section>
          <ReviewCard review={data.review} hasDataGap={reviewHasDataGap} />
        </>
      ) : (
        <>
          <section className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
            <DailyPicksCard
              stockPool={data.stockPool}
              fallbackDate={data.asOf.stockPool ?? data.asOf.market}
            />
            <Card className="overflow-hidden">
              <DashboardCardHeader
                title="今日工作流"
                kicker="自动运行与最近状态"
                action={
                  <Link
                    to="/home/workflows"
                    className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
                  >
                    全部流程 <span aria-hidden="true">→</span>
                  </Link>
                }
              />
              <div className="p-4">
                {todayRuns.length > 0 ? (
                  <div className="divide-y divide-app-line/70">
                    {todayRuns.slice(0, 3).map((run) => {
                      const status = statusMeta(run.status);
                      return (
                        <Link
                          key={run.id}
                          to="/home/workflows/runs/$runId"
                          params={{ runId: String(run.id) }}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Workflow className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-app-ink">
                              {run.workflowName}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-app-muted">
                              {formatDateTime(run.createdAt)}
                            </span>
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl bg-app-surface p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Workflow className="size-4" />
                    </span>
                    <div>
                      <p className="text-[12px] font-medium text-app-ink">今天还没有运行</p>
                      <p className="mt-0.5 text-[10px] text-app-muted">
                        {workflowsQuery.data?.items.length ?? 0} 条工作流暂无今日触发记录。
                      </p>
                    </div>
                  </div>
                )}
                {latestRun ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-app-line pt-3 text-[10px] text-app-muted">
                    <Clock3 className="size-3.5 shrink-0" />
                    <span>最近记录</span>
                    <strong className="min-w-0 truncate text-[11px] text-app-ink">
                      {latestRun.workflowName}
                    </strong>
                    <span className="ml-auto shrink-0">{formatDateTime(latestRun.createdAt)}</span>
                    {latestRunStatus ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[9px] ${latestRunStatus.className}`}
                      >
                        {latestRunStatus.label}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          </section>
          <section className="grid gap-3.5 lg:grid-cols-2">
            <NewsCard data={data} />
            <ReviewCard review={data.review} hasDataGap={reviewHasDataGap} compact />
          </section>
        </>
      )}
    </div>
  );
}
