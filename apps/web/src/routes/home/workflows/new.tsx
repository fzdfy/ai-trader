import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Spinner } from "@preline-ui/Spinner";
import { Button } from "@preline-ui/Button";
import { useCreateWorkflow } from "../../../hooks/useWorkflows";

export const Route = createFileRoute("/home/workflows/new")({
  component: NewWorkflowPage,
});

function NewWorkflowPage() {
  const navigate = useNavigate();
  const createWorkflow = useCreateWorkflow();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void createWorkflow
      .mutateAsync({ name: "未命名工作流" })
      .then((workflow) =>
        navigate({
          to: "/home/workflows/$workflowId",
          params: { workflowId: String(workflow.id) },
          replace: true,
        }),
      )
      .catch((reason: unknown) => {
        setError((reason as Error).message);
      });
  }, [createWorkflow, navigate]);

  return (
    <div className="mx-auto grid min-h-[55vh] max-w-xl place-items-center text-center">
      <div>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>
              重新创建
            </Button>
          </>
        ) : (
          <>
            <Spinner size="sm" className="justify-center" />
            <p className="mt-3 text-sm text-app-muted">正在准备空白画布…</p>
          </>
        )}
      </div>
    </div>
  );
}
