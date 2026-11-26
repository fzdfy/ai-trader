import assert from "node:assert/strict";
import test from "node:test";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { instrument, watchlist } from "../db/schema";
import { createWatchlistRoute } from "./watchlist.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test("watchlist routes require a resolved session user", async () => {
  const route = createWatchlistRoute(async () => null);
  assert.equal((await route.request("/")).status, 401);
  assert.equal((await route.request("/instruments")).status, 401);
  assert.equal(
    (await route.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "002594.SZ" }),
    })).status,
    401,
  );
  assert.equal(
    (await route.request("/002594.SZ", { method: "DELETE" })).status,
    401,
  );
});

test("watchlist rejects partial pagination parameters", async () => {
  const route = createWatchlistRoute(async () => "user-a");
  assert.equal((await route.request("/instruments?page=1")).status, 400);
  assert.equal((await route.request("/instruments?limit=20")).status, 400);
});

test(
  "watchlist pagination is owner-scoped, searchable, sorted, and ignores forged identity headers",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const suffix = crypto.randomUUID().slice(0, 12);
    const userA = `watchlist-a-${suffix}`;
    const userB = `watchlist-b-${suffix}`;
    const symbols = [`${suffix}A.SZ`, `${suffix}B.SZ`, `${suffix}C.SH`];
    t.after(async () => {
      await db.delete(watchlist).where(inArray(watchlist.symbol, symbols));
      await db.delete(instrument).where(inArray(instrument.symbol, symbols));
    });

    await db.insert(instrument).values(
      symbols.map((symbol, index) => ({
        symbol,
        code: symbol.slice(0, -3),
        name: `测试银行${index + 1}`,
        exchange: symbol.endsWith(".SH") ? "SH" : "SZ",
        market: "CN",
        status: "listed",
      })),
    );
    await db.insert(watchlist).values([
      { userId: userA, symbol: symbols[2]! },
      { userId: userA, symbol: symbols[0]! },
      { userId: userB, symbol: symbols[1]! },
    ]);

    const route = createWatchlistRoute(async () => userA);
    const legacy = await route.request("/instruments?q=测试银行", {
      headers: { "X-User-Id": userB },
    });
    const legacyBody = (await legacy.json()) as {
      data: Array<{ symbol: string }>;
    };
    assert.equal(legacy.status, 200);
    assert.deepEqual(
      legacyBody.data.map((row) => row.symbol),
      [symbols[0], symbols[2]],
    );

    const firstPage = await route.request("/instruments?page=1&limit=1&q=测试银行");
    const firstPageBody = (await firstPage.json()) as {
      success: boolean;
      data: Array<{ symbol: string }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    assert.equal(firstPageBody.success, true);
    assert.equal(firstPageBody.data.length, 1);
    assert.equal(firstPageBody.data[0]?.symbol, symbols[0]);
    assert.equal(firstPageBody.total, 2);
    assert.equal(firstPageBody.page, 1);
    assert.equal(firstPageBody.limit, 1);
    assert.equal(firstPageBody.totalPages, 2);

    const add = await route.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userB,
      },
      body: JSON.stringify({ symbol: symbols[1] }),
    });
    assert.equal(add.status, 201);

    const afterAdd = await route.request("/instruments");
    const afterAddBody = (await afterAdd.json()) as {
      data: Array<{ symbol: string }>;
    };
    assert.deepEqual(
      afterAddBody.data.map((row) => row.symbol),
      [symbols[0], symbols[1], symbols[2]],
    );

    const remove = await route.request(`/${symbols[1]}`, { method: "DELETE" });
    assert.equal(remove.status, 200);
    const afterRemove = await route.request("/instruments");
    const afterRemoveBody = (await afterRemove.json()) as {
      data: Array<{ symbol: string }>;
    };
    assert.deepEqual(
      afterRemoveBody.data.map((row) => row.symbol),
      [symbols[0], symbols[2]],
    );
  },
);
