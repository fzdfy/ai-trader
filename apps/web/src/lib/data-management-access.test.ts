import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessDataManagement,
  canRetryModule,
  canRunManualSync,
  getCapabilityRuntimeMeta,
  getDataManagementSectionsForRole,
  getDataManagementViewState,
  getSystemLinksForRole,
} from "./data-management-access.ts";

test("normal and unknown roles can only open theme settings", () => {
  for (const role of [null, undefined, "user", "unexpected"]) {
    assert.deepEqual(
      getSystemLinksForRole(role).map((link) => link.label),
      ["主题设置"],
    );
    assert.equal(canAccessDataManagement(role), false);
  }
});

test("super administrators see data management and theme settings", () => {
  assert.deepEqual(
    getSystemLinksForRole("super_admin").map((link) => link.label),
    ["数据管理", "主题设置"],
  );
  assert.equal(canAccessDataManagement("super_admin"), true);
});

test("super administrators see governance between quality and audit", () => {
  assert.deepEqual(
    getDataManagementSectionsForRole("super_admin").map((item) => item.label),
    ["总览", "数据源", "数据表", "数据同步", "数据质量", "数据治理", "操作审计"],
  );
  assert.deepEqual(getDataManagementSectionsForRole("user"), []);
});

test("data-management content stays hidden while role is loading or denied", () => {
  assert.equal(getDataManagementViewState(null, true), "loading");
  assert.equal(getDataManagementViewState("user", false), "denied");
  assert.equal(getDataManagementViewState("unexpected", false), "denied");
  assert.equal(getDataManagementViewState("super_admin", false), "allowed");
});

test("write actions require a reason and no conflicting running job", () => {
  assert.equal(canRetryModule("failed", "", false), false);
  assert.equal(canRetryModule("success", "恢复任务", false), false);
  assert.equal(canRetryModule("failed", "恢复任务", true), false);
  assert.equal(canRetryModule("failed", "恢复任务", false), true);
  assert.equal(canRunManualSync(true), false);
  assert.equal(canRunManualSync(false), true);
});

test("capability runtime distinguishes healthy, degraded, and unavailable chains", () => {
  assert.deepEqual(
    getCapabilityRuntimeMeta({
      chain: ["tencent", "mootdx"],
      active_source: "tencent",
      degraded: false,
      available: true,
    }),
    { label: "主源正常 → tencent", variant: "success" },
  );
  assert.deepEqual(
    getCapabilityRuntimeMeta({
      chain: ["tencent", "mootdx"],
      active_source: "mootdx",
      degraded: true,
      available: true,
    }),
    { label: "已降级 → mootdx", variant: "warning" },
  );
  assert.deepEqual(
    getCapabilityRuntimeMeta({
      chain: ["eastmoney"],
      active_source: null,
      degraded: false,
      available: false,
    }),
    { label: "全链不可用", variant: "error" },
  );
  assert.deepEqual(getCapabilityRuntimeMeta(null), {
    label: "无运行态",
    variant: "neutral",
  });
});
