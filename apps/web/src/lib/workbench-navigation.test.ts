import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantWorkspacePath,
  getPageBackTarget,
  getSyncAvailability,
  getWorkbenchBreadcrumbs,
  getWorkbenchPageTitle,
  isWorkbenchNavSelected,
  isDrawerDismissKey,
  parseSidebarCollapsed,
  searchWorkbenchPages,
  WORKBENCH_NAV_GROUPS,
  WORKBENCH_ACTION_LINKS,
} from "./workbench-navigation.ts";

test("workbench actions cover review, factor iteration, screening, and backtest", () => {
  assert.deepEqual(
    WORKBENCH_ACTION_LINKS.map((item) => item.href),
    ["/home/reviews/today", "/home/factors/iterate", "/home/screens", "/home/backtest"],
  );
});

test("drawer dismisses only on Escape", () => {
  assert.equal(isDrawerDismissKey("Escape"), true);
  assert.equal(isDrawerDismissKey("Enter"), false);
});

test("visible navigation matches the confirmed workbench prototype", () => {
  assert.deepEqual(
    WORKBENCH_NAV_GROUPS.map((group) => group.label),
    ["工作空间", "市场情报", "量化研究", "流程自动化"],
  );
  assert.deepEqual(
    WORKBENCH_NAV_GROUPS.find((group) => group.label === "工作空间")?.items.map(
      (item) => item.label,
    ),
    ["每日看板", "工作任务", "每日复盘", "每日选股"],
  );
  assert.deepEqual(
    WORKBENCH_NAV_GROUPS.find((group) => group.label === "市场情报")?.items.map(
      (item) => item.label,
    ),
    ["行情中心", "个股分析", "研报洞察"],
  );
  assert.deepEqual(
    WORKBENCH_NAV_GROUPS.find((group) => group.label === "量化研究")?.items.map(
      (item) => item.label,
    ),
    ["策略", "因子", "回测", "衰退对比", "因子迭代"],
  );
  assert.deepEqual(
    WORKBENCH_NAV_GROUPS.find((group) => group.label === "流程自动化")?.items.map(
      (item) => item.label,
    ),
    ["工作流"],
  );
  assert.equal(
    WORKBENCH_NAV_GROUPS.flatMap((group) => group.items).some((item) => item.label === "知识库"),
    false,
  );
});

test("page titles use stable generic names for detail routes", () => {
  assert.equal(getWorkbenchPageTitle("/home"), "每日看板");
  assert.equal(getWorkbenchPageTitle("/home/tasks"), "工作任务");
  assert.equal(getWorkbenchPageTitle("/home/market"), "行情中心");
  assert.equal(getWorkbenchPageTitle("/home/market/analysis"), "个股分析");
  assert.equal(getWorkbenchPageTitle("/home/market/analysis/002594.SZ"), "个股分析");
  assert.equal(getWorkbenchPageTitle("/home/market/analysis/compare"), "个股分析");
  assert.equal(getWorkbenchPageTitle("/home/research"), "研报洞察");
  assert.equal(getWorkbenchPageTitle("/home/reviews/today"), "每日复盘");
  assert.equal(getWorkbenchPageTitle("/home/reviews/history"), "历史复盘");
  assert.equal(getWorkbenchPageTitle("/home/factors/momentum"), "因子");
  assert.equal(getWorkbenchPageTitle("/home/market/stock/600519"), "个股");
  assert.equal(getWorkbenchPageTitle("/home/market/boards/BK1036"), "板块");
  assert.equal(getWorkbenchPageTitle("/home/strategies/42"), "策略");
  assert.equal(getWorkbenchPageTitle("/home/reviews/history/2026-11-17"), "历史复盘");
  assert.equal(getWorkbenchPageTitle("/home/workflows"), "工作流");
  assert.equal(getWorkbenchPageTitle("/home/data-management"), "数据管理");
  assert.equal(getWorkbenchPageTitle("/home/data-management/tables"), "数据表");
  assert.equal(getWorkbenchPageTitle("/home/data-management/governance"), "数据治理");
  assert.equal(
    getWorkbenchPageTitle("/home/data-management/governance/assets"),
    "资产与契约",
  );
  assert.equal(
    getWorkbenchPageTitle("/home/data-management/governance/source-standards"),
    "来源标准",
  );
  assert.equal(getWorkbenchPageTitle("/ai-chat/c/abc"), "AI 助手");
});

test("market navigation distinguishes stock analysis from market center", () => {
  assert.equal(isWorkbenchNavSelected("/home/market/analysis", "/home/market"), false);
  assert.equal(isWorkbenchNavSelected("/home/market/analysis", "/home/market/analysis"), true);
  assert.equal(isWorkbenchNavSelected("/home/market/stock/002594.SZ", "/home/market"), true);
  assert.equal(isWorkbenchNavSelected("/home/market/boards/BK1036", "/home/market"), true);
  assert.equal(isWorkbenchNavSelected("/home", "/home"), true);
});

test("breadcrumbs use a clickable root and deterministic parent", () => {
  assert.deepEqual(getWorkbenchBreadcrumbs("/home"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "每日看板", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/workflows/42"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "工作流", href: "/home/workflows" },
    { label: "工作流详情", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/market"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "行情中心", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/market/boards"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "行情中心", href: "/home/market" },
    { label: "板块", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/market/boards/BK1036"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "行情中心", href: "/home/market" },
    { label: "板块", href: "/home/market/boards" },
    { label: "板块详情", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/market/analysis"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "个股分析", href: null },
  ]);
  assert.deepEqual(getWorkbenchBreadcrumbs("/home/market/analysis/compare"), [
    { label: "Apollo Quant", href: "/home" },
    { label: "个股分析", href: "/home/market/analysis" },
    { label: "个股对比", href: null },
  ]);
  assert.deepEqual(
    getWorkbenchBreadcrumbs("/home/market/analysis/002594.SZ", { stockName: "比亚迪" }),
    [
      { label: "Apollo Quant", href: "/home" },
      { label: "个股分析", href: "/home/market/analysis" },
      { label: "比亚迪", href: null },
    ],
  );
});

test("assistant workspace target keeps an existing conversation", () => {
  assert.equal(assistantWorkspacePath(null), "/ai-chat");
  assert.equal(assistantWorkspacePath("thread-1"), "/ai-chat/c/thread-1");
});

test("page-level return uses deterministic parent routes", () => {
  assert.deepEqual(getPageBackTarget("/home/workflows/42"), {
    href: "/home/workflows",
    label: "返回工作流",
  });
  assert.deepEqual(getPageBackTarget("/home/workflows/runs/9"), {
    href: "/home/workflows",
    label: "返回工作流",
  });
  assert.deepEqual(getPageBackTarget("/home/reviews/history"), {
    href: "/home/reviews/today",
    label: "返回每日复盘",
  });
  assert.deepEqual(getPageBackTarget("/home/factors/momentum"), {
    href: "/home/factors",
    label: "返回因子",
  });
  assert.deepEqual(getPageBackTarget("/home/strategies/42"), {
    href: "/home/strategies",
    label: "返回策略",
  });
  assert.deepEqual(getPageBackTarget("/home/data-center/bar1d_raw"), {
    href: "/home/data-center",
    label: "返回数据中心",
  });
  assert.deepEqual(
    getPageBackTarget("/home/data-management/governance/assets"),
    {
      href: "/home/data-management/governance",
      label: "返回数据治理",
    },
  );
  assert.equal(getPageBackTarget("/home/market/analysis"), null);
  assert.deepEqual(getPageBackTarget("/home/market/analysis/002594.SZ"), {
    href: "/home/market/analysis",
    label: "返回个股分析",
  });
  assert.deepEqual(getPageBackTarget("/home/market/analysis/compare"), {
    href: "/home/market/analysis",
    label: "返回个股分析",
  });
  assert.equal(getPageBackTarget("/home"), null);
  assert.equal(getPageBackTarget("/home/factors"), null);
  assert.equal(getPageBackTarget("/home/factors/compare"), null);
  assert.equal(getPageBackTarget("/home/factors/iterate"), null);
  assert.deepEqual(getPageBackTarget("/ai-chat"), {
    href: null,
    label: "返回来源页面",
  });
  assert.deepEqual(getPageBackTarget("/news"), {
    href: "/home",
    label: "返回工作台",
  });
});

test("workbench search returns visible pages only", () => {
  assert.deepEqual(
    searchWorkbenchPages("工作任务").map((item) => item.href),
    ["/home/tasks"],
  );
  assert.deepEqual(
    searchWorkbenchPages("行情").map((item) => item.href),
    ["/home/market"],
  );
  assert.deepEqual(
    searchWorkbenchPages("个股分析").map((item) => item.href),
    ["/home/market/analysis"],
  );
  assert.deepEqual(
    searchWorkbenchPages("研报").map((item) => item.href),
    ["/home/research"],
  );
  assert.deepEqual(
    searchWorkbenchPages("衰退").map((item) => item.href),
    ["/home/factors/compare"],
  );
  assert.deepEqual(searchWorkbenchPages("板块"), []);
  assert.deepEqual(searchWorkbenchPages("数据管理"), []);
  assert.deepEqual(
    searchWorkbenchPages("数据管理", "super_admin").map((item) => item.href),
    ["/home/data-management"],
  );
});

test("sidebar collapse state only restores an explicit true value", () => {
  assert.equal(parseSidebarCollapsed("true"), true);
  assert.equal(parseSidebarCollapsed("false"), false);
  assert.equal(parseSidebarCollapsed(null), false);
});

test("sync availability distinguishes loading, unavailable, and online", () => {
  assert.equal(getSyncAvailability({ isLoading: true, isError: false }), "loading");
  assert.equal(getSyncAvailability({ isLoading: false, isError: true }), "unavailable");
  assert.equal(getSyncAvailability({ isLoading: false, isError: false }), "unavailable");
  assert.equal(
    getSyncAvailability({
      isLoading: false,
      isError: false,
      updatedAt: "2026-11-17T06:28:00.000Z",
    }),
    "online",
  );
});
