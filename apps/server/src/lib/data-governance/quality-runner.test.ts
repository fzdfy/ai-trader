import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { dataIncident, dataQualityResult } from "../../db/schema";
import {
  loadLatestQualityResults,
  runQualityChecks,
  type QualityRuleExecutor,
} from "./quality-runner.ts";
import { QUALITY_RULES } from "./quality-rules.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

function rulesForAsset(assetKey: string) {
  return QUALITY_RULES.filter((rule) => rule.assetKey === "bar1d_raw").map(
    (rule) => ({ ...rule, assetKey }),
  );
}

test(
  "quality runner persists evidence with rule version and request context",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const assetKey = `quality-pass-${crypto.randomUUID()}`;
    const passed: QualityRuleExecutor = async (rule) => ({
      ruleId: rule.id,
      status: "passed",
      severity: rule.severity,
      observedValue: 1,
      details: { fixture: true },
    });
    try {
      const summary = await runQualityChecks(
        {
          assetKeys: [assetKey],
          rules: rulesForAsset(assetKey),
          requestId: `request-${assetKey}`,
        },
        passed,
      );
      assert.ok(summary.results.length > 0);
      const rows = await loadLatestQualityResults([assetKey]);
      assert.equal(rows.length, summary.results.length);
      assert.ok(rows.every((row) => row.ruleVersion === 1));
      assert.ok(rows.every((row) => row.requestId === `request-${assetKey}`));
    } finally {
      await db
        .delete(dataQualityResult)
        .where(eq(dataQualityResult.assetKey, assetKey));
    }
  },
);

test(
  "critical repeated failures keep one open quality incident per asset",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const assetKey = `quality-fail-${crypto.randomUUID()}`;
    const failed: QualityRuleExecutor = async (rule) => ({
      ruleId: rule.id,
      status: "failed",
      severity: "critical",
      observedValue: 0,
      details: { fixture: true },
    });
    try {
      await runQualityChecks(
        { assetKeys: [assetKey], rules: rulesForAsset(assetKey) },
        failed,
      );
      await runQualityChecks(
        { assetKeys: [assetKey], rules: rulesForAsset(assetKey) },
        failed,
      );
      const open = await db
        .select({ id: dataIncident.id })
        .from(dataIncident)
        .where(
          and(
            eq(dataIncident.assetKey, assetKey),
            eq(dataIncident.incidentType, "quality"),
            ne(dataIncident.status, "closed"),
          ),
        );
      assert.equal(open.length, 1);
    } finally {
      await db
        .delete(dataQualityResult)
        .where(eq(dataQualityResult.assetKey, assetKey));
      await db.delete(dataIncident).where(eq(dataIncident.assetKey, assetKey));
    }
  },
);
