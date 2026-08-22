import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { SideNav, SideNavSection, SideNavItem } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import {
  LineChart,
  LayoutGrid,
  Search,
  Activity,
  BarChart3,
  ArrowLeftRight,
  Grid2x2,
  History,
  Gauge,
  Workflow,
  SlidersHorizontal,
  Target,
  RefreshCw,
  ClipboardList,
  FileText,
  ListChecks,
} from "lucide-react";
import { useLastUpdated, useRunSync, useSyncStatus } from "../../hooks/useDataSync";

/** 将 ISO 时间格式化为「YYYY-MM-DD HH:mm:ss」 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "暂无数据";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无数据";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const Route = createFileRoute("/home")({
  component: HomeLayout,
});

function HomeLayout() {
  const location = useLocation();
  const { data: syncInfo } = useLastUpdated();
  const runSync = useRunSync();
  const syncStatus = useSyncStatus();
  // 定时任务（cron worker）运行中的同步，区别于手动同步（sync-manual）
  const autoSyncing = (syncStatus.data?.runningJobs ?? []).some(
    (name) => name !== "sync-manual",
  );
  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      {/* 侧边栏 */}
      <div
        style={{
          minWidth: 200,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <SideNav>
          <SideNavSection title="行情" isHeaderHidden>
            <SideNavItem label="行情" icon={<LineChart size={16} />}>
              <SideNavItem
                label="板块"
                href="/home/market/boards"
                icon={<LayoutGrid size={16} />}
                isSelected={location.pathname.startsWith("/home/market/boards")}
              />
              <SideNavItem
                label="个股"
                href="/home/market/stock"
                icon={<Search size={16} />}
                isSelected={
                  location.pathname.startsWith("/home/market/stock") &&
                  location.searchStr.includes("tab=stock")
                }
              />
            </SideNavItem>
          </SideNavSection>

          <SideNavSection title="信号" isHeaderHidden>
            <SideNavItem label="信号" icon={<Activity size={16} />}>
              <SideNavItem
                label="筹码分布"
                href="/home/signals/chips"
                icon={<BarChart3 size={16} />}
                isSelected={location.pathname.startsWith("/home/signals/chips")}
              />
              <SideNavItem
                label="资金流向"
                href="/home/signals/fundflow"
                icon={<ArrowLeftRight size={16} />}
                isSelected={location.pathname.startsWith("/home/signals/fundflow")}
              />
              <SideNavItem
                label="热力图"
                href="/home/signals/heatmap"
                icon={<Grid2x2 size={16} />}
                isSelected={location.pathname.startsWith("/home/signals/heatmap")}
              />
            </SideNavItem>
          </SideNavSection>

          <SideNavSection title="复盘" isHeaderHidden>
            <SideNavItem label="复盘" icon={<ClipboardList size={16} />}>
              <SideNavItem
                label="今日复盘"
                href="/home/reviews/today"
                icon={<FileText size={16} />}
                isSelected={location.pathname === "/home/reviews/today"}
              />
              <SideNavItem
                label="历史复盘"
                href="/home/reviews/history"
                icon={<ListChecks size={16} />}
                isSelected={location.pathname.startsWith("/home/reviews/history")}
              />
            </SideNavItem>
          </SideNavSection>

          <SideNavSection title="量化" isHeaderHidden>
            <SideNavItem label="量化" icon={<Gauge size={16} />}>
              <SideNavItem
                label="回测"
                href="/home/backtest"
                icon={<History size={16} />}
                isSelected={location.pathname === "/home/backtest"}
              />
              <SideNavItem
                label="选股"
                href="/home/screens"
                icon={<Target size={16} />}
                isSelected={location.pathname.startsWith("/home/screens")}
              />
              <SideNavItem
                label="策略"
                href="/home/strategies"
                icon={<Workflow size={16} />}
                isSelected={location.pathname.startsWith("/home/strategies")}
              />
              <SideNavItem
                label="因子"
                href="/home/factors"
                icon={<SlidersHorizontal size={16} />}
                isSelected={location.pathname.startsWith("/home/factors")}
              />
            </SideNavItem>
          </SideNavSection>
        </SideNav>

        {/* 数据更新时间 + 手动更新 */}
        <div
          style={{
            marginTop: "auto",
            padding: "var(--spacing-3)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <VStack gap={2}>
            <Text size="sm" type="supporting">
              数据更新于
            </Text>
            <Text size="sm">{formatDateTime(syncInfo?.updatedAt)}</Text>
            {autoSyncing && (
              <Text size="sm" type="supporting">
                自动更新中...
              </Text>
            )}
            <Button
              label={runSync.isPending ? "更新中..." : "手动更新"}
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} />}
              isDisabled={runSync.isPending || autoSyncing}
              onClick={() => runSync.mutate()}
            />
          </VStack>
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-4)" }}>
        <Outlet />
      </div>
    </div>
  );
}
