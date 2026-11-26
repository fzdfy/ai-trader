import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { like, or } from "drizzle-orm";
import { instrument } from "../db/schema";
import {
  parseInstrumentListQuery,
  parseWatchlistQuery,
  stockSymbolAscending,
} from "./stock-list-query.ts";

test("instrument list query parses page, limit, and trimmed search", () => {
  assert.deepEqual(
    parseInstrumentListQuery(new URLSearchParams("page=2&limit=20&q= 比亚迪 ")),
    { ok: true, page: 2, limit: 20, q: "比亚迪" },
  );
});

test("instrument list query rejects invalid pagination values", () => {
  assert.equal(parseInstrumentListQuery(new URLSearchParams("page=0&limit=20")).ok, false);
  assert.equal(parseInstrumentListQuery(new URLSearchParams("page=1.5&limit=20")).ok, false);
  assert.equal(parseInstrumentListQuery(new URLSearchParams("page=1&limit=201")).ok, false);
});

test("watchlist query preserves legacy mode when pagination is omitted", () => {
  assert.deepEqual(parseWatchlistQuery(new URLSearchParams()), {
    ok: true,
    mode: "legacy",
    q: "",
  });
});

test("watchlist query returns paginated mode when both values are present", () => {
  assert.deepEqual(parseWatchlistQuery(new URLSearchParams("page=1&limit=20&q=银行")), {
    ok: true,
    mode: "paginated",
    page: 1,
    limit: 20,
    q: "银行",
  });
});

test("watchlist query rejects partial pagination parameters", () => {
  assert.equal(parseWatchlistQuery(new URLSearchParams("page=1")).ok, false);
  assert.equal(parseWatchlistQuery(new URLSearchParams("limit=20")).ok, false);
});

test("stock symbols sort ascending before pagination", () => {
  const query = drizzle
    .mock()
    .select()
    .from(instrument)
    .orderBy(stockSymbolAscending(instrument.symbol))
    .limit(20)
    .offset(20)
    .toSQL();

  assert.match(query.sql, /order by "instrument"\."symbol" asc limit \$1 offset \$2/i);
});

test("stock search keeps its filter when symbol ordering is applied", () => {
  const query = drizzle
    .mock()
    .select()
    .from(instrument)
    .where(or(like(instrument.code, "%银行%"), like(instrument.name, "%银行%")))
    .orderBy(stockSymbolAscending(instrument.symbol))
    .toSQL();

  assert.match(query.sql, /where \("instrument"\."code" like \$1 or "instrument"\."name" like \$2\)/i);
  assert.match(String(query.params[0]), /银行/);
  assert.match(query.sql, /order by "instrument"\."symbol" asc/i);
});
