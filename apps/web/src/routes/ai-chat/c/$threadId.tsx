import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../-private/ChatPanel";

export const Route = createFileRoute("/ai-chat/c/$threadId")({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ChatPanel threadId={threadId} initialQuestion={q as string | undefined} />;
}
