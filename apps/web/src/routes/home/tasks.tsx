import { createFileRoute } from "@tanstack/react-router";
import { UnderConstructionPage } from "../../components/UnderConstructionPage";

export const Route = createFileRoute("/home/tasks")({
  component: TasksPage,
});

function TasksPage() {
  return (
    <UnderConstructionPage
      title="工作任务"
      description="集中管理人工待办、任务状态和今日执行安排。"
    />
  );
}
