import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkTaskDraft } from "./work-task-tool";

test("AI work task draft contains only allowlisted fields", () => {
  const draft = buildWorkTaskDraft({
    title: "核验比亚迪出口结构",
    description: "补充海外销量与渠道数据",
    category: "research",
    priority: "high",
    scheduledDate: "2026-11-21",
  });
  assert.deepEqual(draft, {
    draftType: "work-task",
    title: "核验比亚迪出口结构",
    description: "补充海外销量与渠道数据",
    category: "research",
    priority: "high",
    scheduledDate: "2026-11-21",
    dueTime: null,
    sourceType: null,
    sourceId: null,
  });
  assert.equal("status" in draft, false);
  assert.equal("userId" in draft, false);
});

test("AI work task draft rejects source ids without a source type", () => {
  assert.throws(
    () =>
      buildWorkTaskDraft({
        title: "跟进个股",
        description: "",
        category: "follow_up",
        priority: "normal",
        sourceId: "002594.SZ",
      }),
    /来源类型/,
  );
});
