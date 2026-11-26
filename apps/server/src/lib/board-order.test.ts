import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { board } from "../db/schema/md.ts";
import { numericTextAscending } from "./board-order.ts";

test("board rank ordering casts text ranks to numbers", () => {
  const db = drizzle.mock();
  const query = db
    .select()
    .from(board)
    .orderBy(numericTextAscending(board.rank))
    .toSQL();

  assert.match(query.sql, /cast\("board"\."rank" as integer\) asc/i);
});
