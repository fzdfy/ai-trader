import { createLogger } from "../../lib/logger";
import { getLogContext } from "../../lib/request-context";
import { runQualityChecks } from "../../lib/data-governance/quality-runner";
import { QUALITY_RULES } from "../../lib/data-governance/quality-rules";
import {
  compareSourceStandard,
  fetchLatestSourceStandardSnapshot,
  type SourceStandardSnapshot,
} from "../../lib/data-governance/source-standard-monitor";
import { getSourceStandardReference } from "../../lib/data-governance/source-standards";
import { ensureSourceStandardReviewTask } from "../../lib/data-governance/work-tasks";

const log = createLogger("governance-job");

export async function runGovernanceQualityScan(): Promise<void> {
  const context = getLogContext();
  const assetKeys = [
    ...new Set(QUALITY_RULES.map((rule) => rule.assetKey)),
  ];
  const summary = await runQualityChecks({
    assetKeys,
    jobRunId: context?.jobRunId ? Number(context.jobRunId) : null,
    requestId: context?.requestId ?? null,
  });
  log.info(
    {
      assets: assetKeys.length,
      results: summary.results.length,
      incidents: summary.incidentIds.length,
    },
    "governance quality scan completed",
  );
}

export async function runSourceStandardWatch(
  loadSnapshot: () => Promise<SourceStandardSnapshot> = () =>
    fetchLatestSourceStandardSnapshot(),
): Promise<"unchanged" | "changed" | "unavailable"> {
  try {
    const reference = getSourceStandardReference("a-stock-data");
    const snapshot = await loadSnapshot();
    const comparison = compareSourceStandard(reference, snapshot);
    if (comparison === "unchanged") {
      log.info(
        { source_standard: reference.id, commit: reference.commitSha },
        "source standard unchanged",
      );
      return "unchanged";
    }
    const taskId = await ensureSourceStandardReviewTask({
      commitSha: snapshot.commitSha,
      versionLabel: snapshot.versionLabel,
      previousCommitSha: reference.commitSha,
      skillFileSha256: snapshot.skillFileSha256,
      snapshotPath: `docs/external/a-stock-data/${snapshot.commitSha}`,
      detectedAt: snapshot.fetchedAt,
      capabilities: reference.capabilities,
    });
    log.warn(
      {
        source_standard: reference.id,
        previous_commit: reference.commitSha,
        latest_commit: snapshot.commitSha,
        task_id: taskId,
      },
      "source standard changed; review task ready",
    );
    return "changed";
  } catch (error) {
    log.error(
      { err: error, source_standard: "a-stock-data" },
      "source standard unavailable",
    );
    return "unavailable";
  }
}

export async function runSourceStandardWatchJob(): Promise<void> {
  const result = await runSourceStandardWatch();
  if (result === "unavailable") {
    throw new Error("a-stock-data source standard is unavailable");
  }
}
