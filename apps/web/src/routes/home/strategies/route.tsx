import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * /home/strategies 的布局路由。
 * 仅作为 create/edit/$strategyId 等子路由的容器，实际列表内容在 index.tsx 中。
 */
export const Route = createFileRoute("/home/strategies")({
  component: StrategiesLayout,
});

function StrategiesLayout() {
  return <Outlet />;
}
