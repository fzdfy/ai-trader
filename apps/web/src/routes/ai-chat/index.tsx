import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChatPanel } from "./-private/ChatPanel";

export const Route = createFileRoute("/ai-chat/")({
  component: NewSessionPage,
});

function NewSessionPage() {
  const navigate = useNavigate();

  // 首次发送：先调用 createThread 获取 threadId，再跳转到历史会话路由
  const onFirstSend = useCallback(
    async (question: string) => {
      try {
        const res = await fetch("/api/v1/agents/threads", { method: "POST" });
        const json = await res.json();
        if (json.data?.threadId) {
          navigate({
            to: "/ai-chat/c/$threadId",
            params: { threadId: json.data.threadId },
            search: { q: question },
            replace: true,
          });
        }
      } catch {
        // 静默失败，ChatPanel 内部已有 error 处理
      }
    },
    [navigate],
  );

  return <ChatPanel threadId={null} onFirstSend={onFirstSend} />;
}
