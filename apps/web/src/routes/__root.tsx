import { Outlet, createRootRoute, useLocation, redirect } from "@tanstack/react-router";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { authClient } from "../lib/auth-client";

const PUBLIC_PATHS = new Set(["/login", "/signup"]);

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const isPublic = PUBLIC_PATHS.has(location.pathname);

    if (!session && !isPublic) {
      throw redirect({ to: "/login" });
    }
    if (session && isPublic) {
      throw redirect({ to: "/market" });
    }
  },
  component: RootLayout,
});

function RootLayout() {
  const location = useLocation();
  const { data: session } = authClient.useSession();

  if (PUBLIC_PATHS.has(location.pathname)) {
    return <Outlet />;
  }

  return (
    <AppShell
      contentPadding={0}
      sideNav={
        <SideNav
          style={{ width: 200 }}
          header={
            <SideNavHeading
              heading="AI Trader"
              icon={<NavIcon icon={<Icon icon="viewColumns" size="sm" />} />}
            />
          }
          footer={
            session ? (
              <SideNavSection title="账户" isHeaderHidden>
                <VStack gap={1} style={{ padding: "var(--spacing-2)" }}>
                  <Text type="supporting" maxLines={1}>
                    {session.user.email}
                  </Text>
                  <Button
                    label="退出登录"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      authClient.signOut().then(() => {
                        globalThis.location.href = "/login";
                      });
                    }}
                  />
                </VStack>
              </SideNavSection>
            ) : undefined
          }
        >
          <SideNavSection title="导航">
            <SideNavItem label="行情" icon="viewColumns" href="/market" />
            <SideNavItem label="自选" icon="search" href="/watchlist" />
            <SideNavItem label="回测" icon="viewColumns" href="/backtest" />
            <SideNavItem label="问股" icon="info" href="/ai-chat" />
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout height="fill">
        <LayoutContent padding={6}>
          <Outlet />
        </LayoutContent>
      </Layout>
    </AppShell>
  );
}
