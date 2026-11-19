import assert from "node:assert/strict";
import test from "node:test";
import { like } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { dataIncident } from "../../db/schema";
import {
  listIncidentEvents,
  openIncident,
  transitionIncident,
} from "./incidents.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "incident transitions append events and reject invalid transitions",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const actorUserId = `incident-actor-${suffix}`;
    try {
      const id = await openIncident({
        assetKey: `asset-${suffix}`,
        incidentType: "quality",
        severity: "critical",
        title: "数据质量失败",
        description: "有效性规则失败",
        payloadJson: { ruleId: "validity.ohlcv" },
      });
      await transitionIncident(id, {
        action: "acknowledge",
        actorUserId,
        message: "开始处理",
      });
      await transitionIncident(id, {
        action: "resolve",
        actorUserId,
        message: "数据已恢复",
      });

      const events = await listIncidentEvents(id);
      assert.deepEqual(
        events.map((event) => event.eventType),
        ["opened", "acknowledged", "resolved"],
      );
      await assert.rejects(
        () =>
          transitionIncident(id, {
            action: "resolve",
            actorUserId,
            message: "重复解决",
          }),
        /invalid transition/,
      );
    } finally {
      await db
        .delete(dataIncident)
        .where(like(dataIncident.assetKey, `asset-${suffix}`));
    }
  },
);
