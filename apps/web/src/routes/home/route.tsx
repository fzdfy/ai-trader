import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { SideNav, SideNavSection, SideNavItem } from "@astryxdesign/core/SideNav";

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
          width: 200,
          minWidth: 200,
          overflowY: "auto",
          background: "var(--color-surface-elevated)",
          borderRight: "2px solid var(--color-border)",
        }}
      >
        <SideNav>
          <SideNavSection title="行情" isHeaderHidden>
            <SideNavItem
              label="行情"
              href="/home/market"
              isSelected={location.pathname.startsWith("/home/market")}
            >
              <SideNavItem
                label="板块"
                href="/home/market/boards"
                isSelected={location.pathname.startsWith("/home/market/boards")}
              />
              <SideNavItem
                label="个股"
                href="/home/market/stocks"
                isSelected={
                  location.pathname.startsWith("/home/market/stocks") &&
                  !location.searchStr.includes("tab=watchlist")
                }
              />
              <SideNavItem
                label="自选"
                href="/home/market/stocks?tab=watchlist"
                isSelected={
                  location.pathname.startsWith("/home/market/stocks") &&
                  location.searchStr.includes("tab=watchlist")
                }
              />
            </SideNavItem>
          </SideNavSection>

          <SideNavSection title="信号" isHeaderHidden>
            <SideNavItem
              label="信号"
              href="/home/signals"
              isSelected={location.pathname.startsWith("/home/signals")}
            >
              <SideNavItem
                label="筹码分布"
                href="/home/signals/chips"
                isSelected={location.pathname.startsWith("/home/signals/chips")}
              />
              <SideNavItem
                label="资金流向"
                href="/home/signals/fundflow"
                isSelected={location.pathname.startsWith("/home/signals/fundflow")}
              />
              <SideNavItem
                label="热力图"
                href="/home/signals/heatmap"
                isSelected={location.pathname.startsWith("/home/signals/heatmap")}
              />
            </SideNavItem>
          </SideNavSection>

          <SideNavItem
            label="回测"
            href="/home/backtest"
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
