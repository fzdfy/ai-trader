import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  board,
  boardConstituent,
  factorRegistry,
  fundFlowRank,
  strategyConfig,
} from "../db/schema";
import { WorkflowActionError } from "./workflow-action-utils.ts";
import { assertResearchDataReady } from "../lib/data-governance/quality-gate.ts";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

export type ScreenScope =
  | "all"
  | "industry"
  | "concept"
  | "resultSet"
  | "gain3"
  | "amount1b"
  | "limitUp1";

const GAIN_3_SQL = sql`
  WITH d0 AS (SELECT MAX(time) AS t FROM bar1d_raw),
       d1 AS (SELECT MAX(time) AS t FROM bar1d_raw WHERE time < (SELECT t FROM d0))
  SELECT a.symbol
  FROM bar1d_qfq a
  JOIN bar1d_qfq b ON b.symbol = a.symbol
  WHERE a.time = (SELECT t FROM d0)
    AND b.time = (SELECT t FROM d1)
    AND b.close > 0
    AND (a.close - b.close) / b.close * 100 >= 3
`;

const AMOUNT_1B_SQL = sql`
  WITH d0 AS (SELECT MAX(time) AS t FROM bar1d_raw)
  SELECT b.symbol
  FROM bar1d_qfq b
  WHERE b.time = (SELECT t FROM d0)
    AND COALESCE(b.amount, b.close_raw * b.volume * 100) >= 1000000000
`;

const LIMIT_UP_1_SQL = sql`
  WITH days AS (
    SELECT trade_date
    FROM trading_calendar
    WHERE is_trading_day = true
      AND trade_date <= (SELECT MAX(time)::date FROM bar1d_raw)
    ORDER BY trade_date DESC
    LIMIT 101
  ),
  win AS (SELECT MIN(trade_date)::timestamp AS d_start FROM days),
  bars AS (
    SELECT b.symbol,
           b.close,
           LAG(b.close) OVER (PARTITION BY b.symbol ORDER BY b.time) AS prev_close
    FROM bar1d_qfq b, win
    WHERE b.time >= win.d_start
  )
  SELECT b.symbol
  FROM bars b
  JOIN instrument i ON i.symbol = b.symbol
  WHERE b.prev_close > 0
    AND (b.close / b.prev_close - 1) * 100 >= CASE
      WHEN i.name LIKE '%ST%' THEN 4.8
      WHEN b.symbol LIKE '300%.SZ' OR b.symbol LIKE '301%.SZ'
        OR b.symbol LIKE '688%.SH' OR b.symbol LIKE '689%.SH' THEN 19.8
      ELSE 9.8
    END
  GROUP BY b.symbol
  HAVING COUNT(*) >= 1
`;

async function querySymbols(query: SQL): Promise<string[]> {
  const result = await db.execute(query);
  return result.rows.map((row) => String((row as { symbol: string }).symbol));
}

interface ScreenItem {
  symbol: string;
  name: string;
  close: number;
  changePct?: number | null;
  amount?: number | null;
  mainNetInflow?: number | null;
  score: number;
  factorScores: Record<string, number>;
  industry?: string | null;
  sectors?: string[];
  sectorTotal?: number;
}

async function enrichBoards(items: ScreenItem[]): Promise<ScreenItem[]> {
  if (items.length === 0) return items;

  const symbols = [...new Set(items.map((item) => item.symbol))];
  const rows = await db
    .select({
      symbol: boardConstituent.symbol,
      type: boardConstituent.type,
      name: board.name,
      code: board.code,
      rank: board.rank,
    })
    .from(boardConstituent)
    .innerJoin(board, eq(board.code, boardConstituent.boardCode))
    .where(inArray(boardConstituent.symbol, symbols));

  const industryBy = new Map<string, { code: string; name: string }[]>();
  const sectorBy = new Map<string, { rank: number; name: string }[]>();
  for (const row of rows) {
    if (row.type === "industry") {
      const list = industryBy.get(row.symbol) ?? [];
      list.push({ code: row.code, name: row.name });
      industryBy.set(row.symbol, list);
    } else {
      const numericRank = Number(row.rank);
      const rank =
        Number.isFinite(numericRank) && numericRank > 0 ? numericRank : Number.MAX_SAFE_INTEGER;
      const list = sectorBy.get(row.symbol) ?? [];
      list.push({ rank, name: row.name });
      sectorBy.set(row.symbol, list);
    }
  }

  return items.map((item) => {
    const industry = (industryBy.get(item.symbol) ?? [])
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((entry) => entry.name)
      .join(" / ");
    const sectors = (sectorBy.get(item.symbol) ?? [])
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.name);
    return {
      ...item,
      industry: industry || null,
      sectors,
      sectorTotal: sectors.length,
    };
  });
}

async function enrichFundFlow(items: ScreenItem[]): Promise<ScreenItem[]> {
  if (items.length === 0) return items;

  const symbols = [...new Set(items.map((item) => item.symbol))];
  const [latest] = await db
    .selectDistinct({ date: fundFlowRank.date })
    .from(fundFlowRank)
    .where(eq(fundFlowRank.category, "stock"))
    .orderBy(desc(fundFlowRank.date))
    .limit(1);
  if (!latest?.date) return items;

  const rows = await db
    .select({ code: fundFlowRank.code, mainNetInflow: fundFlowRank.mainNetInflow })
    .from(fundFlowRank)
    .where(
      and(
        eq(fundFlowRank.category, "stock"),
        eq(fundFlowRank.date, latest.date),
        inArray(fundFlowRank.code, symbols),
      ),
    );

  const inflowByCode = new Map<string, number | null>();
  for (const row of rows) {
    const value = row.mainNetInflow == null ? null : Number(row.mainNetInflow);
    inflowByCode.set(row.code, value != null && Number.isFinite(value) ? value : null);
  }

  return items.map((item) => ({
    ...item,
    mainNetInflow: inflowByCode.get(item.symbol) ?? null,
  }));
}

export type ScreenExclude = "smallCap" | "loss" | "st" | "star" | "chinext";

export interface ScreenRequest {
  strategyId: number;
  topN?: number;
  scope?: ScreenScope;
  boardCodes?: string[];
  symbols?: string[];
  excludes?: ScreenExclude[];
  userId?: string;
}

async function resolveSymbols(request: ScreenRequest): Promise<string[] | undefined> {
  const scope = request.scope ?? "all";

  if (scope === "gain3") return querySymbols(GAIN_3_SQL);
  if (scope === "amount1b") return querySymbols(AMOUNT_1B_SQL);
  if (scope === "limitUp1") return querySymbols(LIMIT_UP_1_SQL);

  if (scope === "industry" || scope === "concept") {
    const codes = (request.boardCodes ?? []).filter(Boolean);
    if (codes.length === 0) return undefined;
    const constituents = await db
      .select({ symbol: boardConstituent.symbol })
      .from(boardConstituent)
      .where(inArray(boardConstituent.boardCode, codes));
    return [...new Set(constituents.map((row) => codeToSymbol(row.symbol)))];
  }

  if (scope === "resultSet") {
    const symbols = (request.symbols ?? []).filter(Boolean);
    return symbols.length > 0 ? [...new Set(symbols)] : undefined;
  }

  return undefined;
}

export async function runScreening(
  request: ScreenRequest,
  signal?: AbortSignal,
): Promise<{
  items: ScreenItem[];
  total: number;
  strategy: { id: number; name: string };
  elapsedMs: number;
  fetchMs: number;
  governance?: {
    mode: string;
    warnings: unknown[];
  };
}> {
  signal?.throwIfAborted();
  const strategyId = Number(request.strategyId);
  if (!Number.isInteger(strategyId) || strategyId <= 0) {
    throw new WorkflowActionError("strategyId is required", 400);
  }

  const [strategy] = await db
    .select()
    .from(strategyConfig)
    .where(eq(strategyConfig.id, strategyId));
  if (!strategy) throw new WorkflowActionError("Strategy not found", 404);

  const config = strategy.configJson as {
    factors?: { name: string; value?: number; weight: number; direction?: number }[];
    combine?: string;
  };
  const factors = (config.factors ?? []).map((factor) => ({
    name: factor.name,
    value: factor.value ?? 50,
    weight: factor.weight,
    direction: factor.direction === -1 ? -1 : 1,
  }));
  if (factors.length === 0) {
    throw new WorkflowActionError("该策略没有配置选股因子", 400);
  }

  const visibility = [eq(factorRegistry.isPublic, true)];
  if (request.userId) visibility.push(eq(factorRegistry.createdBy, request.userId));

  const validFactorRows = await db
    .select({
      name: factorRegistry.name,
      kind: factorRegistry.kind,
      expression: factorRegistry.expression,
      code: factorRegistry.code,
    })
    .from(factorRegistry)
    .where(
      and(
        or(...visibility),
        inArray(
          factorRegistry.name,
          factors.map((factor) => factor.name),
        ),
      ),
    );
  if (validFactorRows.length === 0) {
    throw new WorkflowActionError("该策略没有可用的选股因子，请检查策略的因子配置", 400);
  }

  const definitionByName = new Map(validFactorRows.map((row) => [row.name, row]));
  const runFactors = factors.map((factor) => {
    const definition = definitionByName.get(factor.name);
    return {
      ...factor,
      kind: definition?.kind ?? "expression",
      expression: definition?.expression ?? null,
      code: definition?.code ?? null,
    };
  });
  const symbols = await resolveSymbols(request);
  const allowed: ScreenExclude[] = ["smallCap", "loss", "st", "star", "chinext"];
  const excludes = [
    ...new Set((request.excludes ?? []).filter((value) => allowed.includes(value))),
  ];

  signal?.throwIfAborted();
  const gate = await assertResearchDataReady("screening");
  const response = await fetch(`${QUANT_URL}/api/v1/screens/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      factors: runFactors,
      topN: Number(request.topN) || 50,
      combine: config.combine ?? "weighted_sum",
      symbols,
      excludes,
    }),
    signal,
  });
  const payload = (await response.json()) as {
    items?: unknown[];
    total?: number;
    elapsedMs?: number;
    fetchMs?: number;
    detail?: string;
  };
  if (!response.ok) {
    const status =
      response.status === 400 || response.status === 404 || response.status === 500
        ? response.status
        : 502;
    throw new WorkflowActionError(payload.detail ?? "Screen failed", status);
  }

  signal?.throwIfAborted();
  const items = await enrichFundFlow(await enrichBoards((payload.items ?? []) as ScreenItem[]));
  return {
    items,
    total: payload.total ?? 0,
    strategy: { id: strategy.id, name: strategy.name },
    elapsedMs: payload.elapsedMs ?? 0,
    fetchMs: payload.fetchMs ?? 0,
    ...(gate.warnings.length > 0
      ? { governance: { mode: gate.mode, warnings: gate.warnings } }
      : {}),
  };
}
