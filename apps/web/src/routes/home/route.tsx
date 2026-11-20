import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import {
  BookOpenText,
  ChartNoAxesCombined,
  Database,
  FlaskConical,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";
import { PageNavigation } from "../../components/PageNavigation";
import { ProfileDialog } from "../../components/ProfileDialog";
import { useAppTheme } from "../../components/AppThemeProvider";
import { useLastUpdated, useSyncStatus } from "../../hooks/useDataSync";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useWorkTaskSummary } from "../../hooks/useWorkTasks";
import { authClient } from "../../lib/auth-client";
import {
  getSyncAvailability,
  getSystemLinksForRole,
  isWorkbenchNavSelected,
  isDrawerDismissKey,
  parseSidebarCollapsed,
  WORKBENCH_NAV_GROUPS,
  type WorkbenchNavIcon,
} from "../../lib/workbench-navigation";
import { localDateContext } from "../../lib/work-tasks";

export const Route = createFileRoute("/home")({
  component: HomeLayout,
});

const NAV_ICONS: Record<WorkbenchNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  tasks: ListChecks,
  history: History,
  target: Target,
  market: ChartNoAxesCombined,
  analysis: Search,
  research: BookOpenText,
  strategy: FlaskConical,
  factor: SlidersHorizontal,
  backtest: TrendingUp,
  decay: TrendingDown,
  iteration: Sparkles,
  workflow: Workflow,
};

const SYSTEM_ICONS = {
  database: Database,
  palette: Palette,
} as const;

const SIDEBAR_COLLAPSED_KEY = "apollo-workbench-sidebar-collapsed";

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

function readSidebarCollapsed(): boolean {
  try {
    return parseSidebarCollapsed(globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) ?? null);
  } catch {
    return false;
  }
}

function HomeLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();
  const { data: currentUser } = useCurrentUser();
  const { preset } = useAppTheme();
  const { data: syncInfo, isError: syncError, isLoading: syncLoading } = useLastUpdated();
  const syncStatus = useSyncStatus();
  const autoSyncing = syncStatus.data?.running ?? false;
  const syncAvailability = getSyncAvailability({
    isLoading: syncLoading,
    isError: syncError,
    updatedAt: syncInfo?.updatedAt,
  });
  const syncStatusLabel = autoSyncing
    ? "同步进行中"
    : syncAvailability === "loading"
      ? "读取同步状态"
      : syncAvailability === "online"
        ? "数据在线"
        : "同步状态不可用";
  const systemLinks = getSystemLinksForRole(currentUser?.role ?? null);
  const taskDate = useMemo(() => localDateContext(), []);
  const workTaskSummary = useWorkTaskSummary(
    taskDate.localDate,
    taskDate.timezone,
  );

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Local persistence is optional; the layout still works without storage.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDrawerDismissKey(event.key)) {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
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
        ref={sidebarRef}
        id="business-navigation"
        data-collapsed={sidebarCollapsed}
        role={mobileOpen ? "dialog" : undefined}
        aria-label="业务导航"
        aria-modal={mobileOpen ? true : undefined}
        className={`workbench-sidebar fixed inset-y-0 left-0 z-50 flex w-[238px] shrink-0 flex-col px-3.5 pb-[13px] pt-[17px] transition-[width,transform] lg:static lg:z-auto lg:translate-x-0 ${
          sidebarCollapsed ? "lg:w-[68px] lg:px-0" : "lg:w-[238px]"
        } ${
          mobileOpen
            ? "translate-x-0 max-lg:visible max-lg:pointer-events-auto"
            : "-translate-x-full max-lg:invisible max-lg:pointer-events-none"
        }`}
      >
        <div
          className={`mb-3.5 flex items-center justify-between ${
            sidebarCollapsed ? "lg:flex-col lg:gap-2" : ""
          }`}
        >
          <Link
            to="/home"
            onClick={() => setMobileOpen(false)}
            className={`focus-ring flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 ${
              sidebarCollapsed ? "lg:justify-center" : ""
            }`}
            aria-label="Apollo Quant 工作台"
            data-tooltip="Apollo Quant"
          >
            <BrandLogo color={preset.accent} size={34} />
            <span className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <span className="block truncate text-sm font-semibold tracking-tight text-app-ink">
                Apollo Quant
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-app-muted">
                量化 AI 工作台
              </span>
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            className="grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-panel hover:text-app-ink lg:hidden"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            className="focus-ring hidden size-8 place-items-center rounded-lg text-app-muted hover:bg-app-panel hover:text-app-ink lg:grid"
            aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            aria-pressed={sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="业务导航">
          {WORKBENCH_NAV_GROUPS.map((group) => (
            <section key={group.label} className={sidebarCollapsed ? "mb-3 lg:mb-1" : "mb-3"}>
              <p
                className={`mb-1.5 px-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] ${
                  sidebarCollapsed ? "lg:hidden" : ""
                }`}
                style={{ color: "var(--workbench-sidebar-label)" }}
              >
                {group.label}
              </p>
              <div className="space-y-[3px]">
                {group.items.map(({ label, href, icon }) => {
                  const Icon = NAV_ICONS[icon];
                  const selected = isWorkbenchNavSelected(location.pathname, href);
                  return (
                    <Link
                      key={href}
                      to={href}
                      onClick={() => setMobileOpen(false)}
                      data-tooltip={label}
                      className={`workbench-nav-item focus-ring flex min-h-[34px] w-full items-center gap-2 rounded-[9px] px-2.5 text-[11px] transition ${
                        sidebarCollapsed ? "lg:mx-auto lg:w-[42px] lg:justify-center lg:px-0" : ""
                      } ${
                        selected
                          ? "workbench-nav-active bg-primary font-medium text-primary-foreground"
                          : "text-app-muted hover:bg-app-panel/70 hover:text-app-ink"
                      }`}
                      aria-label={label}
                    >
                      <Icon className={`size-3.5 ${selected ? "" : "text-app-faint"}`} />
                      <span className={sidebarCollapsed ? "lg:hidden" : ""}>{label}</span>
                      {href === "/home/tasks" &&
                      workTaskSummary.data?.incompleteToday ? (
                        <span
                          className={`ml-auto rounded-full px-1.5 py-0.5 font-mono text-[9px] ${
                            selected
                              ? "bg-primary-foreground/15 text-primary-foreground"
                              : "bg-app-panel text-app-muted"
                          } ${sidebarCollapsed ? "lg:hidden" : ""}`}
                        >
                          {workTaskSummary.data.incompleteToday > 99
                            ? "99+"
                            : workTaskSummary.data.incompleteToday}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="mt-2 space-y-2 border-t border-app-line pt-3">
          <div
            role="status"
            aria-label={`${syncStatusLabel}，最近同步 ${formatDateTime(syncInfo?.updatedAt)}`}
            title={`${formatDateTime(syncInfo?.updatedAt)} · ${syncStatusLabel}`}
            className={`flex h-[34px] items-center justify-center gap-2 rounded-full border px-3 text-[11px] text-app-muted ${
              sidebarCollapsed ? "lg:mx-auto lg:w-[42px] lg:px-0" : ""
            }`}
            style={{
              background: "var(--workbench-sidebar-card)",
              borderColor: "var(--workbench-sidebar-card-border)",
            }}
          >
            <span
              className={`size-2 rounded-full ring-4 ${
                syncAvailability === "unavailable"
                  ? "bg-destructive ring-destructive/10"
                  : "bg-app-warning ring-app-warning/10"
              }`}
            />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>{syncStatusLabel}</span>
          </div>

          <div
            className={`flex gap-1.5 ${
              sidebarCollapsed ? "lg:flex-col lg:items-center lg:gap-[5px]" : ""
            }`}
          >
            {systemLinks.map(({ label, href, icon }) => {
              const Icon = SYSTEM_ICONS[icon];
              const selected = isWorkbenchNavSelected(location.pathname, href);
              return (
                <Link
                  key={href}
                  to={href}
                  onClick={() => setMobileOpen(false)}
                  data-tooltip={label}
                  className={`focus-ring grid size-[33px] place-items-center rounded-lg border transition ${
                    selected
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "text-app-muted hover:border-app-line-strong hover:text-primary"
                  }`}
                  style={{
                    background: selected ? undefined : "var(--workbench-sidebar-card)",
                    borderColor: selected ? undefined : "var(--workbench-sidebar-card-border)",
                  }}
                  aria-label={label}
                >
                  <Icon className="size-3.5" />
                </Link>
              );
            })}
          </div>

          {session ? (
            <div className={sidebarCollapsed ? "lg:flex lg:justify-center" : ""}>
              <div className={`hs-dropdown relative ${sidebarCollapsed ? "lg:w-10" : "w-full"}`}>
                <button
                  type="button"
                  className={`hs-dropdown-toggle focus-ring flex min-h-[45px] w-full items-center gap-2 rounded-xl border p-1.5 text-left transition hover:border-app-line-strong ${
                    sidebarCollapsed ? "lg:size-10 lg:justify-center lg:p-0" : ""
                  }`}
                  style={{
                    background: "var(--workbench-sidebar-card)",
                    borderColor: "var(--workbench-sidebar-card-border)",
                  }}
                  aria-label="账户菜单"
                  title={sidebarCollapsed ? session.user.name : undefined}
                >
                  {session.user.image ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="size-[30px] shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {session.user.name.slice(0, 1)}
                    </span>
                  )}
                  <span className={`min-w-0 flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    <span className="block truncate text-[11px] font-semibold text-app-ink">
                      {session.user.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-app-muted">
                      量化研究 · Pro
                    </span>
                  </span>
                  <MoreHorizontal
                    className={`size-4 shrink-0 text-app-faint ${
                      sidebarCollapsed ? "lg:hidden" : ""
                    }`}
                  />
                </button>
                <div className="hs-dropdown-menu invisible absolute bottom-full left-0 z-50 mb-2 w-52 translate-y-1 rounded-xl border border-app-line bg-app-panel p-1.5 opacity-0 shadow-xl transition-[opacity,transform] duration-150 hs-dropdown-open:visible hs-dropdown-open:translate-y-0 hs-dropdown-open:opacity-100">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-muted hover:bg-app-surface hover:text-app-ink"
                    onClick={() => setProfileOpen(true)}
                  >
                    <Settings className="size-4" />
                    编辑资料
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-muted hover:bg-app-surface hover:text-app-ink"
                    onClick={() => {
                      void authClient.signOut().then(() => {
                        globalThis.location.href = "/login";
                      });
                    }}
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <PageNavigation
            mobileMenuButtonRef={menuButtonRef}
            onOpenMobileMenu={() => setMobileOpen(true)}
          />
          <div
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
          >
            <Outlet />
          </div>
        </div>
      </main>

      {session ? (
        <ProfileDialog
          isOpen={profileOpen}
          onOpenChange={setProfileOpen}
          name={session.user.name}
          image={session.user.image}
        />
      ) : null}
    </div>
  );
}
