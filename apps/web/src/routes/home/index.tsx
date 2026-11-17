import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  FlaskConical,
  History,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { useBoardsQuery } from "../../hooks/useBoards";
import { useLastUpdated, useSyncModules } from "../../hooks/useDataSync";
import { useReviewListQuery } from "../../hooks/useReviews";
import { authClient } from "../../lib/auth-client";
import { WORKBENCH_ACTION_LINKS } from "../../lib/workbench-navigation";

export const Route = createFileRoute("/home/")({
  component: WorkbenchPage,
});

const WORKFLOW_ICONS = {
  "/home/reviews/today": Sparkles,
  "/home/factors/iterate": FlaskConical,
  "/home/screens": Target,
  "/home/backtest": History,
} as const;

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "尚无更新";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "尚无更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusMeta(status: string) {
  if (status === "success") {
    return { label: "已完成", className: "bg-app-success-soft text-app-success" };
  }
  if (status === "running") {
    return { label: "运行中", className: "bg-primary/10 text-primary" };
  }
  if (status === "failed") {
    return { label: "异常", className: "bg-destructive/10 text-destructive" };
  }
  return { label: "未运行", className: "bg-app-surface text-app-muted" };
}

function moduleDotClass(status: string): string {
  if (status === "success") return "bg-app-success";
  if (status === "running") return "animate-pulse bg-primary";
  if (status === "failed") return "bg-destructive";
  return "bg-app-line-strong";
}

function WorkbenchPage() {
  const { data: session } = authClient.useSession();
  const { data: syncInfo } = useLastUpdated();
  const { data: syncModules, isLoading: modulesLoading } = useSyncModules();
  const { data: boards = [], isLoading: boardsLoading } = useBoardsQuery("industry");
  const { data: reviews = [], isLoading: reviewsLoading } = useReviewListQuery();

  const modules = syncModules?.modules ?? [];
  const completed = modules.filter((item) => item.status === "success").length;
  const running = modules.filter((item) => item.status === "running").length;
  const failed = modules.filter((item) => item.status === "failed").length;
  const recentModules = modules.slice(0, 6);
  const topBoards = boards.slice(0, 5);
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-app-line bg-app-panel px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="text-xs text-app-muted">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-app-ink md:text-[30px]">
            {session?.user.name ? `${session.user.name}，今天先看什么？` : "今天先看什么？"}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-app-muted">
            数据状态、主线变化和下一步研究任务都在这里，不必先穿梭于各个模块。
          </p>
        </div>
        <Link
          to="/ai-chat"
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
        >
          <Bot className="size-4" />
          问 AI 研究助手
        </Link>
      </section>

      <section className="grid overflow-hidden rounded-2xl border border-app-line bg-app-panel sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "已完成模块",
            value: String(completed),
            detail: `共 ${modules.length} 个同步模块`,
            icon: CheckCircle2,
          },
          {
            label: "运行中",
            value: String(running),
            detail: running ? "任务正在推进" : "当前无运行任务",
            icon: RefreshCw,
          },
          {
            label: "需处理",
            value: String(failed),
            detail: failed ? "请到同步中心查看" : "没有失败任务",
            icon: CircleAlert,
          },
          {
            label: "最近更新",
            value: formatTime(syncInfo?.updatedAt),
            detail: "数据同步时间",
            icon: Database,
          },
        ].map(({ label, value, detail, icon: Icon }, index) => (
          <article
            key={label}
            className={`p-5 ${index < 3 ? "border-b border-app-line sm:border-r xl:border-b-0" : ""}`}
          >
            <div className="flex items-center justify-between text-xs text-app-muted">
              <span>{label}</span>
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-app-ink">{value}</p>
            <p className="mt-1.5 text-xs text-app-muted">{detail}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-app-line bg-app-panel">
          <div className="flex items-center justify-between border-b border-app-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-app-ink">数据同步进度</h2>
              <p className="mt-0.5 text-xs text-app-muted">只展示最近运行的模块</p>
            </div>
            <Link to="/home/sync" className="text-xs font-medium text-primary hover:underline">
              同步中心
            </Link>
          </div>
          <div className="divide-y divide-app-line">
            {modulesLoading ? (
              <p className="px-5 py-10 text-center text-sm text-app-muted">正在读取同步状态…</p>
            ) : (recentModules.length > 0 ? (
              recentModules.map((module) => {
                const status = statusMeta(module.status);
                return (
                  <div key={module.jobType} className="flex items-center gap-3 px-5 py-3.5">
                    <span className={`size-2 shrink-0 rounded-full ${moduleDotClass(module.status)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-app-ink">{module.name}</p>
                      <p className="mt-0.5 truncate text-xs text-app-muted">
                        {module.message ?? "等待运行"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] ${status.className}`}>
                      {status.label}
                    </span>
                    <Link
                      to="/home/sync"
                      className="grid size-7 place-items-center rounded-full text-app-muted hover:bg-app-surface hover:text-app-ink"
                      aria-label={`查看 ${module.name}`}
                    >
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-10 text-center">
                <Clock3 className="mx-auto size-5 text-app-faint" />
                <p className="mt-2 text-sm text-app-muted">还没有同步记录</p>
                <Link to="/home/sync" className="mt-2 inline-block text-xs text-primary hover:underline">
                  前往同步中心
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-app-line bg-app-panel p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-app-ink">行业板块</h2>
              <p className="mt-0.5 text-xs text-app-muted">按现有板块排名快照</p>
            </div>
            <Link to="/home/market/boards" className="text-xs text-primary hover:underline">
              全部
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {boardsLoading ? (
              <p className="py-8 text-center text-sm text-app-muted">正在读取板块…</p>
            ) : (topBoards.length > 0 ? (
              topBoards.map((board, index) => {
                const change = Number(board.changePercent ?? 0);
                return (
                  <div key={board.code} className="flex items-center gap-3">
                    <span className="w-4 text-right text-[11px] text-app-faint">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-app-ink">{board.name}</span>
                        <span className={`font-mono text-xs ${change >= 0 ? "text-chart-up" : "text-chart-down"}`}>
                          {board.changePercent ?? "--"}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-app-surface">
                        <div
                          className={`h-full rounded-full ${change >= 0 ? "bg-chart-up" : "bg-chart-down"}`}
                          style={{ width: `${Math.min(Math.abs(change) * 12, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm text-app-muted">暂无板块数据</div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-app-line bg-app-panel p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-app-ink">最近复盘</h2>
            <p className="mt-0.5 text-xs text-app-muted">延续已有复盘记录，不在工作台重复生成</p>
          </div>
          <Link to="/home/reviews/history" className="text-xs text-primary hover:underline">
            历史复盘
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reviewsLoading ? (
            <p className="py-4 text-sm text-app-muted">正在读取复盘…</p>
          ) : (
            reviews.length > 0 ? (
              reviews.slice(0, 2).map((review) => (
                <Link
                  key={review.date}
                  to="/home/reviews/history/$date"
                  params={{ date: review.date }}
                  className="rounded-xl border border-app-line bg-app-surface p-4 transition hover:border-app-line-strong hover:bg-app-panel"
                >
                  <p className="font-mono text-[11px] text-app-faint">{review.date}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-app-ink">
                    {review.summary || "该日复盘暂无摘要"}
                  </p>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-app-line p-4 text-sm text-app-muted">
                暂无复盘记录。
                <Link to="/home/reviews/today" className="ml-1 text-primary hover:underline">
                  生成今日复盘
                </Link>
              </div>
            )
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-app-line bg-app-panel p-5">
          <h2 className="text-sm font-semibold text-app-ink">今天的研究动作</h2>
          <p className="mt-0.5 text-xs text-app-muted">从现有功能继续，不在工作台复制另一套流程</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {WORKBENCH_ACTION_LINKS.map(({ title, description, href }) => {
              const Icon = WORKFLOW_ICONS[href];
              return (
                <Link
                  key={href}
                  to={href}
                  className="group rounded-xl border border-app-line bg-app-surface p-4 transition hover:border-app-line-strong hover:bg-app-panel"
                >
                  <Icon className="size-4 text-primary" />
                  <p className="mt-3 text-sm font-medium text-app-ink group-hover:text-primary">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="workbench-ai-card rounded-2xl border p-5">
          <div className="flex items-center gap-2 text-xs text-app-muted">
            <Sparkles className="size-4 text-primary" />
            AI 研究助手
          </div>
          <h2 className="mt-3 text-lg font-semibold leading-7 text-app-ink">
            今天最值得先验证的假设是什么？
          </h2>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            助手会基于现有行情、研报和任务上下文给出研究建议，并保留来源与数据时间。
          </p>
          <Link
            to="/ai-chat"
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground"
          >
            打开问股
            <ArrowRight className="size-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
