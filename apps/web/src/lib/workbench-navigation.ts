import { getSystemLinksForRole } from "./data-management-access.ts";

export { getSystemLinksForRole };

export const WORKBENCH_ACTION_LINKS = [
  {
    title: "生成今日复盘",
    description: "聚合主线、资金与市场情绪",
    href: "/home/reviews/today",
  },
  {
    title: "迭代因子",
    description: "根据近期表现生成改进建议",
    href: "/home/factors/iterate",
  },
  {
    title: "运行选股任务",
    description: "按当前策略筛选候选池",
    href: "/home/screens",
  },
  {
    title: "发起回测",
    description: "验证策略在历史区间中的表现",
    href: "/home/backtest",
  },
] as const;

export const WORKBENCH_NAV_GROUPS = [
  {
    label: "工作空间",
    items: [
      { label: "每日看板", href: "/home", icon: "dashboard" },
      { label: "工作任务", href: "/home/tasks", icon: "tasks" },
      { label: "每日复盘", href: "/home/reviews/today", icon: "history" },
      { label: "每日选股", href: "/home/screens", icon: "target" },
    ],
  },
  {
    label: "市场情报",
    items: [
      { label: "行情中心", href: "/home/market", icon: "market" },
      { label: "个股分析", href: "/home/market/analysis", icon: "analysis" },
      { label: "研报洞察", href: "/home/research", icon: "research" },
    ],
  },
  {
    label: "量化研究",
    items: [
      { label: "策略", href: "/home/strategies", icon: "strategy" },
      { label: "因子", href: "/home/factors", icon: "factor" },
      { label: "回测", href: "/home/backtest", icon: "backtest" },
      { label: "衰退对比", href: "/home/factors/compare", icon: "decay" },
      { label: "因子迭代", href: "/home/factors/iterate", icon: "iteration" },
    ],
  },
  {
    label: "流程自动化",
    items: [{ label: "工作流", href: "/home/workflows", icon: "workflow" }],
  },
] as const;

export type WorkbenchNavIcon = (typeof WORKBENCH_NAV_GROUPS)[number]["items"][number]["icon"];

const PAGE_TITLES = [
  ["/home/reviews/today", "每日复盘"],
  ["/home/reviews/history", "历史复盘"],
  ["/home/factors/compare", "衰退对比"],
  ["/home/factors/iterate", "因子迭代"],
  ["/home/factors", "因子"],
  ["/home/strategies", "策略"],
  ["/home/data-center", "数据中心"],
  ["/home/market/boards", "板块"],
  ["/home/market/stock", "个股"],
  ["/home/market/analysis", "个股分析"],
  ["/home/market", "行情中心"],
  ["/home/signals/chips", "筹码分布"],
  ["/home/signals/fundflow", "资金流向"],
  ["/home/signals/heatmap", "热力图"],
  ["/home/backtest", "回测"],
  ["/home/screens", "每日选股"],
  ["/home/tasks", "工作任务"],
  ["/home/research", "研报洞察"],
  ["/home/data-management/tables", "数据表"],
  ["/home/data-management/sources", "数据源"],
  ["/home/data-management/sync", "数据同步"],
  ["/home/data-management/quality", "数据质量"],
  ["/home/data-management/governance/assets", "资产与契约"],
  ["/home/data-management/governance/quality", "质量规则与结果"],
  ["/home/data-management/governance/source-standards", "来源标准"],
  ["/home/data-management/governance/review-tasks", "治理任务"],
  ["/home/data-management/governance/incidents", "数据事故"],
  ["/home/data-management/governance", "数据治理"],
  ["/home/data-management/audit", "操作审计"],
  ["/home/data-management", "数据管理"],
  ["/home/sync", "同步中心"],
  ["/home/settings", "主题设置"],
  ["/home/knowledge", "知识库"],
  ["/home/workflows", "工作流"],
  ["/news", "研报洞察"],
  ["/ai-chat", "AI 助手"],
] as const;

const WORKBENCH_SEARCH_PAGES = [
  ...WORKBENCH_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      label: item.label,
      href: item.href,
      description: group.label,
    })),
  ),
  ...WORKBENCH_ACTION_LINKS.map((item) => ({
    label: item.title,
    href: item.href,
    description: item.description,
  })),
];

export function getWorkbenchPageTitle(pathname: string): string {
  if (pathname === "/home") return "每日看板";
  return (
    PAGE_TITLES.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ??
    "工作台"
  );
}

export interface WorkbenchBreadcrumb {
  label: string;
  href: string | null;
}

export interface WorkbenchBreadcrumbOptions {
  stockName?: string | null;
}

export function getWorkbenchBreadcrumbs(
  pathname: string,
  options: WorkbenchBreadcrumbOptions = {},
): WorkbenchBreadcrumb[] {
  const currentLabel = getWorkbenchPageTitle(pathname);
  const root = { label: "Apollo Quant", href: "/home" };
  if (pathname === "/home/market/analysis") {
    return [root, { label: "个股分析", href: null }];
  }
  if (pathname.startsWith("/home/market/analysis/")) {
    const isCompare = pathname === "/home/market/analysis/compare";
    const symbol = decodeURIComponent(pathname.slice("/home/market/analysis/".length));
    return [
      root,
      { label: "个股分析", href: "/home/market/analysis" },
      { label: isCompare ? "个股对比" : (options.stockName ?? symbol), href: null },
    ];
  }
  const parent = getPageBackTarget(pathname);
  if (!parent?.href || parent.href === "/home") {
    return [root, { label: currentLabel, href: null }];
  }

  const parentLabel = getWorkbenchPageTitle(parent.href);
  return [
    root,
    { label: parentLabel, href: parent.href },
    {
      label: currentLabel === parentLabel ? `${parentLabel}详情` : currentLabel,
      href: null,
    },
  ];
}

export interface PageBackTarget {
  href: string | null;
  label: string;
}

export function getPageBackTarget(pathname: string): PageBackTarget | null {
  if (pathname.startsWith("/ai-chat")) {
    return { href: null, label: "返回来源页面" };
  }
  if (pathname === "/news") {
    return { href: "/home", label: "返回工作台" };
  }
  if (pathname === "/home/market/analysis") {
    return null;
  }
  if (pathname.startsWith("/home/market/analysis/")) {
    return { href: "/home/market/analysis", label: "返回个股分析" };
  }
  if (pathname === "/home/workflows" || pathname === "/home/workflows/new") {
    return pathname === "/home/workflows" ? null : { href: "/home/workflows", label: "返回工作流" };
  }
  if (pathname.startsWith("/home/workflows/")) {
    return { href: "/home/workflows", label: "返回工作流" };
  }
  if (pathname === "/home/reviews/history") {
    return { href: "/home/reviews/today", label: "返回每日复盘" };
  }
  if (pathname.startsWith("/home/reviews/history/")) {
    return { href: "/home/reviews/history", label: "返回历史复盘" };
  }
  if (pathname === "/home/reviews/skill") {
    return { href: "/home/reviews/today", label: "返回每日复盘" };
  }
  if (
    pathname === "/home/factors" ||
    pathname.startsWith("/home/factors/compare") ||
    pathname.startsWith("/home/factors/iterate")
  ) {
    return null;
  }
  if (pathname.startsWith("/home/factors/")) {
    return { href: "/home/factors", label: "返回因子" };
  }
  if (pathname === "/home/strategies") {
    return null;
  }
  if (pathname.startsWith("/home/strategies/")) {
    return { href: "/home/strategies", label: "返回策略" };
  }
  if (pathname.startsWith("/home/data-center/")) {
    return { href: "/home/data-center", label: "返回数据中心" };
  }
  if (pathname.startsWith("/home/data-management/tables/")) {
    return { href: "/home/data-management/tables", label: "返回数据表" };
  }
  if (
    pathname.startsWith("/home/data-management/governance/") &&
    pathname !== "/home/data-management/governance"
  ) {
    return {
      href: "/home/data-management/governance",
      label: "返回数据治理",
    };
  }
  if (
    pathname === "/home/market/boards" ||
    pathname.startsWith("/home/signals/") ||
    pathname === "/home/knowledge"
  ) {
    return { href: "/home", label: "返回工作台" };
  }
  return null;
}

export function assistantWorkspacePath(threadId: string | null): string {
  return threadId ? `/ai-chat/c/${threadId}` : "/ai-chat";
}

export function isWorkbenchNavSelected(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home";
  if (href === "/home/factors") {
    return (
      pathname.startsWith(href) &&
      !pathname.startsWith("/home/factors/compare") &&
      !pathname.startsWith("/home/factors/iterate")
    );
  }
  if (href === "/home/market")
    return pathname.startsWith(href) && !pathname.startsWith("/home/market/analysis");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function searchWorkbenchPages(query: string, role: unknown = null) {
  const keyword = query.trim().toLocaleLowerCase("zh-CN");
  const pages = [
    ...WORKBENCH_SEARCH_PAGES,
    ...getSystemLinksForRole(role).map((item) => ({
      label: item.label,
      href: item.href,
      description: "系统",
    })),
  ];
  if (!keyword) return pages;
  return pages.filter((item) =>
    `${item.label} ${item.description}`.toLocaleLowerCase("zh-CN").includes(keyword),
  );
}

export function parseSidebarCollapsed(value: string | null): boolean {
  return value === "true";
}

export function getSyncAvailability({
  isLoading,
  isError,
  updatedAt,
}: {
  isLoading: boolean;
  isError: boolean;
  updatedAt?: string | null;
}): "loading" | "online" | "unavailable" {
  if (isLoading) return "loading";
  if (isError || !updatedAt) return "unavailable";
  return "online";
}

export function isDrawerDismissKey(key: string): boolean {
  return key === "Escape";
}
