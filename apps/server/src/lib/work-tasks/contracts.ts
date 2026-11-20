import { z } from "zod";

export const WORK_TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "canceled",
] as const;
export const BOARD_STATUSES = ["pending", "in_progress", "completed"] as const;
export const WORK_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const WORK_TASK_CATEGORIES = [
  "research",
  "review",
  "screen",
  "strategy",
  "follow_up",
  "custom",
] as const;
export const WORK_TASK_SOURCE_TYPES = [
  "stock",
  "review",
  "screen",
  "workflow_run",
] as const;
export const WORK_TASK_VIEWS = ["today", "inbox", "future", "all"] as const;

export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];
export type WorkTaskCategory = (typeof WORK_TASK_CATEGORIES)[number];
export type WorkTaskSourceType = (typeof WORK_TASK_SOURCE_TYPES)[number];
export type WorkTaskView = (typeof WORK_TASK_VIEWS)[number];

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "无效的本地日期");

const timezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "无效的 IANA 时区");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const sourceShape = {
  sourceType: z.enum(WORK_TASK_SOURCE_TYPES).optional(),
  sourceId: z.string().trim().min(1).max(200).optional(),
};

function validateSource(
  value: { sourceType?: string; sourceId?: string },
  context: z.RefinementCtx,
) {
  if (Boolean(value.sourceType) !== Boolean(value.sourceId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "来源类型与来源 ID 必须同时提供",
      path: ["sourceId"],
    });
  }
}

export const workTaskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: optionalText(4000),
    category: z.enum(WORK_TASK_CATEGORIES).default("custom"),
    priority: z.enum(WORK_TASK_PRIORITIES).default("normal"),
    scheduledDate: localDateSchema.nullable().optional(),
    dueTime: timeSchema.nullable().optional(),
    blockedReason: optionalText(500),
    ...sourceShape,
  })
  .strict()
  .superRefine(validateSource);

export const workTaskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: optionalText(4000),
    category: z.enum(WORK_TASK_CATEGORIES).optional(),
    priority: z.enum(WORK_TASK_PRIORITIES).optional(),
    scheduledDate: localDateSchema.nullable().optional(),
    dueTime: timeSchema.nullable().optional(),
    blockedReason: optionalText(500),
    completionNote: optionalText(2000),
  })
  .strict();

export const workTaskListQuerySchema = z.object({
  view: z.enum(WORK_TASK_VIEWS).default("all"),
  localDate: localDateSchema,
  timezone: timezoneSchema,
  q: z.string().trim().max(100).optional(),
  category: z.enum(WORK_TASK_CATEGORIES).optional(),
  status: z.enum(WORK_TASK_STATUSES).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const workTaskSummaryQuerySchema = z.object({
  localDate: localDateSchema,
  timezone: timezoneSchema,
});

export const workTaskTransitionSchema = z
  .object({
    action: z.enum(["start", "complete", "reopen", "cancel", "restore"]),
    message: optionalText(500),
    completionNote: optionalText(2000),
  })
  .strict();

export const workTaskMoveSchema = z
  .object({
    targetStatus: z.enum(BOARD_STATUSES),
    beforeId: z.number().int().positive().optional(),
    afterId: z.number().int().positive().optional(),
  })
  .strict();

export const workTaskOrderResetSchema = z
  .object({
    status: z.enum(BOARD_STATUSES),
  })
  .strict();

export type CreateUserWorkTaskInput = z.infer<typeof workTaskCreateSchema>;
export type PatchUserWorkTaskInput = z.infer<typeof workTaskPatchSchema>;
export type ListUserWorkTasksInput = z.infer<typeof workTaskListQuerySchema> & {
  userId: string;
};
export type TransitionUserWorkTaskInput = z.infer<
  typeof workTaskTransitionSchema
>;
export type MoveUserWorkTaskInput = z.infer<typeof workTaskMoveSchema>;
