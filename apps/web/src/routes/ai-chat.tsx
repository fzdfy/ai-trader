import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  ChatLayout,
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

// ---- 映射 ----

const TOOL_NAME_MAP: Record<string, string> = {
  searchInstrument: "searchInstrument",
  getQuote: "getQuote",
  getKline: "getKline",
  getBoardRankings: "getBoardRankings",
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (value: string) => {
      const question = value.trim();
      if (!question || loading) return;

      setInputValue("");
      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setLoading(true);

      try {
        const res = await fetch("/api/v1/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const json: {
          success: boolean;
          data?: { answer: string; steps?: ToolStep[] };
          error?: string;
        } = await res.json();

        if (json.success && json.data) {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: json.data!.answer, steps: json.data!.steps },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: json.error ?? "分析服务异常，请稍后重试。", error: true },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "网络请求失败，请检查服务是否可用。", error: true },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const handleSuggestion = useCallback((q: string) => {
    handleSubmit(q);
  }, [handleSubmit]);

  return (
    <div style={{ height: "calc(100vh - var(--spacing-12))", maxWidth: 800, margin: "0 auto" }}>
      <ChatLayout
        density="spacious"
        emptyState={<WelcomeEmptyState onSelect={handleSuggestion} />}
        composer={
          <ChatComposer
            onSubmit={handleSubmit}
            isDisabled={loading}
            placeholder="输入股票代码或问题，如「分析茅台最近走势」"
            input={<ChatComposerInput />}
          />
        }
      >
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
              <ChatMessage key={i} sender="assistant" avatar={<Avatar name="AI" size="small" />}>
                {/* 工具调用步骤 */}
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

                {/* AI 回答内容 */}
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

          {/* 加载中 */}
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
      </ChatLayout>
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
