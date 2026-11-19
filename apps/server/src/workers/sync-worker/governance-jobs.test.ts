import assert from "node:assert/strict";
import test from "node:test";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { jobRun } from "../../db/schema";
import { CRON_JOBS } from "./cron-config";
import {
  runGovernanceQualityScan,
  runSourceStandardWatch,
} from "./governance-jobs";
import { wrapJob } from "./runner";
import { getSourceStandardReference } from "../../lib/data-governance/source-standards";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test("governance quality scan is registered with a bounded schedule", () => {
  const job = CRON_JOBS.find(
    (candidate) => candidate.name === "governance-quality-scan",
  );
  assert.equal(job?.enabled, true);
  assert.equal(job?.cron, "30 18 * * 1-5");
  assert.equal(job?.marketCloseOnly, true);
});

test("source standard watch is registered daily", () => {
  const job = CRON_JOBS.find(
    (candidate) => candidate.name === "source-standard-watch",
  );
  assert.equal(job?.enabled, true);
  assert.equal(job?.cron, "0 3 * * *");
  assert.equal(job?.marketCloseOnly, undefined);
});

test("source standard watch classifies upstream failures", async () => {
  const result = await runSourceStandardWatch(async () => {
    throw new Error("offline");
  });
  assert.equal(result, "unavailable");
});

test("source standard watch records unchanged baseline", async () => {
  const reference = getSourceStandardReference("a-stock-data");
  const result = await runSourceStandardWatch(async () => ({
    commitSha: reference.commitSha,
    versionLabel: reference.versionLabel,
    skillFileSha256: reference.skillFileSha256,
    fetchedAt: "2026-11-19T00:00:00.000Z",
  }));
  assert.equal(result, "unchanged");
});

test(
  "governance quality scan records job_run evidence",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const ok = await wrapJob(
      "governance-quality-scan",
      runGovernanceQualityScan,
    )();
    assert.equal(ok, true);
    const [latest] = await db
      .select()
      .from(jobRun)
      .where(eq(jobRun.jobType, "governance-quality-scan"))
      .orderBy(desc(jobRun.id))
      .limit(1);
    assert.equal(latest?.status, "success");
    assert.ok((latest?.id ?? 0) > 0);
  },
);
