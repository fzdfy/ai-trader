import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, createRootRoute, redirect, useLocation } from "@tanstack/react-router";
import { LinkProvider } from "@preline-ui/Link";
import { Sparkles } from "lucide-react";
import { PrelineInit } from "../components/preline/PrelineInit";
import { authClient } from "../lib/auth-client";
import { getWorkbenchPageTitle } from "../lib/workbench-navigation";

const AssistantDrawer = lazy(() =>
  import("./ai-chat/-private/AssistantDrawer").then((module) => ({
    default: module.AssistantDrawer,
  })),
);

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
  const previousPathRef = useRef(location.pathname);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const [assistantThreadId, setAssistantThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      setAssistantOpen(false);
    }
  }, [location.pathname]);

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
      <div
        className={`preline-app app-shell h-screen overflow-hidden ${
          assistantOpen ? "assistant-open" : ""
        }`}
      >
        <div className="h-full min-h-0">
          <Outlet />
        </div>

        {session && assistantMounted ? (
          <Suspense fallback={null}>
            <AssistantDrawer
              isOpen={assistantOpen}
              onOpenChange={setAssistantOpen}
              pageTitle={getWorkbenchPageTitle(location.pathname)}
              threadId={assistantThreadId}
              onThreadChange={setAssistantThreadId}
            />
          </Suspense>
        ) : null}

        {session && !location.pathname.startsWith("/ai-chat") && !assistantOpen ? (
          <button
            id="assistant-fab"
            type="button"
            className="assistant-fab focus-ring"
            aria-label="打开 AI 研究助手"
            aria-controls="assistant-drawer"
            aria-expanded={assistantOpen}
            title="AI 研究助手"
            onClick={() => {
              setAssistantMounted(true);
              setAssistantOpen(true);
            }}
          >
            <Sparkles className="assistant-fab-icon" />
          </button>
        ) : null}
      </div>
    </LinkProvider>
  );
}
