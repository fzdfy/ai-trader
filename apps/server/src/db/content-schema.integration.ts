import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const databaseUrl =
  process.env.ADMIN_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://ai-trader:aitrader123@localhost:5432/aitrader";
const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "company announcements are unique by source and source URL",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const sourceUrl = `https://example.com/announcement/${crypto.randomUUID()}`;

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO company_announcement
           (symbol, title, publish_at, source_url, source)
         VALUES ('002594.SZ', '季度报告', '2026-10-28', $1, 'cninfo')`,
        [sourceUrl],
      );

      await client.query("SAVEPOINT duplicate");
      let duplicateCode: string | undefined;
      try {
        await client.query(
          `INSERT INTO company_announcement
             (symbol, title, publish_at, source_url, source)
           VALUES ('002594.SZ', '重复季度报告', '2026-10-28', $1, 'cninfo')`,
          [sourceUrl],
        );
      } catch (error) {
        duplicateCode = (error as { code?: string }).code;
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT duplicate");
        await client.query("RELEASE SAVEPOINT duplicate");
      }
      assert.equal(duplicateCode, "23505");

      await client.query(
        `INSERT INTO company_announcement
           (symbol, title, publish_at, source_url, source)
         VALUES ('002594.SZ', '东财季度报告', '2026-10-28', $1, 'eastmoney')`,
        [sourceUrl],
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);

test(
  "announcement migration keeps the newest duplicate",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const sourceUrl = `https://example.com/migration/${crypto.randomUUID()}`;
    const migration = await readFile(
      new URL("../../migrations/0037_stock_content_ingestion.sql", import.meta.url),
      "utf8",
    );

    try {
      await client.query("BEGIN");
      await client.query(
        `CREATE TEMP TABLE company_announcement (
           id bigserial PRIMARY KEY,
           source text NOT NULL,
           source_url text
         )`,
      );
      const older = await client.query<{ id: number }>(
        `INSERT INTO company_announcement (source, source_url)
         VALUES ('cninfo', $1) RETURNING id`,
        [sourceUrl],
      );
      const newer = await client.query<{ id: number }>(
        `INSERT INTO company_announcement (source, source_url)
         VALUES ('cninfo', $1) RETURNING id`,
        [sourceUrl],
      );
      await client.query(
        `INSERT INTO company_announcement (source, source_url)
         VALUES ('eastmoney', $1)`,
        [sourceUrl],
      );

      for (const statement of migration
        .split("--> statement-breakpoint")
        .map((item) => item.trim())
        .filter(Boolean)) {
        await client.query(statement);
      }

      const rows = await client.query<{ id: number }>(
        `SELECT id FROM company_announcement WHERE source = 'cninfo'`,
      );
      assert.deepEqual(
        rows.rows.map((row) => Number(row.id)),
        [Number(newer.rows[0]!.id)],
      );
      assert.ok(Number(newer.rows[0]!.id) > Number(older.rows[0]!.id));
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
