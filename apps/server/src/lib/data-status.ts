import { and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { jobRun } from "../db/schema";

export type PublicDataStatus = {
  updatedAt: string | null;
  availability: "online" | "syncing" | "unavailable";
  running: boolean;
};

export function buildPublicDataStatus(input: {
  updatedAt: string | null;
  runningJobs: readonly string[];
}): PublicDataStatus {
  const running = input.runningJobs.length > 0;
  return {
    updatedAt: input.updatedAt,
    availability: running
      ? "syncing"
      : input.updatedAt
        ? "online"
        : "unavailable",
    running,
  };
}

export async function loadPublicDataStatus(): Promise<PublicDataStatus> {
  const updated = await db.execute(
    sql`SELECT MAX(updated_at) AS updated_at FROM board`,
  );
  const value = updated.rows[0]?.updated_at as Date | string | null | undefined;
  const date = value == null ? null : new Date(value);
  const updatedAt =
    date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

  const runningJobs = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(isNotNull(jobRun.startedAt), isNull(jobRun.finishedAt)));

  return buildPublicDataStatus({
    updatedAt,
    runningJobs: runningJobs.map((job) => job.jobType),
  });
}
