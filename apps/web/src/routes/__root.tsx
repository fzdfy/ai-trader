import { useState } from "react";
import {
  Link,
  Outlet,
  createRootRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { LinkProvider } from "@preline-ui/Link";
import {
  Bell,
  Bot,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Settings,
} from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { ProfileDialog } from "../components/ProfileDialog";
import { AppThemeMenu } from "../components/preline/AppThemeMenu";
import { PrelineInit } from "../components/preline/PrelineInit";
import { useAppTheme } from "../components/AppThemeProvider";
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

const TOP_NAV = [
  { label: "工作台", href: "/home", icon: LayoutDashboard },
  { label: "新闻", href: "/news", icon: Newspaper },
  { label: "问股", href: "/ai-chat", icon: Bot },
] as const;

function RootLayout() {
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const { preset } = useAppTheme();

  if (PUBLIC_PATHS.has(location.pathname)) {
    return (
      <LinkProvider component={Link}>
        <PrelineInit />
        <Outlet />
      </LinkProvider>
    );
  }

  return (
    <LinkProvider component={Link}>
      <PrelineInit />
      <div className="preline-app flex h-screen flex-col overflow-hidden">
        <header className="flex h-15 shrink-0 items-center gap-4 border-b border-app-line bg-app-panel px-4 md:px-6">
          <Link to="/home" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo color={preset.accent} size={30} />
            <span className="truncate text-[15px] font-semibold tracking-tight text-app-ink">
              Apollo Quant
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="全局导航">
            {TOP_NAV.map(({ label, href, icon: Icon }) => {
              const selected =
                href === "/home"
                  ? location.pathname.startsWith("/home")
                  : location.pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  to={href}
                  className={`focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
                    selected
                      ? "bg-app-surface font-medium text-app-ink"
                      : "text-app-muted hover:bg-app-surface hover:text-app-ink"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <AppThemeMenu />
            <button
              type="button"
              className="focus-ring relative grid size-9 place-items-center rounded-full border border-app-line bg-app-panel text-app-muted transition hover:border-app-line-strong hover:text-app-ink"
              aria-label="通知"
            >
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-app-panel" />
            </button>

            {session ? (
              <div className="hs-dropdown relative inline-flex">
                <button
                  type="button"
                  className="hs-dropdown-toggle focus-ring flex items-center gap-2 rounded-full border border-app-line bg-app-panel py-1 pl-1 pr-2.5 text-sm transition hover:border-app-line-strong"
                  aria-label="账户菜单"
                >
                  {session.user.image ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="size-7 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid size-7 place-items-center rounded-full bg-app-ink text-xs font-semibold text-app-panel">
                      {session.user.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="hidden max-w-24 truncate text-app-ink sm:block">
                    {session.user.name}
                  </span>
                  <ChevronDown className="size-3.5 text-app-muted" />
                </button>
                <div className="hs-dropdown-menu invisible absolute right-0 top-11 z-50 w-52 translate-y-1 rounded-xl border border-app-line bg-app-panel p-1.5 opacity-0 shadow-xl transition-[opacity,transform] duration-150 hs-dropdown-open:visible hs-dropdown-open:translate-y-0 hs-dropdown-open:opacity-100">
                  <div className="border-b border-app-line px-3 py-2">
                    <p className="truncate text-sm font-medium text-app-ink">{session.user.name}</p>
                    <p className="mt-0.5 truncate text-xs text-app-muted">{session.user.email}</p>
                  </div>
                  <button
                    type="button"
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-app-muted hover:bg-app-surface hover:text-app-ink"
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
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <Outlet />
        </div>

        {session ? (
          <ProfileDialog
            isOpen={profileOpen}
            onOpenChange={setProfileOpen}
            name={session.user.name}
            image={session.user.image}
          />
        ) : null}
      </div>
    </LinkProvider>
  );
}
