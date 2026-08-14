import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { SideNav, SideNavSection, SideNavItem } from "@astryxdesign/core/SideNav";
import {
  LineChart,
  LayoutGrid,
  Search,
  Activity,
  BarChart3,
  ArrowLeftRight,
  Grid2x2,
  History,
} from "lucide-react";

export const Route = createFileRoute("/home")({
  component: HomeLayout,
});

function HomeLayout() {
  const location = useLocation();
  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      {/* 侧边栏 */}
      <div
        style={{
          minWidth: 200,
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

          <SideNavItem
            label="回测"
            href="/home/backtest"
            icon={<History size={16} />}
            isSelected={location.pathname === "/home/backtest"}
          />
        </SideNav>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-4)" }}>
        <Outlet />
      </div>
    </div>
  );
}
