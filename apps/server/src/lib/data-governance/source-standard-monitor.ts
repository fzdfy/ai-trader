import { createHash } from "node:crypto";
import type { SourceStandardReference } from "./source-standards";

const COMMITS_URL =
  "https://api.github.com/repos/simonlin1212/a-stock-data/commits?per_page=1";
const SKILL_URL =
  "https://api.github.com/repos/simonlin1212/a-stock-data/contents/SKILL.md";

export type SourceStandardSnapshot = {
  commitSha: string;
  versionLabel: string;
  skillFileSha256: string;
  fetchedAt: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class SourceStandardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceStandardUnavailableError";
  }
}

export async function fetchLatestSourceStandardSnapshot(
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<SourceStandardSnapshot> {
  try {
    const commitsResponse = await fetchImpl(COMMITS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-trader-source-standard-monitor",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!commitsResponse.ok) {
      throw new Error(`GitHub commits API returned ${commitsResponse.status}`);
    }
    const commits = (await commitsResponse.json()) as Array<{
      sha?: string;
    }>;
    const commitSha = commits[0]?.sha;
    if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
      throw new Error("GitHub commits API returned no valid commit SHA");
    }

    const skillResponse = await fetchImpl(
      `${SKILL_URL}?ref=${encodeURIComponent(commitSha)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "ai-trader-source-standard-monitor",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!skillResponse.ok) {
      throw new Error(`GitHub contents API returned ${skillResponse.status}`);
    }
    const content = (await skillResponse.json()) as {
      encoding?: string;
      content?: string;
    };
    if (content.encoding !== "base64" || !content.content) {
      throw new Error("GitHub contents API returned no base64 SKILL.md");
    }
    const skill = Buffer.from(
      content.content.replace(/\s/g, ""),
      "base64",
    );
    const version = skill
      .toString("utf8")
      .match(/^version:\s*(\S+)\s*$/m)?.[1];
    if (!version) throw new Error("SKILL.md has no version metadata");

    return {
      commitSha,
      versionLabel: version,
      skillFileSha256: createHash("sha256").update(skill).digest("hex"),
      fetchedAt: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof SourceStandardUnavailableError) throw error;
    throw new SourceStandardUnavailableError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function compareSourceStandard(
  reference: SourceStandardReference,
  snapshot: SourceStandardSnapshot,
): "unchanged" | "changed" {
  return reference.commitSha === snapshot.commitSha &&
    reference.skillFileSha256 === snapshot.skillFileSha256 &&
    reference.versionLabel === snapshot.versionLabel
    ? "unchanged"
    : "changed";
}
