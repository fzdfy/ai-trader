import { Hono } from "hono";
import { db } from "../db";
import { strategyConfig, boardConstituent } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { ok, badRequest, notFound } from "../lib/response";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

const screensRoute = new Hono();

/** 东财原始代码 → 标准 symbol（如 600519 → 600519.SH，已含后缀则原样返回） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** 股票池范围类型：全部 / 行业 / 板块(概念) / 前端结果集合 */
type ScreenScope = "all" | "industry" | "concept" | "resultSet";

interface RunBody {
  strategyId?: number;
  topN?: number;
  scope?: ScreenScope;
  /** scope=industry|concept 时，选中的板块代码（多选） */
  boardCodes?: string[];
  /** scope=resultSet 时，前端结果集合中的完整 symbol 列表 */
  symbols?: string[];
}

/** 将股票池范围解析为 symbol 列表（undefined 表示不限定 = 全部） */
async function resolveSymbols(body: RunBody): Promise<string[] | undefined> {
  const scope = body.scope ?? "all";

  if (scope === "industry" || scope === "concept") {
    const codes = (body.boardCodes ?? []).filter(Boolean);
    if (codes.length === 0) return undefined;
    const constituents = await db
      .select({ symbol: boardConstituent.symbol })
      .from(boardConstituent)
      .where(inArray(boardConstituent.boardCode, codes));
    return [...new Set(constituents.map((r) => codeToSymbol(r.symbol)))];
  }

  if (scope === "resultSet") {
    const list = (body.symbols ?? []).filter(Boolean);
    return list.length > 0 ? [...new Set(list)] : undefined;
  }

  return undefined;
}

// POST /api/v1/screens/run — 根据策略选股（读取策略因子 → 代理 quant 打分排名）
screensRoute.post("/run", async (c) => {
  const body = (await c.req.json()) as RunBody;
  const strategyId = Number(body.strategyId);
  const topN = Number(body.topN) || 20;

  if (!Number.isInteger(strategyId)) return badRequest(c, "strategyId is required");

  const rows = await db
    .select()
    .from(strategyConfig)
    .where(eq(strategyConfig.id, strategyId));
  const strategy = rows[0];
  if (!strategy) return notFound(c, "Strategy not found");

  // 策略 = 因子集合，取出 { name, value, weight, direction } 交给 quant 打分（weight/value 0-100）
  const cfg = strategy.configJson as {
    factors?: { name: string; value?: number; weight: number; direction?: number }[];
    combine?: string;
  };
  const factors = (cfg.factors ?? []).map((f) => ({
    name: f.name,
    value: f.value ?? 50,
    weight: f.weight,
    direction: f.direction === -1 ? -1 : 1,
  }));
  const combine = cfg.combine ?? "weighted_sum";

  // 股票池范围：全部 / 行业 / 板块 / 结果集合 → 解析为 symbol 列表
  const symbols = await resolveSymbols(body);

  const res = await fetch(`${QUANT_URL}/api/v1/screens/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factors, topN, combine, symbols }),
  });
  const json = (await res.json()) as {
    items?: unknown[];
    total?: number;
    detail?: string;
  };

  if (!res.ok) {
    return c.json(
      { success: false, error: json.detail ?? "Screen failed" },
      res.status as 400 | 404 | 500,
    );
  }

  return ok(c, {
    items: json.items ?? [],
    total: json.total ?? 0,
    strategy: { id: strategy.id, name: strategy.name },
  });
});

export { screensRoute };
