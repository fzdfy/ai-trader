import { Link } from "@tanstack/react-router";
import {
  ChartNoAxesCombined,
  CircleAlert,
  Clock3,
  Database,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { useDashboardQuery, type DashboardFundFlowItem } from "../../../hooks/useDashboard";
import { useSyncModules } from "../../../hooks/useDataSync";
import {
  useTodayWorkflowRunsQuery,
  useWorkflowsQuery,
} from "../../../hooks/useWorkflows";
import { WORKFLOW_STATUS_META, type WorkflowRunSummary } from "../../../lib/workflows";

const SOURCE_LABELS: Record<string, string> = {
  cls: "财联社",
  eastmoney_global: "东财全球",
  eastmoney_stock: "东财个股",
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

function latestWorkflowRun(runs: WorkflowRunSummary[]): WorkflowRunSummary | null {
  return runs.toSorted(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0] ?? null;
}

function statusMeta(status: string) {
  return WORKFLOW_STATUS_META[status] ?? WORKFLOW_STATUS_META.pending!;
}

function FundFlowColumn({
  title,
  items,
}: {
  title: string;
  items: DashboardFundFlowItem[];
}) {
  return (
    <section className="min-w-0 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-app-muted">{title}</span>
        <span className="font-mono text-[9px] text-app-faint">TOP 5</span>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-app-line/60">
          {items.map((item, index) => (
            <div
              key={`${item.code}-${item.rank}`}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"
            >
              <span className="text-center font-mono text-[9px] text-app-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-app-ink">{item.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-app-muted">
                  {item.topStockName ? `代表 ${item.topStockName}` : "暂无代表个股"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] font-semibold text-chart-up">
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

export function DailyDashboard() {
  const dashboardQuery = useDashboardQuery();
  const syncQuery = useSyncModules();
  const workflowsQuery = useWorkflowsQuery();
  const todayWorkflowRunsQuery = useTodayWorkflowRunsQuery();
  const data = dashboardQuery.data;
  const allWorkflowRuns =
    workflowsQuery.data?.items.flatMap((workflow) => (workflow.latestRun ? [workflow.latestRun] : [])) ??
    [];
  const latestRun = latestWorkflowRun(allWorkflowRuns);
  const todayRuns = todayWorkflowRunsQuery.data?.items ?? [];
  const failedModules =
    syncQuery.data?.modules.filter((module) => module.status === "failed").length ?? 0;

  if (dashboardQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4" aria-label="正在加载每日看板">
        <div className="h-20 animate-pulse rounded-2xl bg-app-surface" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-app-surface" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.78fr)]">
          <div className="h-80 animate-pulse rounded-2xl bg-app-surface" />
          <div className="h-80 animate-pulse rounded-2xl bg-app-surface" />
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
  const today = new Date();
  const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][today.getDay()];
  const briefDate = `${weekday} ${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  const reviewHasDataGap = Boolean(
    data.review && /数据提示|缺失|空档|空数据/.test(data.review.summary),
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-primary">
            {briefDate} · DAILY BRIEF
          </p>
          <Heading
            level={1}
            className="mt-1 text-3xl tracking-[-0.04em] md:text-[42px]"
          >
            每日看板
          </Heading>
          <Text as="p" type="supporting" className="mt-1.5 max-w-2xl">
            先确认数据是否可信，再判断市场温度、资金主线与今日候选。
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-app-warning/30 bg-app-warning-soft px-3 text-[11px] font-medium text-app-warning">
            <span className="size-1.5 rounded-full bg-app-warning" />
            行情快照 {formatDate(data.asOf.market)}
          </span>
          <Link
            to="/home/reviews/today"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:bg-primary-hover"
          >
            <Sparkles className="size-3.5" />
            生成每日复盘
          </Link>
        </div>
      </header>

      <Card className="grid gap-4 border-app-warning/20 bg-app-warning-soft/45 p-4 md:grid-cols-[minmax(240px,.9fr)_minmax(0,1.5fr)] md:items-center">
        <div>
          <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-app-warning">
            DATA STATUS
          </p>
          <p className="mt-1 text-sm font-semibold text-app-ink">
            {marketLag == null
              ? "暂无市场快照"
              : marketLag === 0
                ? "市场快照更新至今日"
                : `行情快照滞后 ${marketLag} 天`}
          </p>
          <p className="mt-1 text-xs text-app-muted">
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
            <div key={String(label)} className="rounded-lg border border-app-line bg-app-panel/70 px-2.5 py-2">
              <p className="text-[10px] text-app-muted">{label}</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-app-ink">
                <span
                  className={`size-1.5 rounded-full ${current ? "bg-app-success" : "bg-app-warning"}`}
                />
                {value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid overflow-hidden rounded-2xl border border-app-line bg-app-panel sm:grid-cols-2 xl:grid-cols-4">
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
            className={`p-4 ${index < 3 ? "border-b border-app-line sm:border-r xl:border-b-0" : ""}`}
          >
            <div className="flex items-center justify-between text-[11px] text-app-muted">
              <span>{label}</span>
              <Icon className="size-3.5 text-primary" />
            </div>
            <p className="mt-2 flex items-baseline gap-1.5 font-mono text-2xl font-bold tracking-tight text-app-ink">
              {value}
              <span className="font-sans text-[10px] font-normal text-app-muted">{suffix}</span>
            </p>
            <p className="mt-1.5 text-[10px] text-app-muted">{note}</p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-app-surface">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.78fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                市场主线
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                资金净流入与板块强度交叉观察
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="soft">{formatDate(data.asOf.fundFlow)} 收盘</Badge>
              <Link to="/home/market" className="text-[11px] font-medium text-primary hover:underline">
                资金流明细
              </Link>
            </div>
          </div>
          <div className="grid md:grid-cols-2 md:divide-x md:divide-app-line">
            <FundFlowColumn title="行业资金" items={data.fundFlow.industry} />
            <FundFlowColumn title="概念资金" items={data.fundFlow.concept} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                市场温度
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                涨停池与连板梯队
              </Text>
            </div>
            <Badge variant="soft">{formatDate(data.asOf.limitUp)} 收盘</Badge>
          </div>
          <div className="p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="font-mono text-[48px] font-bold leading-none tracking-[-0.08em] text-app-ink">
                {data.limitUp.total}
                <span className="ml-1.5 font-sans text-[10px] font-normal tracking-normal text-app-muted">
                  涨停
                </span>
              </p>
              <Badge variant="destructive">最高 {data.limitUp.maxBoard} 板</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["最大封单", formatMoney(data.limitUp.maxSealAmount)],
                ["平均换手", `${data.limitUp.avgTurnover.toFixed(2)}%`],
                ["开板样本", `${data.limitUp.openedCount} 只`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-app-surface px-2 py-2">
                  <p className="text-[9px] text-app-muted">{label}</p>
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
                    <span className="grid h-5 place-items-center rounded-md bg-destructive/10 font-mono text-[9px] font-semibold text-chart-up">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                每日选股
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                当前股票池中的最高评分候选
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="soft">{formatDate(data.stockPool.date)} 快照</Badge>
              <Link to="/home/screens" className="text-[11px] font-medium text-primary hover:underline">
                全部候选
              </Link>
            </div>
          </div>
          <div className="divide-y divide-app-line/70 px-4 pb-1">
            {data.stockPool.items.length > 0 ? (
              data.stockPool.items.map((item, index) => (
                <div
                  key={item.symbol}
                  className="grid grid-cols-[24px_minmax(0,1fr)_auto_48px] items-center gap-2 py-2.5"
                >
                  <span className="text-center font-mono text-[9px] text-app-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-app-ink">{item.name}</p>
                    <p className="font-mono text-[9px] text-app-muted">{item.symbol}</p>
                  </div>
                  <span className="text-[10px] text-app-muted">{item.source ?? "未标注来源"}</span>
                  <span className="rounded-md bg-primary/10 py-1 text-center font-mono text-[11px] font-bold text-primary">
                    {formatScore(item.score)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-10 text-center text-xs text-app-muted">当前股票池暂无标的</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                今日工作流
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                自动运行与最近状态
              </Text>
            </div>
            <Link to="/home/workflows" className="text-[11px] font-medium text-primary hover:underline">
              全部流程
            </Link>
          </div>
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
                      <span className={`rounded-full px-2 py-1 text-[10px] ${status.className}`}>
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
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] ${latestRunStatus.className}`}>
                    {latestRunStatus.label}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                资讯增量
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                当前仅展示最新快照
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="soft">{formatDate(data.asOf.news)} 更新</Badge>
              <Link to="/home/research" className="text-[11px] font-medium text-primary hover:underline">
                全部
              </Link>
            </div>
          </div>
          <div className="divide-y divide-app-line/70 px-4">
            {data.news.length > 0 ? (
              data.news.map((article) => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"
                >
                  <span className="grid h-5 place-items-center rounded-md bg-primary/10 font-mono text-[9px] font-semibold text-primary">
                    {SOURCE_LABELS[article.source] ?? article.source}
                  </span>
                  <span className="truncate text-[11px] text-app-ink-secondary group-hover:text-primary">
                    {article.title}
                  </span>
                  <time className="font-mono text-[9px] text-app-faint">
                    {formatDateTime(article.publishedAt)}
                  </time>
                </a>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-app-muted">暂无资讯数据</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
            <div>
              <Heading level={2} className="text-sm">
                最近复盘
              </Heading>
              <Text type="supporting" size="sm" as="p" className="mt-0.5">
                保留数据缺口说明，不以空数据推导结论
              </Text>
            </div>
            <Link
              to="/home/reviews/history"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              历史复盘
            </Link>
          </div>
          {data.review ? (
            <div className="p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] text-app-muted">
                <span className="size-1.5 rounded-full bg-app-warning" />
                {data.review.date} · 最近更新 {formatDateTime(data.review.updatedAt)}
              </p>
              <Text as="p" className="mt-3 line-clamp-6 text-[13px] leading-6 text-app-ink">
                {compactSummary(data.review.summary)}
              </Text>
              {reviewHasDataGap ? (
                <p className="mt-3 rounded-lg bg-app-warning-soft px-3 py-2 text-[10px] leading-5 text-app-warning">
                  该复盘包含数据缺口说明；市场模块按各自最新完整快照展示，请勿将空数据解读为真实市场状态。
                </p>
              ) : null}
            </div>
          ) : (
            <p className="p-8 text-center text-xs text-app-muted">暂无复盘记录</p>
          )}
        </Card>
      </div>
    </div>
  );
}
