import { Hono } from "hono";
import { ok } from "../lib/response";
import { runBacktest } from "../services/backtest-service.ts";
import { WorkflowActionError } from "../services/workflow-action-utils.ts";
import { DataGovernanceGateError } from "../lib/data-governance/quality-gate.ts";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

const backtestsRoute = new Hono();

// GET /api/v1/backtests/strategies
backtestsRoute.get("/strategies", async (c) => {
  const res = await fetch(`${QUANT_URL}/api/v1/strategies`);
  const json = (await res.json()) as { strategies?: unknown[] };
  return ok(c, json.strategies ?? []);
});

// GET /api/v1/backtests/factors
backtestsRoute.get("/factors", async (c) => {
  const res = await fetch(`${QUANT_URL}/api/v1/factors`);
  const json = (await res.json()) as { factors?: unknown[] };
  return ok(c, json.factors ?? []);
});

// POST /api/v1/backtests/run
backtestsRoute.post("/run", async (c) => {
  const body = (await c.req.json()) as {
    symbol?: string;
    strategy?: string;
    params?: Record<string, number>;
    config?: Record<string, unknown>;
    startDate?: string;
    endDate?: string;
    asOf?: string;
  };

  try {
    const result = await runBacktest({
      symbol: body.symbol ?? "",
      strategy: body.strategy ?? "",
      params: body.params,
      config: body.config,
      startDate: body.startDate,
      endDate: body.endDate,
      asOf: body.asOf,
    });
    return ok(c, result);
  } catch (error) {
    if (error instanceof DataGovernanceGateError) {
      return c.json(
        { success: false, error: error.message, data: error.decision },
        409,
      );
    }
    if (error instanceof WorkflowActionError) {
      return c.json({ success: false, error: error.message }, error.status);
    }
    throw error;
  }
});

export { backtestsRoute };
