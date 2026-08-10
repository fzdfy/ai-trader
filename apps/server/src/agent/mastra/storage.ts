import { PostgresStore } from "@mastra/pg";
import { db } from "../../db";

export const storage = new PostgresStore({
  id: "aitrader-memory",
  pool: db.$client,
});
