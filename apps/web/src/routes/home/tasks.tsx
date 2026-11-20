import { createFileRoute } from "@tanstack/react-router";
import type { CreateWorkTaskInput } from "../../hooks/useWorkTasks";
import {
  WORK_TASK_SOURCE_TYPES,
  WORK_TASK_VIEWS,
  type WorkTaskSourceType,
  type WorkTaskView,
} from "../../lib/work-tasks";
import { WorkTaskPage } from "./-private/WorkTaskPage";

export const Route = createFileRoute("/home/tasks")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    view?: WorkTaskView;
    task?: number;
    sourceType?: WorkTaskSourceType;
    sourceId?: string;
    draft?: Partial<CreateWorkTaskInput>;
  } => ({
    view:
      typeof search.view === "string" &&
      WORK_TASK_VIEWS.includes(search.view as WorkTaskView)
        ? (search.view as WorkTaskView)
        : undefined,
    task:
      Number.isInteger(Number(search.task)) && Number(search.task) > 0
        ? Number(search.task)
        : undefined,
    sourceType:
      typeof search.sourceType === "string" &&
      WORK_TASK_SOURCE_TYPES.includes(
        search.sourceType as WorkTaskSourceType,
      )
        ? (search.sourceType as WorkTaskSourceType)
        : undefined,
    sourceId:
      typeof search.sourceId === "string" && search.sourceId.trim()
        ? search.sourceId.trim()
        : undefined,
    draft:
      typeof search.draft === "object" && search.draft !== null
        ? (search.draft as Partial<CreateWorkTaskInput>)
        : undefined,
  }),
  component: TasksPage,
});

function TasksPage() {
  const search = Route.useSearch();
  return (
    <WorkTaskPage
      initialView={search.view ?? "today"}
      initialTaskId={search.task}
      initialSourceType={search.sourceType}
      initialSourceId={search.sourceId}
      initialDraft={search.draft}
    />
  );
}
