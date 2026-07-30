import { Hono } from "hono";
import { ok, badRequest } from "../lib/response";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

const backtestsRoute = new Hono();

// GET /api/v1/backtests/strategies
backtestsRoute.get("/strategies", async (c) => {
  const res = await fetch(`${QUANT_URL}/api/v1/strategies`);
  const json = await res.json();
  return ok(c, json.strategies ?? []);
});

// POST /api/v1/backtests/run
backtestsRoute.post("/run", async (c) => {
  const body = await c.req.json();
  const { symbol, strategy, params, startDate, endDate } = body as {
    symbol?: string;
    strategy?: string;
    params?: Record<string, number>;
    startDate?: string;
    endDate?: string;
  };

  if (!symbol) return badRequest(c, "symbol is required");
  if (!strategy) return badRequest(c, "strategy is required");

  const res = await fetch(`${QUANT_URL}/api/v1/backtests/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, strategy, params: params ?? {}, startDate, endDate }),
  });
  const json = await res.json();

  if (!res.ok) {
    return c.json(
      { success: false, error: json.detail ?? "Backtest failed" },
      res.status as 400 | 404 | 500,
    );
  }

  return ok(c, json);
});

export { backtestsRoute };
