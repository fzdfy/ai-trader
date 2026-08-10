import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
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

export type ToolStep = { tool: string; result: unknown };

export type Message = {
  role: "user" | "ai";
  content: string;
  steps?: ToolStep[];
  error?: boolean;
};

// ---- API ----

/** 从 Mastra Memory 加载历史消息 */
export async function fetchMessages(threadId: string): Promise<Message[]> {
  const res = await fetch(`/api/v1/agents/threads/${threadId}`);
  const json = await res.json();
  const raw: any[] = json.data?.messages ?? [];
  return raw.map((m: any) => {
    const content = typeof m.content === "string" ? m.content : (m.content?.content ?? "");

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

/** 将 AI SDK UIMessage 转为本地 Message 格式 */
function uiMessageToMessage(m: UIMessage): Message {
  const textContent = m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as any).text)
    .join("");

  const toolParts = m.parts.filter((p) => p.type.startsWith("tool-"));

  return {
    role: m.role === "assistant" ? "ai" : "user",
    content: textContent,
    steps: toolParts.map((p) => ({
      tool: (p as any).toolName ?? p.type.replace("tool-", ""),
      result: (p as any).state === "result" ? (p as any).result : null,
    })),
  };
}

// ---- 映射 ----

const TOOL_NAME_MAP: Record<string, string> = {
  instrumentTool: "搜索标的",
  quoteTool: "获取实时行情",
  klineTool: "获取K线数据",
  boardTool: "获取板块排行",
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

// ---- ChatPanel ----

/**
 * ChatPanel — 聊天区域共享组件。
 *
 * @param threadId   - 历史会话的 threadId，为 null 表示新建会话
 * @param initialQuestion - 跨路由传递的首条问题，自动通过 useChat 发送
 * @param onFirstSend - threadId 为 null 时用户点击发送的回调，执行 createThread 后跳转 */
export function ChatPanel({
  threadId,
  initialQuestion,
  onFirstSend,
}: {
  threadId: string | null;
  initialQuestion?: string;
  onFirstSend?: (question: string) => void;
}) {
  // 历史消息（从 Mastra Memory GET 端点加载）
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const initialSentRef = useRef<string | null>(null);

  // AI SDK useChat — 流式对话（仅 threadId 存在时使用）
  const {
    messages: uiMessages,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/v1/agents/chat/stream",
      // 只发送最后一条消息，Mastra Memory 服务端管理上下文
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            messages: [messages.at(-1)],
            memory: { thread: threadId ?? "", resource: "default-user" },
          },
        };
      },
    }),
    id: threadId ?? undefined,
  });

  // 加载历史消息
  useEffect(() => {
    if (threadId) {
      fetchMessages(threadId)
        .then(setHistoryMessages)
        .catch(() => setHistoryMessages([]));
    } else {
      setHistoryMessages([]);
    }
  }, [threadId]);

  // 自动发送 initialQuestion（跨路由传递的首条问题，通过 useChat 流式发送）
  useEffect(() => {
    if (initialQuestion && threadId && initialSentRef.current !== initialQuestion && sendMessage) {
      initialSentRef.current = initialQuestion;
      const raf = requestAnimationFrame(() => {
        sendMessage({ text: initialQuestion });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [initialQuestion, threadId, sendMessage]);

  // 将 UIMessage 数组转为本地 Message 数组（跳过空内容的消息）
  const streamMessages = useMemo(
    () =>
      uiMessages
        .map(uiMessageToMessage)
        .filter((m) => m.content || (m.steps && m.steps.length > 0)),
    [uiMessages],
  );

  // 合并历史 + 流式消息
  const allMessages = useMemo(
    () => [...historyMessages, ...streamMessages],
    [historyMessages, streamMessages],
  );

  const isStreaming = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    (value: string) => {
      const question = value.trim();
      if (!question || isStreaming) return;

      // 新建会话：回调跳转
      if (!threadId) {
        onFirstSend?.(question);
        return;
      }

      // 已有会话：流式发送
      sendMessage({ text: question });
    },
    [threadId, isStreaming, onFirstSend, sendMessage],
  );

  const handleSuggestion = useCallback((q: string) => handleSubmit(q), [handleSubmit]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-4) var(--spacing-4) 0" }}>
        {allMessages.length === 0 && !isStreaming ? (
          <WelcomeEmptyState onSelect={handleSuggestion} />
        ) : (
          <ChatMessageList>
            {allMessages.map((msg, i) =>
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
                <ChatMessage key={i} sender="assistant" avatar={<Avatar name="AI" size="small" />}>
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

            {isStreaming && streamMessages.length === 0 && (
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
          isDisabled={isStreaming}
          placeholder="输入股票代码或问题，如「分析茅台最近走势」"
          input={<ChatComposerInput />}
        />
      </div>
    </div>
  );
}

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
