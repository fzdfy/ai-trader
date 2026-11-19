import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssistantSourcePath,
  parseAssistantThreads,
  parseCreatedThreadId,
} from "./assistant.ts";

test("assistant thread responses keep history fields", () => {
  assert.deepEqual(
    parseAssistantThreads({
      data: {
        threads: [
          {
            id: "thread-1",
            title: "今日复盘",
            createdAt: "2026-11-17T01:00:00.000Z",
            updatedAt: "2026-11-17T02:00:00.000Z",
          },
        ],
      },
    }),
    [
      {
        id: "thread-1",
        title: "今日复盘",
        createdAt: "2026-11-17T01:00:00.000Z",
        updatedAt: "2026-11-17T02:00:00.000Z",
      },
    ],
  );
});

test("created thread responses require an id", () => {
  assert.equal(parseCreatedThreadId({ data: { threadId: "thread-2" } }), "thread-2");
  assert.equal(parseCreatedThreadId({ data: {} }), null);
});

test("assistant workspace returns to the source page and falls back home", () => {
  assert.equal(getAssistantSourcePath("/home/workflows/42"), "/home/workflows/42");
  assert.equal(getAssistantSourcePath("/news"), "/news");
  assert.equal(getAssistantSourcePath("/ai-chat/c/thread-1"), "/home");
  assert.equal(getAssistantSourcePath("https://example.com"), "/home");
  assert.equal(getAssistantSourcePath(null), "/home");
});
