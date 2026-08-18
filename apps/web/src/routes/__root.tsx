import { useState } from "react";
import { Outlet, createRootRoute, useLocation, redirect, Link } from "@tanstack/react-router";
import { TopNav, TopNavItem } from "@astryxdesign/core/TopNav";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Avatar } from "@astryxdesign/core/Avatar";
import { ProfileDialog } from "../components/ProfileDialog";
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
      throw redirect({ to: "/home" });
    }
  },
  component: RootLayout,
});

function RootLayout() {
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const [profileOpen, setProfileOpen] = useState(false);

  // 公开页面（登录/注册）不展示导航
  if (PUBLIC_PATHS.has(location.pathname)) {
    return <Outlet />;
  }

  // 当前选中的顶级导航
  const isHome = location.pathname.startsWith("/home");
  const isNews = location.pathname.startsWith("/news");
  const isAIChat = location.pathname.startsWith("/ai-chat");

  return (
    <VStack gap={0} style={{ height: "100vh" }}>
      {/* 顶部导航栏 */}
      <TopNav
        heading={
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
            }}
          >
            <NavIcon icon={<Icon icon="viewColumns" size="sm" />} />
            <Text weight="semibold">AI Trader</Text>
          </Link>
        }
        startContent={null}
        centerContent={
          <>
            <TopNavItem label="首页" href="/home" isSelected={isHome} />
            <TopNavItem label="新闻" href="/news" isSelected={isNews} />
            <TopNavItem label="问股" href="/ai-chat" isSelected={isAIChat} />
          </>
        }
        endContent={
          session ? (
            <HStack gap={2} align="center">
              <Avatar
                src={session.user.image ?? undefined}
                name={session.user.name}
                size={24}
              />
              <Text size="sm" maxLines={1}>
                {session.user.name}
              </Text>
              <Button
                label="编辑资料"
                variant="ghost"
                size="sm"
                onClick={() => setProfileOpen(true)}
              />
              <Button
                label="退出"
                variant="ghost"
                size="sm"
                onClick={() => {
                  authClient.signOut().then(() => {
                    globalThis.location.href = "/login";
                  });
                }}
              />
              <ProfileDialog
                isOpen={profileOpen}
                onOpenChange={setProfileOpen}
                name={session.user.name}
                image={session.user.image}
              />
            </HStack>
          ) : undefined
        }
      />

      {/* 页面内容 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Outlet />
      </div>
    </VStack>
  );
}
