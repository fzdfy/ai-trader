import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  compareSourceStandard,
  fetchLatestSourceStandardSnapshot,
  SourceStandardUnavailableError,
} from "./source-standard-monitor.ts";
import { getSourceStandardReference } from "./source-standards.ts";

const reference = getSourceStandardReference("a-stock-data");
const skill = `---\nname: a-stock-data\nversion: ${reference.versionLabel}\n---\n`;
const skillFileSha256 = createHash("sha256").update(skill).digest("hex");

function responseFixture(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  if (url.includes("/commits")) {
    return Promise.resolve(
      Response.json([
        {
          sha: reference.commitSha,
          commit: {
            message: `release ${reference.versionLabel}`,
            author: { date: reference.reviewedAt },
          },
        },
      ]),
    );
  }
  assert.equal(init?.signal instanceof AbortSignal, true);
  return Promise.resolve(
    Response.json({
      encoding: "base64",
      content: Buffer.from(skill).toString("base64"),
    }),
  );
}

test("unchanged commit and checksum produce unchanged", async () => {
  const snapshot = await fetchLatestSourceStandardSnapshot(responseFixture);
  assert.equal(snapshot.skillFileSha256, skillFileSha256);
  assert.equal(
    compareSourceStandard({ ...reference, skillFileSha256 }, snapshot),
    "unchanged",
  );
});

test("changed commit or SKILL checksum produces changed", () => {
  const snapshot = {
    commitSha: reference.commitSha,
    versionLabel: reference.versionLabel,
    skillFileSha256: reference.skillFileSha256,
    fetchedAt: "2026-11-19T00:00:00Z",
  };
  assert.equal(
    compareSourceStandard(reference, { ...snapshot, commitSha: "new" }),
    "changed",
  );
  assert.equal(
    compareSourceStandard(reference, {
      ...snapshot,
      skillFileSha256: "new",
    }),
    "changed",
  );
  assert.equal(
    compareSourceStandard(reference, {
      ...snapshot,
      versionLabel: "new",
    }),
    "changed",
  );
});

test("network failure is classified as unavailable", async () => {
  await assert.rejects(
    fetchLatestSourceStandardSnapshot(async () => {
      throw new Error("offline");
    }),
    (error: unknown) =>
      error instanceof SourceStandardUnavailableError &&
      error.message === "offline",
  );
});
