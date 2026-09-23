import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * /home/data-center 的布局路由。
 * 仅作为列表 / 详情子路由的容器，实际内容在 index.tsx 与 $table.tsx 中。
 */
export const Route = createFileRoute("/home/data-center")({
  component: DataCenterLayout,
});

function DataCenterLayout() {
  return <Outlet />;
}
