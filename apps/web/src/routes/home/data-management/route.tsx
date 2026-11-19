import { Link, Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Database,
  FileClock,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";
import {
  canAccessDataManagement,
  getDataManagementSectionsForRole,
  type DataManagementSection,
} from "../../../lib/data-management-access";

export const Route = createFileRoute("/home/data-management")({
  beforeLoad: async () => {
    const response = await fetch("/api/v1/system/me", {
      credentials: "include",
    });
    if (!response.ok) throw redirect({ to: "/home" });
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { role?: string };
    };
    if (!payload.success || !canAccessDataManagement(payload.data?.role)) {
      throw redirect({ to: "/home" });
    }
  },
  component: DataManagementLayout,
});

const SECTION_ICONS: Record<DataManagementSection["icon"], LucideIcon> = {
  overview: Gauge,
  database: Database,
  table: Table2,
  sync: RefreshCw,
  quality: Activity,
  governance: ShieldCheck,
  audit: FileClock,
};

function DataManagementLayout() {
  const location = useLocation();
  const sections = getDataManagementSectionsForRole("super_admin");
  const governance =
    location.pathname === "/home/data-management/governance" ||
    location.pathname.startsWith("/home/data-management/governance/");

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 pb-20 md:pb-0">
      <header className="rounded-2xl border border-app-line bg-app-panel px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-app-ink">
              {governance ? "数据治理" : "数据管理"}
            </h1>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              {governance
                ? "把资产责任、契约、质量证据、来源版本和事故收敛到一条可追溯链路。"
                : "观察数据链路、同步状态和质量风险，所有写操作进入审计。"}
            </p>
          </div>
          <span className="rounded-full bg-app-warning/15 px-2.5 py-1 text-[11px] font-medium text-app-ink">
            仅超级管理员
          </span>
        </div>
        <nav
          aria-label="数据管理页面导航"
          className="mt-3 flex flex-wrap gap-1 border-t border-app-line pt-3"
        >
          {sections.map((section) => {
            const { label, href, exact = false } = section;
            const Icon = SECTION_ICONS[section.icon];
            const selected = exact
              ? location.pathname === href || location.pathname === `${href}/`
              : location.pathname === href || location.pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                to={href as "/home/data-management"}
                activeOptions={{ exact }}
                className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-app-muted hover:bg-app-surface hover:text-app-ink"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
