import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../-private/ChatPanel";

export const Route = createFileRoute("/ai-chat/c/$threadId")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ThreadSessionPage,
});

function ThreadSessionPage() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();

  // 清除 URL 中的 q 参数（首次处理后）
  useEffect(() => {
    if (q) {
      navigate({
        to: "/ai-chat/c/$threadId",
        params: { threadId },
        search: {} as any,
        replace: true,
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ChatPanel threadId={threadId} initialQuestion={q as string | undefined} />;
}
