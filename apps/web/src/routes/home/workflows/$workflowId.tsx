import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@preline-ui/Spinner";
import { useWorkflowQuery } from "../../../hooks/useWorkflows";
import { WorkflowEditor } from "./-private/WorkflowEditor";

export const Route = createFileRoute("/home/workflows/$workflowId")({
  component: WorkflowEditorPage,
});

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams();
  const id = Number(workflowId);
  const query = useWorkflowQuery(id);

  if (!Number.isInteger(id) || id <= 0) {
    return <WorkflowLoadError message="工作流地址不正确" />;
  }
  if (query.isLoading) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Spinner label="正在打开工作流…" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <WorkflowLoadError message={(query.error as Error | null)?.message ?? "工作流不存在"} />;
  }
  return <WorkflowEditor workflow={query.data} />;
}

function WorkflowLoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto grid min-h-[55vh] max-w-md place-items-center text-center">
      <div>
        <p className="text-sm font-medium text-app-ink">{message}</p>
        <Link
          to="/home/workflows"
          className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-app-line bg-app-panel px-3 py-2 text-sm text-app-muted hover:text-app-ink"
        >
          <ArrowLeft className="size-4" />
          返回工作流
        </Link>
      </div>
    </div>
  );
}
