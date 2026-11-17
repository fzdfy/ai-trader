import { useEffect, useRef, useState } from "react";
import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  Grid2x2,
  History,
  LayoutGrid,
  ListChecks,
  Menu,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  TrendingDown,
  Workflow,
  X,
} from "lucide-react";
import { useLastUpdated, useRunSync, useSyncStatus } from "../../hooks/useDataSync";
import { isDrawerDismissKey } from "../../lib/workbench-navigation";

export const Route = createFileRoute("/home")({
  component: HomeLayout,
});

const NAV_GROUPS = [
  {
    label: "行情",
    items: [
      { label: "板块", href: "/home/market/boards", icon: LayoutGrid },
      { label: "个股", href: "/home/market/stock", icon: Search },
    ],
  },
  {
    label: "信号",
    items: [
      { label: "筹码分布", href: "/home/signals/chips", icon: BarChart3 },
      { label: "资金流向", href: "/home/signals/fundflow", icon: ArrowLeftRight },
      { label: "热力图", href: "/home/signals/heatmap", icon: Grid2x2 },
    ],
  },
  {
    label: "复盘",
    items: [
      { label: "今日复盘", href: "/home/reviews/today", icon: FileText },
      { label: "历史复盘", href: "/home/reviews/history", icon: ListChecks },
    ],
  },
  {
    label: "量化",
    items: [
      { label: "回测", href: "/home/backtest", icon: History },
      { label: "选股", href: "/home/screens", icon: Target },
      { label: "策略", href: "/home/strategies", icon: Workflow },
      { label: "因子", href: "/home/factors", icon: SlidersHorizontal },
      { label: "衰退对比", href: "/home/factors/compare", icon: TrendingDown },
      { label: "AI 迭代", href: "/home/factors/iterate", icon: Sparkles },
    ],
  },
  {
    label: "系统",
    items: [
      { label: "同步中心", href: "/home/sync", icon: RefreshCw },
      { label: "数据中心", href: "/home/data-center", icon: Table2 },
      { label: "主题设置", href: "/home/settings", icon: Palette },
      { label: "知识库", href: "/home/knowledge", icon: BookOpen },
    ],
  },
] as const;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "暂无数据";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "暂无数据";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSelected(pathname: string, href: string): boolean {
  if (href === "/home/factors") {
    return (
      pathname.startsWith(href) &&
      !pathname.startsWith("/home/factors/compare") &&
      !pathname.startsWith("/home/factors/iterate")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function syncButtonLabel(
  pending: boolean,
  autoSyncing: boolean,
  manualSyncing: boolean,
): string {
  if (pending) return "启动中";
  if (manualSyncing) return "同步中";
  if (autoSyncing) return "自动更新中";
  return "手动更新";
}

function HomeLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { data: syncInfo } = useLastUpdated();
  const runSync = useRunSync();
  const syncStatus = useSyncStatus();
  const runningJobs = syncStatus.data?.runningJobs ?? [];
  const manualSyncing = runningJobs.includes("sync-manual");
  const autoSyncing = runningJobs.some((name) => name !== "sync-manual");

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDrawerDismissKey(event.key)) {
        event.preventDefault();
        setMobileOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-full min-h-0 bg-app-canvas">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm lg:hidden"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="business-navigation"
        role={mobileOpen ? "dialog" : undefined}
        aria-label="业务导航"
        aria-modal={mobileOpen ? true : undefined}
        className={`workbench-sidebar fixed inset-y-15 left-0 z-50 flex w-58 shrink-0 flex-col border-r border-app-line p-3 transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          mobileOpen
            ? "translate-x-0 max-lg:visible max-lg:pointer-events-auto"
            : "-translate-x-full max-lg:invisible max-lg:pointer-events-none"
        }`}
      >
        <div className="mb-3 flex items-center justify-between px-2 lg:hidden">
          <span className="text-sm font-semibold text-app-ink">业务导航</span>
          <button
            ref={closeButtonRef}
            type="button"
            className="grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-panel hover:text-app-ink"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <Link
          to="/home"
          onClick={() => setMobileOpen(false)}
          className={`focus-ring mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${
            location.pathname === "/home"
              ? "bg-app-panel font-medium text-app-ink shadow-sm"
              : "text-app-muted hover:bg-app-panel hover:text-app-ink"
          }`}
        >
          <Gauge className="size-4 text-primary" />
          今日工作台
        </Link>

        <nav className="min-h-0 flex-1 overflow-y-auto px-1" aria-label="业务导航">
          {NAV_GROUPS.map((group) => (
            <section key={group.label} className="mb-4">
              <p className="mb-1.5 px-2 text-[10px] font-medium text-app-faint">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(({ label, href, icon: Icon }) => {
                  const selected = isSelected(location.pathname, href);
                  return (
                    <Link
                      key={href}
                      to={href}
                      onClick={() => setMobileOpen(false)}
                      className={`focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                        selected
                          ? "bg-primary font-medium text-primary-foreground shadow-[0_7px_18px_rgba(49,87,232,0.16)]"
                          : "text-app-muted hover:bg-app-panel hover:text-app-ink"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="mt-2 border-t border-app-line pt-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] text-app-faint">数据状态</span>
            <span className="flex items-center gap-1 text-[10px] text-app-success">
              <span className="size-1.5 rounded-full bg-app-success" />
              在线
            </span>
          </div>
          <p className="px-1 text-xs text-app-muted">{formatDateTime(syncInfo?.updatedAt)}</p>
          <button
            type="button"
            className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-app-line bg-app-panel px-2 py-2 text-xs text-app-muted transition hover:border-app-line-strong hover:text-app-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={runSync.isPending || autoSyncing || manualSyncing}
            onClick={() => runSync.mutate()}
          >
            <RefreshCw
              className={`size-3.5 ${runSync.isPending || autoSyncing || manualSyncing ? "animate-spin" : ""}`}
            />
            {syncButtonLabel(runSync.isPending, autoSyncing, manualSyncing)}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-app-line bg-app-panel/90 px-4 backdrop-blur lg:hidden">
            <button
              ref={menuButtonRef}
              type="button"
              className="grid size-8 place-items-center rounded-lg border border-app-line text-app-muted"
              aria-label="打开导航"
              aria-controls="business-navigation"
              aria-expanded={mobileOpen}
              aria-haspopup="dialog"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" />
            </button>
            <span className="text-sm font-medium text-app-ink">业务导航</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
