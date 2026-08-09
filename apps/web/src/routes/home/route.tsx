import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { SideNav, SideNavSection, SideNavItem } from "@astryxdesign/core/SideNav";

export const Route = createFileRoute("/home")({
  component: HomeLayout,
});

/** 首页布局 — 侧边栏 + Outlet，包裹所有 /home/* 子路由 */
function HomeLayout() {
  const location = useLocation();
  return (
    <Layout
      height="fill"
      start={
        <div style={{ width: 200, overflowY: "auto" }}>
          <SideNav>
            <SideNavSection title="行情" isHeaderHidden>
              <SideNavItem
                label="行情"
                href="/home/market"
                isSelected={location.pathname === "/home/market"}
              >
                <SideNavItem
                  label="板块"
                  href="/home/market/boards"
                  isSelected={location.pathname === "/home/market/boards"}
                />
                <SideNavItem
                  label="个股"
                  href="/home/market/stocks"
                  isSelected={location.pathname === "/home/market/stocks"}
                />
                <SideNavItem
                  label="自选"
                  href="/home/market/stocks?tab=watchlist"
                  isSelected={
                    location.pathname === "/home/market/stocks" &&
                    location.search.includes("tab=watchlist")
                  }
                />
              </SideNavItem>
            </SideNavSection>

            <SideNavSection title="信号" isHeaderHidden>
              <SideNavItem
                label="信号"
                href="/home/signals"
                isSelected={location.pathname === "/home/signals"}
              >
                <SideNavItem
                  label="筹码分布"
                  href="/home/signals/chips"
                  isSelected={location.pathname === "/home/signals/chips"}
                />
                <SideNavItem
                  label="资金流向"
                  href="/home/signals/fundflow"
                  isSelected={location.pathname === "/home/signals/fundflow"}
                />
                <SideNavItem
                  label="热力图"
                  href="/home/signals/heatmap"
                  isSelected={location.pathname === "/home/signals/heatmap"}
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
      }
    >
      <LayoutContent padding={4} style={{ flex: 1, overflowY: "auto" }}>
        <Outlet />
      </LayoutContent>
    </Layout>
  );
}
