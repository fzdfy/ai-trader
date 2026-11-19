import { Outlet, createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useState, useEffect, useRef } from "react";
import { Text } from "@preline-ui/Text";
import { X } from "lucide-react";
import { PageNavigation } from "../../components/PageNavigation";
import {
  deleteAssistantThread,
  fetchAssistantThreads,
  type AssistantThread,
} from "../../lib/assistant";

function fmtTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  try {
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/ai-chat")({
  component: AIChatLayout,
});

function AIChatLayout() {
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await fetchAssistantThreads());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      historyButtonRef.current?.focus();
    };
  }, [mobileSidebarOpen]);

  const handleNew = useCallback(() => {
    setMobileSidebarOpen(false);
    navigate({ to: "/ai-chat" });
  }, [navigate]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        setHistoryError("");
        await deleteAssistantThread(id);
      } catch (reason) {
        setHistoryError(reason instanceof Error ? reason.message : "删除会话失败");
        return;
      }
      if (location.pathname === `/ai-chat/c/${id}`) {
        navigate({ to: "/ai-chat" });
      }
      await loadThreads();
    },
    [location.pathname, navigate, loadThreads],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageNavigation
        mobileHistoryButtonRef={historyButtonRef}
        onOpenMobileHistory={() => setMobileSidebarOpen(true)}
      />
      <div className="relative flex min-h-0 flex-1">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-app-ink/20 backdrop-blur-sm lg:hidden"
            aria-label="关闭会话历史"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <div
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-app-line bg-app-panel transition-transform lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
            mobileSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full max-lg:invisible max-lg:pointer-events-none"
          }`}
        >
          <div className="flex items-center justify-between border-b border-app-line px-3 py-2 lg:hidden">
            <span className="text-sm font-semibold text-app-ink">会话历史</span>
            <button
              ref={closeButtonRef}
              type="button"
              className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
              aria-label="关闭会话历史"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <div style={{ padding: "var(--spacing-3)" }}>
            <button
              onClick={handleNew}
              style={{
                width: "100%",
                padding: "var(--spacing-2) var(--spacing-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-background)",
                color: "var(--color-text)",
                cursor: "pointer",
                fontSize: "var(--font-size-sm)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
                transition: "border-color 0.15s",
              }}
            >
              <span style={{ fontSize: "var(--font-size-lg)", lineHeight: 1 }}>+</span>
              新建会话
            </button>
          </div>

          {historyError ? (
            <p className="mx-2 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {historyError}
            </p>
          ) : null}

          <div style={{ flex: 1, overflowY: "auto", padding: "0 var(--spacing-2)" }}>
            {threads.length === 0 && (
              <Text
                type="supporting"
                size="sm"
                style={{ padding: "var(--spacing-4) var(--spacing-2)" }}
              >
                暂无历史会话
              </Text>
            )}
            {threads.map((t) => {
              const href = `/ai-chat/c/${t.id}`;
              const isActive = location.pathname === href;
              return (
                <Link
                  key={t.id}
                  to="/ai-chat/c/$threadId"
                  params={{ threadId: t.id }}
                  search={{}}
                  style={{ textDecoration: "none", display: "block" }}
                  onClick={() => setMobileSidebarOpen(false)}
                >
                  <div
                    style={{
                      padding: "var(--spacing-2) var(--spacing-2)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      marginBottom: "var(--spacing-1)",
                      background: isActive ? "var(--color-background-hover)" : "transparent",
                      transition: "background 0.1s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "var(--font-size-sm)",
                          fontWeight: isActive ? 500 : 400,
                          color: "var(--color-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.4,
                        }}
                      >
                        {t.title || "新会话"}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-text-supporting)",
                          marginTop: 2,
                        }}
                      >
                        {fmtTime(t.updatedAt || t.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(t.id, e)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        padding: "2px 4px",
                        color: "var(--color-text-supporting)",
                        opacity: 0.5,
                        fontSize: "var(--font-size-xs)",
                        flexShrink: 0,
                      }}
                      title="删除会话"
                    >
                      ✕
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
