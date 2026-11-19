import { createFileRoute } from "@tanstack/react-router";
import { DataTableList } from "../../-private/DataTableList";

export const Route = createFileRoute("/home/data-management/tables/")({
  component: TablesPage,
});

function TablesPage() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-app-ink">数据表目录</h2>
        <p className="mt-1 text-xs text-app-muted">
          查看表结构、来源、同步策略、降级链与最近任务。
        </p>
      </div>
      <DataTableList />
    </div>
  );
}
