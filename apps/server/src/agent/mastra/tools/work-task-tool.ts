import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const draftInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(""),
  category: z
    .enum(["research", "review", "screen", "strategy", "follow_up", "custom"])
    .default("custom"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  sourceType: z
    .enum(["stock", "review", "screen", "workflow_run"])
    .optional(),
  sourceId: z.string().trim().min(1).max(200).optional(),
});

const draftOutputSchema = z.object({
  draftType: z.literal("work-task"),
  title: z.string(),
  description: z.string(),
  category: z.enum([
    "research",
    "review",
    "screen",
    "strategy",
    "follow_up",
    "custom",
  ]),
  priority: z.enum(["low", "normal", "high"]),
  scheduledDate: z.string().nullable(),
  dueTime: z.string().nullable(),
  sourceType: z
    .enum(["stock", "review", "screen", "workflow_run"])
    .nullable(),
  sourceId: z.string().nullable(),
});

export type WorkTaskDraft = z.infer<typeof draftOutputSchema>;

export function buildWorkTaskDraft(
  input: z.infer<typeof draftInputSchema>,
): WorkTaskDraft {
  if (Boolean(input.sourceType) !== Boolean(input.sourceId)) {
    throw new Error("来源类型与来源 ID 必须同时提供");
  }
  return {
    draftType: "work-task",
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    scheduledDate: input.scheduledDate ?? null,
    dueTime: input.dueTime ?? null,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
  };
}

export const proposeWorkTaskTool = createTool({
  id: "proposeWorkTask",
  description:
    "生成一条个人工作任务草稿。它只返回表单字段，不创建、完成、取消、排序或修改任何任务；用户必须打开任务面板并点击创建。需要改变任务状态时不要调用此工具。",
  inputSchema: draftInputSchema,
  outputSchema: draftOutputSchema,
  execute: async (input) => buildWorkTaskDraft(input),
});
