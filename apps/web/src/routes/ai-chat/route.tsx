import { Outlet, createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useState, useEffect } from "react";
import { Text } from "@astryxdesign/core/Text";

type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

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

async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch("/api/v1/agents/threads");
  const json = await res.json();
  return json.data?.threads ?? [];
}

async function deleteThread(threadId: string): Promise<void> {
  await fetch(`/api/v1/agents/threads/${threadId}`, { method: "DELETE" });
}

export const Route = createFileRoute("/ai-chat")({
  component: AIChatLayout,
});

function AIChatLayout() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await fetchThreads());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const handleNew = useCallback(() => {
    navigate({ to: "/ai-chat" });
  }, [navigate]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      await deleteThread(id);
      if (location.pathname === `/ai-chat/c/${id}`) {
        navigate({ to: "/ai-chat" });
      }
      await loadThreads();
    },
    [location.pathname, navigate, loadThreads],
  );

  return (
    <div style={{ height: "100%", display: "flex" }}>
      {/* ====== 侧边栏 ====== */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-background)",
        }}
      >
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

        <div style={{ flex: 1, overflowY: "auto", padding: "0 var(--spacing-2)" }}>
          {threads.length === 0 && (
            <Text type="supporting" size="sm" style={{ padding: "var(--spacing-4) var(--spacing-2)" }}>
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
                style={{ textDecoration: "none", display: "block" }}
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
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-supporting)", marginTop: 2 }}>
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

      {/* ====== 子路由内容区 ====== */}
      <Outlet />
    </div>
  );
}
