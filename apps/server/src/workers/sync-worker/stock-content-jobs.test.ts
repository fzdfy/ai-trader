import assert from "node:assert/strict";
import test, { after } from "node:test";
import { desc, eq } from "drizzle-orm";

import { db } from "../../db";
import { jobRun, watchlist } from "../../db/schema";
import { quant } from "../../lib/quant";
import { CRON_JOBS } from "./cron-config";
import {
  runStockAnnouncementSync,
  runStockFundamentalsSync,
  runStockResearchReportSync,
} from "./stock-content-jobs.ts";
import { RUNNERS, wrapJob } from "./runner";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test("watchlist content jobs are scheduled after market close", () => {
  const announcements = CRON_JOBS.find((job) => job.name === "stock-announcements");
  const reports = CRON_JOBS.find((job) => job.name === "stock-research-reports");
  const fundamentals = CRON_JOBS.find((job) => job.name === "stock-fundamentals");

  assert.deepEqual(
    {
      cron: announcements?.cron,
      enabled: announcements?.enabled,
      marketCloseOnly: announcements?.marketCloseOnly,
    },
    { cron: "5 18 * * 1-5", enabled: true, marketCloseOnly: true },
  );
  assert.deepEqual(
    {
      cron: reports?.cron,
      enabled: reports?.enabled,
      marketCloseOnly: reports?.marketCloseOnly,
    },
    { cron: "10 18 * * 1-5", enabled: true, marketCloseOnly: true },
  );
  assert.deepEqual(
    {
      cron: fundamentals?.cron,
      enabled: fundamentals?.enabled,
      marketCloseOnly: fundamentals?.marketCloseOnly,
    },
    { cron: "20 18 * * 1-5", enabled: true, marketCloseOnly: true },
  );
});

test(
  "watchlist announcement sync continues after one symbol fails",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const userId = `stock-content-job-${crypto.randomUUID()}`;
    const watchedSymbols = ["000001.SZ", "600519.SH"];
    const calls: string[] = [];
    const windows: Array<[number, number]> = [];
    const original = quant.announcements;
    t.after(async () => {
      quant.announcements = original;
      await db.delete(watchlist).where(eq(watchlist.userId, userId));
    });
    await db.insert(watchlist).values(watchedSymbols.map((symbol) => ({ userId, symbol })));
    quant.announcements = async (symbol, sinceDays, pageSize) => {
      calls.push(symbol);
      windows.push([sinceDays ?? 0, pageSize ?? 0]);
      if (symbol === watchedSymbols[0]) throw new Error("单股公告失败");
      return [];
    };
    const expected = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .then((rows) => rows.map((row) => row.symbol).sort());

    await assert.rejects(runStockAnnouncementSync(), /000001\.SZ/);

    assert.deepEqual([...calls].sort(), expected);
    assert.ok(windows.length >= 2);
    assert.ok(windows.every(([sinceDays, pageSize]) => sinceDays === 30 && pageSize === 30));
    assert.ok(watchedSymbols.every((symbol) => calls.includes(symbol)));
  },
);

test(
  "watchlist research sync records job_run evidence",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const userId = `stock-report-job-${crypto.randomUUID()}`;
    const calls: string[] = [];
    const original = quant.researchReports;
    t.after(async () => {
      quant.researchReports = original;
      await db.delete(watchlist).where(eq(watchlist.userId, userId));
    });
    await db.insert(watchlist).values({ userId, symbol: "002594.SZ" });
    quant.researchReports = async (symbol) => {
      calls.push(symbol);
      return {
        symbol,
        page: 1,
        page_size: 100,
        total: 0,
        items: [],
      };
    };
    const expected = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .then((rows) => rows.map((row) => row.symbol).sort());

    const ok = await wrapJob("stock-research-reports", RUNNERS["stock-research-reports"])();
    const [latest] = await db
      .select({ status: jobRun.status })
      .from(jobRun)
      .where(eq(jobRun.jobType, "stock-research-reports"))
      .orderBy(desc(jobRun.id))
      .limit(1);

    assert.equal(ok, true);
    assert.equal(latest?.status, "success");
    assert.deepEqual([...calls].sort(), expected);
    assert.ok(calls.includes("002594.SZ"));
  },
);

test(
  "watchlist research sync queues the recent full-text window",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const userId = `stock-report-window-${crypto.randomUUID()}`;
    const prepared: string[] = [];
    const original = quant.researchReports;
    t.after(async () => {
      quant.researchReports = original;
      await db.delete(watchlist).where(eq(watchlist.userId, userId));
    });
    await db.insert(watchlist).values({ userId, symbol: "002594.SZ" });
    quant.researchReports = async (symbol) => ({
      symbol,
      page: 1,
      page_size: 100,
      total: 0,
      items: [],
    });
    const expected = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .then((rows) => rows.map((row) => row.symbol).sort());

    await runStockResearchReportSync(async (symbol) => {
      prepared.push(symbol);
      return { queued: 0, skipped: 0, failed: 0 };
    });

    assert.deepEqual([...prepared].sort(), expected);
  },
);

test(
  "watchlist fundamentals sync covers all sources and continues after one symbol fails",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const userId = `stock-fundamentals-job-${crypto.randomUUID()}`;
    const watchedSymbols = ["000001.SZ", "600519.SH", "920001.BJ"];
    const consensusCalls: string[] = [];
    const snapshotCalls: string[] = [];
    const statementCalls: string[] = [];
    const valuationCalls: string[] = [];
    const originalConsensus = quant.analystConsensus;
    const originalSnapshot = quant.financialSnapshot;
    const originalStatements = quant.financialStatements;
    const originalValuation = quant.valuationHistory;
    t.after(async () => {
      quant.analystConsensus = originalConsensus;
      quant.financialSnapshot = originalSnapshot;
      quant.financialStatements = originalStatements;
      quant.valuationHistory = originalValuation;
      await db.delete(watchlist).where(eq(watchlist.userId, userId));
    });
    await db.insert(watchlist).values(watchedSymbols.map((symbol) => ({ userId, symbol })));
    quant.analystConsensus = async (symbol) => {
      consensusCalls.push(symbol);
      if (symbol === "000001.SZ") throw new Error("一致预期失败");
      return [];
    };
    quant.financialSnapshot = async (symbol) => {
      snapshotCalls.push(symbol);
      return [];
    };
    quant.financialStatements = async (symbol) => {
      statementCalls.push(symbol);
      return [];
    };
    quant.valuationHistory = async (symbol) => {
      valuationCalls.push(symbol);
      return [];
    };
    const expected = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .then((rows) => rows.map((row) => row.symbol).sort());

    await assert.rejects(runStockFundamentalsSync(), /000001\.SZ/);

    for (const calls of [consensusCalls, snapshotCalls, statementCalls]) {
      assert.deepEqual([...calls].sort(), expected);
    }
    assert.deepEqual(
      [...valuationCalls].sort(),
      expected.filter((symbol) => !symbol.endsWith(".BJ")),
    );
  },
);
