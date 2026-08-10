import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  ChatComposer,
  ChatComposerInput,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
  ChatToolCalls,
} from "@astryxdesign/core/Chat";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Icon } from "@astryxdesign/core/Icon";

// ---- 类型 ----

type ToolStep = { tool: string; result: unknown };

type Message = {
  role: "user" | "ai";
  content: string;
  steps?: ToolStep[];
  error?: boolean;
};

type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

// ---- 工具 ----

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

// ---- API ----

async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch("/api/v1/ask/threads");
  const json = await res.json();
  return json.data?.threads ?? [];
}

async function fetchMessages(threadId: string): Promise<Message[]> {
  const res = await fetch(`/api/v1/ask/threads/${threadId}`);
  const json = await res.json();
  const raw: any[] = json.data?.messages ?? [];
  return raw.map((m: any) => {
    // MastraDBMessage.content 是 { format: 2, parts: [...], content?: string }
    const content = typeof m.content === "string" ? m.content : (m.content?.content ?? "");

    // toolInvocations 可能在 content 对象内或顶层
    const toolInvocations =
      (typeof m.content === "object" ? m.content.toolInvocations : null) ?? m.toolInvocations ?? [];

    return {
      role: m.role === "assistant" ? "ai" : ("user" as const),
      content,
      steps: toolInvocations.map((t: any) => ({
        tool: t.toolName ?? t.payload?.toolName ?? "",
        result: t.result ?? t.payload?.result ?? null,
      })),
    };
  });
}

async function deleteThread(threadId: string): Promise<void> {
  await fetch(`/api/v1/ask/threads/${threadId}`, { method: "DELETE" });
}

// ---- 映射 ----

const TOOL_NAME_MAP: Record<string, string> = {
  searchInstrument: "搜索标的",
  getQuote: "获取实时行情",
  getKline: "获取K线数据",
  getBoardRankings: "获取板块排行",
};

const SUGGESTIONS = [
  "今天白酒板块表现怎么样？",
  "分析一下贵州茅台最近的走势",
  "哪些行业板块涨幅靠前？",
  "新能源概念板块有哪些热门股？",
];

function summarizeResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result.slice(0, 80);
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("symbol" in r) return `标的: ${r.symbol}`;
    if ("boards" in r) return `${(r.boards as unknown[]).length} 个板块`;
    if ("bars" in r) return `${(r.bars as unknown[]).length} 根K线`;
    if ("results" in r) return `${(r.results as unknown[]).length} 条匹配`;
  }
  return "";
}

// ---- 页面组件 ----

export const Route = createFileRoute("/ai-chat")({
  component: AIAnalysisPage,
});

function AIAnalysisPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载 sessions 列表
  const loadThreads = useCallback(async () => {
    try {
      const t = await fetchThreads();
      setThreads(t);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // 加载指定 thread 的消息
  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const msgs = await fetchMessages(threadId);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId, loadMessages]);

  /** 新建会话 */
  const handleNew = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
  }, []);

  /** 删除会话 */
  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteThread(id);
      if (id === activeThreadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      await loadThreads();
    },
    [activeThreadId, loadThreads],
  );

  /** 发送消息 */
  const handleSubmit = useCallback(
    async (value: string) => {
      const question = value.trim();
      if (!question || loading) return;

      setLoading(true);

      // 乐观更新：立即显示用户消息
      setMessages((prev) => [...prev, { role: "user", content: question }]);

      try {
        const res = await fetch("/api/v1/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            threadId: activeThreadId ?? undefined,
          }),
        });
        const json: {
          success: boolean;
          data?: {
            answer: string;
            threadId: string;
            steps?: ToolStep[];
          };
          error?: string;
        } = await res.json();

        if (json.success && json.data) {
          // 新建会话时更新 threadId
          if (!activeThreadId) {
            setActiveThreadId(json.data.threadId);
          }

          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              content: json.data!.answer,
              steps: json.data!.steps,
            },
          ]);

          // 刷新 thread 列表（可能会有新 title）
          await loadThreads();
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              content: json.error ?? "分析服务异常，请稍后重试。",
              error: true,
            },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: "网络请求失败，请检查服务是否可用。",
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [activeThreadId, loading, loadThreads],
  );

  const handleSuggestion = useCallback((q: string) => handleSubmit(q), [handleSubmit]);

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
        {/* 新建会话按钮 */}
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
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
            }}
          >
            <span style={{ fontSize: "var(--font-size-lg)", lineHeight: 1 }}>+</span>
            新建会话
          </button>
        </div>

        {/* 会话列表 */}
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
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveThreadId(t.id)}
              style={{
                padding: "var(--spacing-2) var(--spacing-2)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                marginBottom: "var(--spacing-1)",
                background:
                  t.id === activeThreadId ? "var(--color-background-hover)" : "transparent",
                transition: "background 0.1s",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onMouseEnter={(e) => {
                if (t.id !== activeThreadId)
                  e.currentTarget.style.background = "var(--color-background-hover)";
              }}
              onMouseLeave={(e) => {
                if (t.id !== activeThreadId) e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: t.id === activeThreadId ? 500 : 400,
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
          ))}
        </div>
      </div>

      {/* ====== 聊天区域 ====== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-4) var(--spacing-4) 0" }}>
          {messages.length === 0 && !loading ? (
            <WelcomeEmptyState onSelect={handleSuggestion} />
          ) : (
            <ChatMessageList>
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <ChatMessage key={i} sender="user">
                    <ChatMessageBubble
                      metadata={
                        <ChatMessageMetadata
                          timestamp={<Timestamp value={Date.now()} format="time" />}
                        />
                      }
                    >
                      {msg.content}
                    </ChatMessageBubble>
                  </ChatMessage>
                ) : (
                  <ChatMessage
                    key={i}
                    sender="assistant"
                    avatar={<Avatar name="AI" size="small" />}
                  >
                    {msg.steps && msg.steps.length > 0 && (
                      <ChatToolCalls
                        defaultIsExpanded
                        calls={msg.steps.map((s) => ({
                          name: TOOL_NAME_MAP[s.tool] ?? s.tool,
                          target: summarizeResult(s.result),
                          status: "complete" as const,
                        }))}
                      />
                    )}
                    <ChatMessageBubble variant="ghost">
                      <Markdown density="compact">{msg.content}</Markdown>
                    </ChatMessageBubble>
                    <ChatMessageMetadata
                      timestamp={<Timestamp value={Date.now()} format="time" />}
                      footer={
                        <Text type="supporting" size="sm">
                          A股智能分析师
                        </Text>
                      }
                    />
                  </ChatMessage>
                ),
              )}

              {loading && (
                <ChatMessage sender="assistant" avatar={<Avatar name="AI" size="small" />}>
                  <ChatMessageBubble variant="ghost">
                    <HStack gap={2} align="center">
                      <Spinner size="sm" />
                      <Text type="supporting" size="sm">
                        正在分析...
                      </Text>
                    </HStack>
                  </ChatMessageBubble>
                </ChatMessage>
              )}
            </ChatMessageList>
          )}
        </div>

        <div
          style={{
            padding: "var(--spacing-3) var(--spacing-4)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <ChatComposer
            onSubmit={handleSubmit}
            isDisabled={loading}
            placeholder="输入股票代码或问题，如「分析茅台最近走势」"
            input={<ChatComposerInput />}
          />
        </div>
      </div>
    </div>
  );
}

// ---- 欢迎空态 ----

function WelcomeEmptyState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <VStack gap={4} align="center" style={{ padding: "var(--spacing-10) var(--spacing-4)" }}>
      <Icon icon="info" size="lg" style={{ color: "var(--color-text-secondary)" }} />
      <VStack gap={1} align="center">
        <Text weight="semibold">开始问股</Text>
        <Text type="supporting" size="sm">
          试试下面这些问题，开启你的智能分析之旅
        </Text>
      </VStack>
      <HStack gap={2} wrap="wrap" justify="center">
        {SUGGESTIONS.map((q) => (
          <Button key={q} label={q} variant="ghost" size="sm" onClick={() => onSelect(q)} />
        ))}
      </HStack>
    </VStack>
  );
}
