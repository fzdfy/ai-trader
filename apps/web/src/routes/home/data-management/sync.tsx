import { createFileRoute } from "@tanstack/react-router";
import { SyncCenterTab } from "../-private/SyncCenterTab";

export const Route = createFileRoute("/home/data-management/sync")({
  component: SyncPage,
});

function SyncPage() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-app-ink">数据同步</h2>
        <p className="mt-1 text-xs text-app-muted">
          查看模块依赖、运行进度和失败记录；一期仅开放手动同步与失败模块重试。
        </p>
      </div>
      <SyncCenterTab />
    </div>
  );
}
