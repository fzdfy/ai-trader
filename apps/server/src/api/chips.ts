/**
 * 筹码分布 API — 基于 bar1d_adj 历史日线实时计算成本分布。
 *
 * 算法：经典"三角形分布"筹码模型（成本分布）。
 * 每根 K 线的成交量按三角形分布摊到 [low, high] 价格区间，
 * 峰值在 close 处，向 low/high 线性递减。历史筹码按 decay 幂衰减。
 *
 * 输出：价格区间分布 + 平均成本 / 获利盘比例 / 90%·70% 成本区间。
 */

import { Hono } from "hono";
import { StockSDK } from "stock-sdk";
import { db } from "../db";
import { bar1dAdj } from "../db/schema";
import { eq, lte, desc } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const chipsRoute = new Hono();

interface DailyBar {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PricePoint {
  /** 价格区间中值 */
  price: number;
  /** 该价位筹码占比(%) */
  percent: number;
  /** 累计占比(%)，用于判断获利盘 */
  cumPercent: number;
}

// GET /api/v1/chips?symbol=002594.SZ&days=250&bins=48
chipsRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? "250"), 30), 2000);
  const bins = Math.min(Math.max(Number(c.req.query("bins") ?? "48"), 20), 100);

  if (!symbol) return badRequest(c, "symbol is required");

  // 拉取最近 N 个交易日的日线
  const rows = await db
    .select({
      time: bar1dAdj.time,
      open: bar1dAdj.open,
      high: bar1dAdj.high,
      low: bar1dAdj.low,
      close: bar1dAdj.close,
      volume: bar1dAdj.volume,
    })
    .from(bar1dAdj)
    .where(eq(bar1dAdj.symbol, symbol))
    .orderBy(desc(bar1dAdj.time))
    .limit(days);

  if (rows.length === 0) return ok(c, null);

  // 时间正序
  const bars: DailyBar[] = rows.reverse().map((r) => ({
    time: r.time,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));

  const distribution = computeChipDistribution(bars, bins);
  const currentPrice = bars[bars.length - 1]!.close;

  return ok(c, {
    symbol,
    ...buildSummary(distribution, currentPrice),
  });
});

// GET /api/v1/chips/board?code=BK1027&days=250&bins=48
// 行业筹码分布：用行业板块指数日K线（stock-sdk 东方财富 BK 指数）计算成本分布。
chipsRoute.get("/board", async (c) => {
  const code = c.req.query("code");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? "250"), 30), 2000);
  const bins = Math.min(Math.max(Number(c.req.query("bins") ?? "48"), 20), 100);

  if (!code) return badRequest(c, "code is required");

  const sdk = new StockSDK();
  let klines: Array<{ date: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null }>;
  try {
    klines = await sdk.board.industry.kline(code, { period: "daily", adjust: "qfq" });
  } catch (error) {
    console.error(`[chips] board ${code} kline failed:`, error);
    return ok(c, null);
  }

  const bars: DailyBar[] = klines
    .filter((k) => k.date && k.high != null && k.low != null && k.close != null)
    .slice(-days)
    .map((k) => ({
      time: new Date(k.date),
      open: k.open ?? k.close ?? 0,
      high: k.high ?? 0,
      low: k.low ?? 0,
      close: k.close ?? 0,
      volume: k.volume ?? 0,
    }));

  if (bars.length === 0) return ok(c, null);

  const distribution = computeChipDistribution(bars, bins);
  const currentPrice = bars[bars.length - 1]!.close;

  return ok(c, {
    boardCode: code,
    ...buildSummary(distribution, currentPrice),
  });
});

/** 由分布数组构建汇总指标（个股 / 行业共用） */
function buildSummary(distribution: PricePoint[], currentPrice: number) {
  const totalCost = distribution.reduce((s, p) => s + p.percent, 0) || 1;
  const avgCost =
    distribution.reduce((s, p) => s + p.price * p.percent, 0) / totalCost;
  const profitRatio = distribution
    .filter((p) => p.price <= currentPrice)
    .reduce((s, p) => s + p.percent, 0);

  const { low: cost90Low, high: cost90High } = costRange(distribution, 90);
  const { low: cost70Low, high: cost70High } = costRange(distribution, 70);

  return {
    currentPrice,
    avgCost: round(avgCost, 2),
    profitRatio: round(profitRatio, 2),
    cost90: { low: round(cost90Low, 2), high: round(cost90High, 2) },
    cost70: { low: round(cost70Low, 2), high: round(cost70High, 2) },
    distribution,
  };
}

/**
 * 三角形分布筹码计算。
 *
 * @param bars    按时间正序的日线数组
 * @param bins    价格档位数
 * @param decay   历史衰减系数（每往前一天筹码衰减到 ×decay），1 表示不衰减
 */
export function computeChipDistribution(
  bars: DailyBar[],
  bins = 48,
  decay = 1,
): PricePoint[] {
  if (bars.length === 0) return [];

  const minP = Math.min(...bars.map((b) => b.low));
  const maxP = Math.max(...bars.map((b) => b.high));
  if (minP >= maxP) return [];

  const step = (maxP - minP) / bins;
  // 每个档位的累计筹码量
  const cost = new Array<number>(bins).fill(0);
  // 档位中值（用于输出）
  const mid = Array.from({ length: bins }, (_, i) => minP + step * (i + 0.5));

  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const bar = bars[i]!;
    const age = n - 1 - i; // 距今天数，越远越旧
    const weight = Math.pow(decay, age);

    // 每根 K 线：把成交量按三角形分布摊到 [low, high] 覆盖的档位
    const lo = Math.max(0, Math.floor((bar.low - minP) / step));
    const hi = Math.min(bins - 1, Math.floor((bar.high - minP) / step));

    for (let j = lo; j <= hi; j++) {
      const p = mid[j]!;
      if (p < bar.low || p > bar.high) continue;

      // 三角形权重：峰值在 close，两端线性归零
      let tri: number;
      if (p <= bar.close) {
        tri = bar.close > bar.low ? (p - bar.low) / (bar.close - bar.low) : 1;
      } else {
        tri = bar.high > bar.close ? (bar.high - p) / (bar.high - bar.close) : 1;
      }

      cost[j] = (cost[j] ?? 0) + bar.volume * tri * weight;
    }
  }

  const total = cost.reduce((s, v) => s + v, 0) || 1;

  // 归一化为百分比，并计算累计占比
  const result: PricePoint[] = [];
  let cum = 0;
  for (let i = 0; i < bins; i++) {
    const percent = (cost[i]! / total) * 100;
    cum += percent;
    result.push({ price: round(mid[i]!, 2), percent: round(percent, 3), cumPercent: round(cum, 3) });
  }
  return result;
}

/** 找出占比之和达到 pct% 的价格区间 */
function costRange(dist: PricePoint[], pct: number): { low: number; high: number } {
  // 从两端向中间收缩，直到剩余区间累计占比 >= pct%
  let lo = 0;
  let hi = dist.length - 1;
  let covered = dist.reduce((s, p) => s + p.percent, 0);
  while (lo < hi && covered > pct) {
    if (dist[lo]!.percent <= dist[hi]!.percent) {
      covered -= dist[lo]!.percent;
      lo++;
    } else {
      covered -= dist[hi]!.percent;
      hi--;
    }
  }
  return { low: dist[lo]!.price, high: dist[hi]!.price };
}

function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export { chipsRoute };
