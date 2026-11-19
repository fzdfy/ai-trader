import { Hono } from "hono";
import { ok } from "../lib/response";
import {
  runScreening,
  type ScreenExclude,
  type ScreenRequest,
  type ScreenScope,
} from "../services/screening-service.ts";
import { WorkflowActionError } from "../services/workflow-action-utils.ts";
import { DataGovernanceGateError } from "../lib/data-governance/quality-gate.ts";

const screensRoute = new Hono();

interface RunBody {
  strategyId?: number;
  topN?: number;
  scope?: ScreenScope;
  boardCodes?: string[];
  symbols?: string[];
  excludes?: ScreenExclude[];
}

screensRoute.post("/run", async (c) => {
  const body = (await c.req.json()) as RunBody;

  try {
    const result = await runScreening({
      ...body,
      strategyId: Number(body.strategyId),
      userId: c.req.header("X-User-Id"),
    } satisfies ScreenRequest);
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

export { screensRoute };
