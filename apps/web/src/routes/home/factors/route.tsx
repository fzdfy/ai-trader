import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * /home/factors 的布局路由。
 * 仅作为 index / $factorName 等子路由的容器，实际列表内容在 index.tsx 中。
 */
export const Route = createFileRoute("/home/factors")({
  component: FactorsLayout,
});

function FactorsLayout() {
  return <Outlet />;
}
