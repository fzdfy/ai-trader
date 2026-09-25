import { Hono } from "hono";
import { db } from "../db";
import {
  strategyConfig,
  boardConstituent,
  factorRegistry,
  board,
  fundFlowRank,
} from "../db/schema";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
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

/** 股票池范围类型：全部 / 行业 / 板块(概念) / 前端结果集合 / 涨幅榜 / 成交额榜 / 百日涨停榜 */
type ScreenScope =
  | "all"
  | "industry"
  | "concept"
  | "resultSet"
  | "gain3"
  | "amount1b"
  | "limitUp1";

/** 固定阈值：涨幅榜 —— 最新交易日相对上一交易日涨幅 ≥ 3% */
const GAIN_3_SQL = sql`
  WITH d0 AS (SELECT MAX(time) AS t FROM bar1d_adj),
       d1 AS (SELECT MAX(time) AS t FROM bar1d_adj WHERE time < (SELECT t FROM d0))
  SELECT a.symbol
  FROM bar1d_adj a
  JOIN bar1d_adj b ON b.symbol = a.symbol
  WHERE a.time = (SELECT t FROM d0)
    AND b.time = (SELECT t FROM d1)
    AND b.close > 0
    AND (a.close - b.close) / b.close * 100 >= 3
`;

/** 固定阈值：成交额榜 —— 最新交易日成交额 ≥ 10 亿元（成交额 = 收盘价 × 成交量(手) × 100） */
const AMOUNT_1B_SQL = sql`
  WITH d0 AS (SELECT MAX(time) AS t FROM bar1d_adj)
  SELECT b.symbol
  FROM bar1d_adj b
  WHERE b.time = (SELECT t FROM d0)
    AND b.close * b.volume * 100 >= 1000000000
`;

/** 固定阈值：百日涨停榜 —— 最近 100 个交易日内涨停 ≥ 1 次（按板块/ST 分档判定涨停幅度） */
const LIMIT_UP_1_SQL = sql`
  WITH days AS (
    SELECT trade_date
    FROM trading_calendar
    WHERE is_trading_day = true
      AND trade_date <= (SELECT MAX(time)::date FROM bar1d_adj)
    ORDER BY trade_date DESC
    LIMIT 101
  ),
  win AS (SELECT MIN(trade_date)::timestamp AS d_start FROM days),
  bars AS (
    SELECT b.symbol,
           b.close,
           LAG(b.close) OVER (PARTITION BY b.symbol ORDER BY b.time) AS prev_close
    FROM bar1d_adj b, win
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

/** 执行固定阈值查询，返回命中的完整 symbol 列表 */
async function querySymbols(query: SQL): Promise<string[]> {
  const res = await db.execute(query);
  return res.rows.map((r) => String((r as { symbol: string }).symbol));
}

/** 选股结果项（quant 打分返回 + 行业/板块补全字段） */
interface ScreenItem {
  symbol: string;
  name: string;
  close: number;
  /** 最新涨跌幅(%)，红涨绿跌 */
  changePct?: number | null;
  /** 最新交易日成交额（元），quant 由 bar1d_adj.amount 提供 */
  amount?: number | null;
  /** 主力资金净流入（元），fund_flow_rank 最新快照；未命中前 1000 名为 null */
  mainNetInflow?: number | null;
  score: number;
  factorScores: Record<string, number>;
  /** 所属行业（三级行业链条，用 / 连接） */
  industry?: string | null;
  /** 所属概念板块（全部，按热度排序；前端列表展示前 3 个，hover 展示全部） */
  sectors?: string[];
  /** 所属概念板块总数 */
  sectorTotal?: number;
}

/** 为选股结果补全「行业」与「概念板块」（board_constituent JOIN board） */
async function enrichBoards(items: ScreenItem[]): Promise<ScreenItem[]> {
  if (items.length === 0) return items;

  const symbols = [...new Set(items.map((i) => i.symbol))];
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
  for (const r of rows) {
    if (r.type === "industry") {
      const list = industryBy.get(r.symbol) ?? [];
      list.push({ code: r.code, name: r.name });
      industryBy.set(r.symbol, list);
    } else {
      const n = Number(r.rank);
      const rank = Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
      const list = sectorBy.get(r.symbol) ?? [];
      list.push({ rank, name: r.name });
      sectorBy.set(r.symbol, list);
    }
  }

  return items.map((item) => {
    const industry = (industryBy.get(item.symbol) ?? [])
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((x) => x.name)
      .join(" / ");
    const sectors = (sectorBy.get(item.symbol) ?? [])
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.name);
    return {
      ...item,
      industry: industry || null,
      sectors,
      sectorTotal: sectors.length,
    };
  });
}

/** 为选股结果补全「主力资金净流入」（fund_flow_rank 最新快照，category='stock'） */
async function enrichFundFlow(items: ScreenItem[]): Promise<ScreenItem[]> {
  if (items.length === 0) return items;

  // fund_flow_rank.code（category='stock'）与选股结果 symbol 同为带后缀格式（如 600000.SH），直接匹配
  const symbols = [...new Set(items.map((i) => i.symbol))];

  const [latest] = await db
    .selectDistinct({ date: fundFlowRank.date })
    .from(fundFlowRank)
    .where(eq(fundFlowRank.category, "stock"))
    .orderBy(desc(fundFlowRank.date))
    .limit(1);
  const date = latest?.date;
  if (!date) return items;

  // 个股资金流仅覆盖主力净流入前 1000 名，未命中的标的主力净流入置 null
  const rows = await db
    .select({ code: fundFlowRank.code, mainNetInflow: fundFlowRank.mainNetInflow })
    .from(fundFlowRank)
    .where(
      and(
        eq(fundFlowRank.category, "stock"),
        eq(fundFlowRank.date, date),
        inArray(fundFlowRank.code, symbols),
      ),
    );

  const inflowByCode = new Map<string, number | null>();
  for (const r of rows) {
    const num = r.mainNetInflow == null ? null : Number(r.mainNetInflow);
    inflowByCode.set(r.code, num != null && Number.isFinite(num) ? num : null);
  }

  return items.map((item) => ({
    ...item,
    mainNetInflow: inflowByCode.get(item.symbol) ?? null,
  }));
}

/** 排除条件：市值 < 100 亿 / 市盈亏损 / ST / 科创板 / 创业板 */
type ScreenExclude = "smallCap" | "loss" | "st" | "star" | "chinext";

interface RunBody {
  strategyId?: number;
  topN?: number;
  scope?: ScreenScope;
  /** scope=industry|concept 时，选中的板块代码（多选） */
  boardCodes?: string[];
  /** scope=resultSet 时，前端结果集合中的完整 symbol 列表 */
  symbols?: string[];
  /** 排除条件（多选）：smallCap/loss/st/star/chinext */
  excludes?: ScreenExclude[];
}

/** 将股票池范围解析为 symbol 列表（undefined 表示不限定 = 全部） */
async function resolveSymbols(body: RunBody): Promise<string[] | undefined> {
  const scope = body.scope ?? "all";

  // 固定阈值范围：涨幅榜 / 成交额榜 / 百日涨停榜（阈值内置写死）
  if (scope === "gain3") return querySymbols(GAIN_3_SQL);
  if (scope === "amount1b") return querySymbols(AMOUNT_1B_SQL);
  if (scope === "limitUp1") return querySymbols(LIMIT_UP_1_SQL);

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
  const topN = Number(body.topN) || 50;

  if (!Number.isInteger(strategyId)) return badRequest(c, "strategyId is required");

  const rows = await db.select().from(strategyConfig).where(eq(strategyConfig.id, strategyId));
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

  // 校验因子名是否存在于因子库，并为自定义因子附带 expression/code 供 quant 求值
  if (factors.length === 0) {
    return badRequest(c, "该策略没有配置选股因子");
  }
  // 因子可见性规则与其他因子接口一致：公开的 + 当前用户自己创建的
  const userId = c.req.header("X-User-Id");
  const visibility = [eq(factorRegistry.isPublic, true)];
  if (userId) visibility.push(eq(factorRegistry.createdBy, userId));

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
          factors.map((f) => f.name),
        ),
      ),
    );
  if (validFactorRows.length === 0) {
    return badRequest(c, "该策略没有可用的选股因子，请检查策略的因子配置");
  }

  // 内置因子无 expression/code（quant 走 numpy）；自定义因子按 kind 携带 expression 或 code
  const definitionBy = new Map(validFactorRows.map((r) => [r.name, r]));
  const runFactors = factors.map((f) => {
    const r = definitionBy.get(f.name);
    return {
      ...f,
      kind: r?.kind ?? "expression",
      expression: r?.expression ?? null,
      code: r?.code ?? null,
    };
  });

  // 股票池范围：全部 / 行业 / 板块 / 结果集合 → 解析为 symbol 列表
  const symbols = await resolveSymbols(body);

  // 排除条件：仅透传白名单内的取值，避免任意字符串进入 quant
  const allowed: ScreenExclude[] = ["smallCap", "loss", "st", "star", "chinext"];
  const excludes = [...new Set((body.excludes ?? []).filter((x) => allowed.includes(x)))];

  const res = await fetch(`${QUANT_URL}/api/v1/screens/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factors: runFactors, topN, combine, symbols, excludes }),
  });
  const json = (await res.json()) as {
    items?: unknown[];
    total?: number;
    elapsedMs?: number;
    fetchMs?: number;
    detail?: string;
  };

  if (!res.ok) {
    return c.json(
      { success: false, error: json.detail ?? "Screen failed" },
      res.status as 400 | 404 | 500,
    );
  }

  // 为结果补全行业/概念板块列（quant 只返回打分字段），再补主力资金净流入
  const items = await enrichFundFlow(await enrichBoards((json.items ?? []) as ScreenItem[]));

  return ok(c, {
    items,
    total: json.total ?? 0,
    strategy: { id: strategy.id, name: strategy.name },
    elapsedMs: json.elapsedMs ?? 0,
    fetchMs: json.fetchMs ?? 0,
  });
});

// POST /api/v1/screens/indicators — 根据策略因子为选股结果生成指标序列（缩略图数据）
screensRoute.post("/indicators", async (c) => {
  const body = (await c.req.json()) as { strategyId?: number; symbols?: string[] };
  const strategyId = Number(body.strategyId);
  const symbols = [...new Set((body.symbols ?? []).filter(Boolean))];

  if (!Number.isInteger(strategyId)) return badRequest(c, "strategyId is required");
  if (symbols.length === 0) return badRequest(c, "symbols is required");

  const rows = await db.select().from(strategyConfig).where(eq(strategyConfig.id, strategyId));
  const strategy = rows[0];
  if (!strategy) return notFound(c, "Strategy not found");

  // 策略 = 因子集合，提取因子名（内置 + 自定义）
  const cfg = strategy.configJson as { factors?: { name: string }[] };
  const names = [...new Set((cfg.factors ?? []).map((f) => f.name).filter(Boolean))];
  if (names.length === 0) return ok(c, { items: [] });

  // 从因子表补全 label 与定义（自定义因子按 kind 依赖 expression 或 code 求值）
  const factorRows = await db
    .select()
    .from(factorRegistry)
    .where(inArray(factorRegistry.name, names));
  const byName = new Map(factorRows.map((r) => [r.name, r]));
  const factors = names.map((name) => {
    const r = byName.get(name);
    return {
      name,
      label: r?.label ?? name,
      kind: r?.kind ?? "expression",
      expression: r?.expression ?? null,
      code: r?.code ?? null,
    };
  });

  const res = await fetch(`${QUANT_URL}/api/v1/screens/indicators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols, factors }),
  });
  const json = (await res.json()) as { items?: unknown[]; detail?: string };

  if (!res.ok) {
    return c.json(
      { success: false, error: json.detail ?? "Indicators failed" },
      res.status as 400 | 404 | 500,
    );
  }

  return ok(c, { items: json.items ?? [] });
});

export { screensRoute };
