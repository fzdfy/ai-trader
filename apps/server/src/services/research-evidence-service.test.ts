import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";

import { searchResearchEvidence } from "./research-evidence-service.ts";

const input = {
  symbol: "002594.SZ",
  query: "海外销量",
  asOf: "2026-01-31",
  limit: 8,
};

const keywordRow = {
  report_id: 7,
  source_id: "AP202611021831322093",
  title: "海外市场跟踪",
  institution: "测试证券",
  publish_date: "2026-01-20",
  pdf_url: "https://example.com/report.pdf",
  page_from: 3,
  page_to: 4,
  section_title: "海外销量",
  chunk_text: "海外销量保持增长。",
  similarity: null,
};

function containsParam(query: SQL, expected: string): boolean {
  return query.queryChunks.some((chunk) => {
    if (chunk === expected) return true;
    if (chunk instanceof Object && "value" in chunk) {
      return (
        chunk.value === expected || (Array.isArray(chunk.value) && chunk.value.includes(expected))
      );
    }
    return (
      chunk instanceof Object && "queryChunks" in chunk && containsParam(chunk as SQL, expected)
    );
  });
}

test("semantic retrieval failure falls back to keyword search", async () => {
  const queries: SQL[] = [];
  const result = await searchResearchEvidence(input, {
    embed: async () => {
      throw new Error("embedding unavailable");
    },
    execute: async (query) => {
      queries.push(query);
      return { rows: [keywordRow] };
    },
  });

  assert.equal(result.mode, "keyword");
  assert.equal(result.model, null);
  assert.equal(result.items[0]?.similarity, null);
  assert.equal(queries.length, 1);
  assert.equal(containsParam(queries[0]!, input.asOf), true);
});

test("empty semantic results fall back to keyword search", async () => {
  const queries: SQL[] = [];
  const result = await searchResearchEvidence(input, {
    embed: async () => ({
      model: "test-embedding",
      vectors: [Array.from({ length: 512 }, () => 0)],
    }),
    execute: async (query) => {
      queries.push(query);
      return { rows: queries.length === 1 ? [] : [keywordRow] };
    },
  });

  assert.equal(result.mode, "keyword");
  assert.equal(queries.length, 2);
  assert.ok(queries.every((query) => containsParam(query, input.asOf)));
});

test("semantic results retain their similarity and model", async () => {
  const queries: SQL[] = [];
  const result = await searchResearchEvidence(input, {
    embed: async () => ({
      model: "test-embedding",
      vectors: [Array.from({ length: 512 }, () => 0)],
    }),
    execute: async (query) => {
      queries.push(query);
      return {
        rows: [{ ...keywordRow, similarity: 0.82 }],
      };
    },
  });

  assert.equal(result.mode, "semantic");
  assert.equal(result.model, "test-embedding");
  assert.equal(result.items[0]?.similarity, 0.82);
  assert.equal(queries.length, 1);
  assert.equal(containsParam(queries[0]!, input.asOf), true);
});

test("keyword fallback requires every whitespace-delimited query token", async () => {
  const queries: SQL[] = [];
  await searchResearchEvidence(
    {
      symbol: "002594.SZ",
      query: "海外销量 盈利韧性",
      limit: 8,
    },
    {
      embed: async () => {
        throw new Error("embedding unavailable");
      },
      execute: async (query) => {
        queries.push(query);
        return { rows: [] };
      },
    },
  );

  assert.equal(containsParam(queries[0]!, "%海外销量%"), true);
  assert.equal(containsParam(queries[0]!, "%盈利韧性%"), true);
});

test("metadata-only keyword matches are not returned as citable evidence", async () => {
  const result = await searchResearchEvidence(
    {
      symbol: "002594.SZ",
      query: "海外",
      limit: 8,
    },
    {
      embed: async () => {
        throw new Error("embedding unavailable");
      },
      execute: async () => ({
        rows: [
          {
            ...keywordRow,
            page_from: null,
            page_to: null,
            section_title: null,
            chunk_text: null,
          },
        ],
      }),
    },
  );

  assert.equal(result.mode, "keyword");
  assert.deepEqual(result.items, []);
});
