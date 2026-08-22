import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * /home/reviews 的布局路由。
 * 仅作为 today（今日复盘）/ history（历史复盘）子路由的容器，实际内容在各子路由中。
 */
export const Route = createFileRoute("/home/reviews")({
  component: ReviewsLayout,
});

function ReviewsLayout() {
  return <Outlet />;
}
