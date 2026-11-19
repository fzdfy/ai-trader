import { MANUAL_SYNC_JOBS } from "../workers/sync-worker/runner";

export type RetryValidation =
  | { allowed: true }
  | { allowed: false; reason: string; status: 400 | 404 | 409 };

export function getSyncDependency(jobType: string): string | null {
  return MANUAL_SYNC_JOBS.find((job) => job.name === jobType)?.dependsOn ?? null;
}

export function validateRetryCandidate(
  jobType: string,
  latestJob: { status: string } | null,
  activeJobs: readonly string[],
  dependencyStatus: string | null = null,
): RetryValidation {
  const definition = MANUAL_SYNC_JOBS.find((job) => job.name === jobType);
  if (!definition) {
    return { allowed: false, reason: "未登记的同步模块", status: 404 };
  }
  if (activeJobs.length > 0) {
    return {
      allowed: false,
      reason: "已有同步任务运行中，请稍候",
      status: 409,
    };
  }
  if (!latestJob || latestJob.status !== "failed") {
    return {
      allowed: false,
      reason: "仅失败模块可以重试",
      status: 400,
    };
  }
  if (definition.dependsOn && dependencyStatus !== "success") {
    return {
      allowed: false,
      reason: `依赖模块 ${definition.dependsOn} 尚未成功`,
      status: 409,
    };
  }
  return { allowed: true };
}
