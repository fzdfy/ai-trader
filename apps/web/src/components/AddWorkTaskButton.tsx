import { useNavigate } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { Button } from "@preline-ui/Button";
import type { WorkTaskSourceType } from "../lib/work-tasks";

export function AddWorkTaskButton({
  sourceType,
  sourceId,
  label = "加入工作任务",
  variant = "secondary",
}: {
  sourceType: WorkTaskSourceType;
  sourceId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const navigate = useNavigate();
  return (
    <Button
      label={label}
      icon={<ListChecks className="size-3.5" />}
      variant={variant}
      isDisabled={!sourceId.trim()}
      onClick={() => {
        void navigate({
          to: "/home/tasks",
          search: { sourceType, sourceId },
        });
      }}
    />
  );
}
