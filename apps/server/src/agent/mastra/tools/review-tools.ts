/**
 * review-tools — 复盘 agent 的专用工具（全部从数据库读取）。
 *
 * 提供复盘所需的六大数据源：
 *   1. getReviewSkill       从 review_skill 表动态读取复盘方法论（前端可编辑）
 *   2. getFundFlowRank      从 fund_flow_rank 表读取行业/概念/个股资金流排行
 *   3. getBoardConstituents 从 board_constituent 表读取板块核心成分股
 *   4. getDailyBoardChanges 从 board_history 表计算当日板块异动（对比上一交易日）
 *   5. getConsecutiveLimitUp 从 bar1d_adj 表按涨幅阈值统计连板（≥3 连板）
 *   6. getStockPoolChange   从 stock_pool 表对比今日与上一交易日选股池变动
 *
 * 核心设计：每个工具背后都对应一个「导出的数据访问函数」（getXxxData），
 * 供 agent 工具 execute 与 API 层（api/reviews.ts 组装结构化模块）复用，
 * 避免两处维护同一套 DB 查询逻辑。
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db";
import {
  reviewSkill,
  stockPool,
  fundFlowRank,
  boardConstituent,
  boardHistory,
  bar1dAdj,
  instrument,
  limitUpPool,
} from "../../../db/schema";
import { eq, desc, and, gte, lte, lt, inArray } from "drizzle-orm";

/** 数值 → number | null（drizzle numeric 返回 string） */
function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

/** 根据标的代码与名称判断涨停阈值（近似）：ST 5%、创业板/科创板 20%、主板 10% */
function limitUpThreshold(symbol: string, name: string | null): number {
  if (name && (name.startsWith("ST") || name.startsWith("*ST") || name.startsWith("N"))) {
    return 4.8;
  }
  const isGEM = symbol.endsWith(".SZ") && /^(300|301)/.test(symbol);
  const isSTAR = symbol.endsWith(".SH") && /^(688|689)/.test(symbol);
  if (isGEM || isSTAR) return 19.8;
  return 9.8;
}

// ---------- 数据访问函数（导出，供 agent 工具与 API 复用） ----------

export interface FundFlowRankItem {
  code: string;
  name: string;
  rank: number;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  price: number | null;
  topStockCode: string | null;
  topStockName: string | null;
}

/** 读取资金流排行（行业 / 概念 / 个股），缺省取该分类最新快照日期 */
export async function getFundFlowRankData(
  category: "industry" | "concept" | "stock",
  date?: string,
  limit = 10,
): Promise<{ category: string; date: string | null; items: FundFlowRankItem[] }> {
  const capped = Math.min(limit, 50);
  let targetDate = date ?? null;
  if (!targetDate) {
    const latest = await db
      .selectDistinct({ date: fundFlowRank.date })
      .from(fundFlowRank)
      .where(eq(fundFlowRank.category, category))
      .orderBy(desc(fundFlowRank.date))
      .limit(1);
    targetDate = latest[0]?.date ?? null;
  }
  if (!targetDate) return { category, date: null, items: [] };

  const rows = await db
    .select()
    .from(fundFlowRank)
    .where(and(eq(fundFlowRank.category, category), eq(fundFlowRank.date, targetDate)))
    .orderBy(fundFlowRank.rank)
    .limit(capped);

  return {
    category,
    date: targetDate,
    items: rows.map((r) => ({
      code: r.code,
      name: r.name,
      rank: r.rank,
      changePercent: n(r.changePercent),
      mainNetInflow: n(r.mainNetInflow),
      mainNetInflowPercent: n(r.mainNetInflowPercent),
      superLargeNetInflow: n(r.superLargeNetInflow),
      largeNetInflow: n(r.largeNetInflow),
      mediumNetInflow: n(r.mediumNetInflow),
      smallNetInflow: n(r.smallNetInflow),
      price: n(r.price),
      topStockCode: r.topStockCode,
      topStockName: r.topStockName,
    })),
  };
}

/** 读取板块成分股（按涨跌幅降序） */
export async function getBoardConstituentsData(
  boardCode: string,
  limit = 10,
): Promise<{
  boardCode: string;
  items: Array<{
    symbol: string;
    name: string;
    changePercent: number | null;
    turnoverRate: number | null;
    amount: number | null;
  }>;
}> {
  const capped = Math.min(limit, 50);
  const rows = await db
    .select({
      symbol: boardConstituent.symbol,
      name: boardConstituent.name,
      changePercent: boardConstituent.changePercent,
      turnoverRate: boardConstituent.turnoverRate,
      amount: boardConstituent.amount,
    })
    .from(boardConstituent)
    .where(eq(boardConstituent.boardCode, boardCode))
    .limit(capped);

  return {
    boardCode,
    items: rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      changePercent: n(r.changePercent),
      turnoverRate: n(r.turnoverRate),
      amount: n(r.amount),
    })),
  };
}

/** 主线项（四维加权评分生成）：方向持续性 + 资金确认 + 龙头情绪 + 赚钱效应，总分 100 */
export interface MainlineItem {
  boardCode: string;
  boardName: string;
  score: number;
  directionScore: number;
  fundScore: number;
  leaderScore: number;
  effectScore: number;
  coreStocks: string[];
  reason: string;
}

/** 封板强度打分：一字板 > T字板 > 换手板 > 其他（满分 5） */
function limitTypeScore(limitType: string | null): number {
  if (!limitType) return 1;
  if (limitType.includes("一字")) return 5;
  if (limitType.includes("T字") || limitType.includes("T 字")) return 3.5;
  if (limitType.includes("换手")) return 2;
  return 1;
}

/** min-max 归一化：values → [0,1]，全相等时返回 0.5（避免除零） */
function normalize(values: number[]): number[] {
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * 主线评分模型（行业板块粒度，总分 100）：
 *   ① 方向持续性 25 = 近3日累计涨幅(15) + 近5日上涨天数(10)      ← board_history
 *   ② 资金确认   30 = 主力净流入额(18) + 净占比(12)              ← fund_flow_rank
 *   ③ 龙头情绪   25 = 涨停家数(10) + 最高连板(10) + 封板强度(5)   ← limit_up_pool
 *   ④ 赚钱效应   20 = 板块涨幅(8) + 上涨家数占比(7) + 炸板率(5)   ← board_history/board_constituent/limit_up_pool
 *
 * 候选板块 = 当日涨停池涉及的行业（industry 去重）。各子指标在候选内做 min-max 归一化，
 * 越高的子指标（如连板、净流入）取原始值，越低的子指标（炸板率）取反向值。
 */
export async function getMainlineData(
  date?: string,
  limit = 5,
): Promise<{ date: string | null; items: MainlineItem[] }> {
  const capped = Math.min(limit, 10);

  // 1. 解析目标交易日（缺省取涨停池最新快照日期）
  let targetDate = date ?? null;
  if (!targetDate) {
    const latest = await db
      .selectDistinct({ date: limitUpPool.date })
      .from(limitUpPool)
      .orderBy(desc(limitUpPool.date))
      .limit(1);
    targetDate = latest[0]?.date ?? null;
  }
  if (!targetDate) return { date: null, items: [] };

  // 2. 当日涨停池（含封板 + 炸板，用于涨停家数 / 炸板率 / 连板 / 封板强度）
  const poolRows = await db
    .select()
    .from(limitUpPool)
    .where(eq(limitUpPool.date, targetDate));
  if (poolRows.length === 0) return { date: targetDate, items: [] };

  // 3. 行业资金流（category=industry，取 <= targetDate 的最新交易日全量，含 BK 代码用于关联成分股）
  const fundDateRow = await db
    .selectDistinct({ date: fundFlowRank.date })
    .from(fundFlowRank)
    .where(and(eq(fundFlowRank.category, "industry"), lte(fundFlowRank.date, targetDate)))
    .orderBy(desc(fundFlowRank.date))
    .limit(1);
  const fundDate = fundDateRow[0]?.date ?? null;

  // 4. 行业板块历史（type=industry，取 <= targetDate 的最新 5 个交易日，用于方向持续性 / 板块涨幅）
  const histDates = await db
    .selectDistinct({ date: boardHistory.date })
    .from(boardHistory)
    .where(and(eq(boardHistory.type, "industry"), lte(boardHistory.date, targetDate)))
    .orderBy(desc(boardHistory.date))
    .limit(5);

  // ---------- 候选行业聚合（从涨停池按 industry 去重） ----------
  interface Agg {
    name: string;
    limitUpCount: number; // 封板家数
    bustCount: number; // 炸板家数
    maxConsecutive: number; // 最高连板数
    sealStrength: number; // 封板强度（取最强封板）
    stocks: Array<{ name: string; limitUpCount: number }>;
  }
  const byName = new Map<string, Agg>();
  for (const r of poolRows) {
    const industry = r.industry?.trim();
    if (!industry) continue;
    let agg = byName.get(industry);
    if (!agg) {
      agg = {
        name: industry,
        limitUpCount: 0,
        bustCount: 0,
        maxConsecutive: 0,
        sealStrength: 0,
        stocks: [],
      };
      byName.set(industry, agg);
    }
    if (r.isLimitUp) {
      agg.limitUpCount += 1;
      agg.sealStrength = Math.max(agg.sealStrength, limitTypeScore(r.limitType));
    } else {
      agg.bustCount += 1;
    }
    agg.maxConsecutive = Math.max(agg.maxConsecutive, r.limitUpCount);
    agg.stocks.push({ name: r.name, limitUpCount: r.limitUpCount });
  }

  // ---------- 行业资金流 name → 数据 映射 ----------
  const fundMap = new Map<
    string,
    { code: string; mainNetInflow: number; netInflowPct: number }
  >();
  if (fundDate) {
    const fundRows = await db
      .select({
        code: fundFlowRank.code,
        name: fundFlowRank.name,
        mainNetInflow: fundFlowRank.mainNetInflow,
        mainNetInflowPercent: fundFlowRank.mainNetInflowPercent,
      })
      .from(fundFlowRank)
      .where(and(eq(fundFlowRank.category, "industry"), eq(fundFlowRank.date, fundDate)));
    for (const r of fundRows) {
      fundMap.set(r.name, {
        code: r.code,
        mainNetInflow: n(r.mainNetInflow) ?? 0,
        netInflowPct: n(r.mainNetInflowPercent) ?? 0,
      });
    }
  }

  // ---------- 行业板块历史 name → 近5日涨幅序列 映射 ----------
  const histMap = new Map<string, { code: string; pcts: number[] }>();
  if (histDates.length > 0) {
    const dateList = histDates.map((d) => d.date);
    const histRows = await db
      .select({
        code: boardHistory.code,
        name: boardHistory.name,
        changePercent: boardHistory.changePercent,
      })
      .from(boardHistory)
      .where(and(eq(boardHistory.type, "industry"), inArray(boardHistory.date, dateList)));
    for (const r of histRows) {
      const pct = n(r.changePercent);
      let cur = histMap.get(r.name);
      if (!cur) {
        cur = { code: r.code, pcts: [] };
        histMap.set(r.name, cur);
      }
      if (pct != null) cur.pcts.push(pct);
    }
  }

  // ---------- 批量读取候选行业成分股，算上涨家数占比 ----------
  const candidateNames = [...byName.keys()];
  const codeToName = new Map<string, string>(); // BK code → 行业名
  for (const name of candidateNames) {
    const f = fundMap.get(name);
    const h = histMap.get(name);
    const code = f?.code ?? h?.code;
    if (code) codeToName.set(code, name);
  }
  const upRatioMap = new Map<string, number>(); // 行业名 → 上涨家数占比 0~1
  if (codeToName.size > 0) {
    const consRows = await db
      .select({
        boardCode: boardConstituent.boardCode,
        changePercent: boardConstituent.changePercent,
      })
      .from(boardConstituent)
      .where(inArray(boardConstituent.boardCode, [...codeToName.keys()]));
    const byCode = new Map<string, { total: number; up: number }>();
    for (const r of consRows) {
      let cur = byCode.get(r.boardCode);
      if (!cur) {
        cur = { total: 0, up: 0 };
        byCode.set(r.boardCode, cur);
      }
      cur.total += 1;
      if ((n(r.changePercent) ?? 0) > 0) cur.up += 1;
    }
    for (const [code, name] of codeToName) {
      const cur = byCode.get(code);
      upRatioMap.set(name, cur && cur.total > 0 ? cur.up / cur.total : 0);
    }
  }

  // ---------- 组装原始指标 ----------
  interface Raw {
    name: string;
    code: string;
    coreStocks: string[];
    sum3d: number; // 近3日累计涨幅
    upDays5: number; // 近5日上涨天数
    mainNetInflow: number;
    netInflowPct: number;
    limitUpCount: number;
    maxConsecutive: number;
    sealStrength: number;
    boardPct: number; // 当日板块涨幅
    upRatio: number; // 上涨家数占比 0~1
    bustRatio: number; // 炸板率 0~1
  }
  const raws: Raw[] = [];
  for (const [name, agg] of byName) {
    const hist = histMap.get(name);
    const pcts = hist?.pcts ?? [];
    const code = fundMap.get(name)?.code ?? hist?.code ?? "";
    const fund = fundMap.get(name);

    // 方向持续性：近3日累计涨幅 + 近5日上涨天数（pcts 为按日期降序，最新在前）
    const last5 = pcts.slice(0, 5);
    const sum3d = last5.slice(0, 3).reduce((s, p) => s + p, 0);
    const upDays5 = last5.filter((p) => p > 0).length;

    // 封板股按连板数降序，龙头取前 3
    const leaders = agg.stocks
      .filter((s) => s.limitUpCount > 0)
      .sort((a, b) => b.limitUpCount - a.limitUpCount)
      .slice(0, 3)
      .map((s) => s.name);

    const total = agg.limitUpCount + agg.bustCount;
    raws.push({
      name,
      code,
      coreStocks: leaders,
      sum3d,
      upDays5,
      mainNetInflow: fund?.mainNetInflow ?? 0,
      netInflowPct: fund?.netInflowPct ?? 0,
      limitUpCount: agg.limitUpCount,
      maxConsecutive: agg.maxConsecutive,
      sealStrength: agg.sealStrength,
      boardPct: pcts[0] ?? 0,
      upRatio: upRatioMap.get(name) ?? 0,
      bustRatio: total > 0 ? agg.bustCount / total : 0,
    });
  }

  // ---------- 子指标归一化（越高越好的指标先 clip 到 >= 0） ----------
  const clip = (vals: number[]) => vals.map((v) => Math.max(v, 0));
  const nSum3d = normalize(clip(raws.map((r) => r.sum3d)));
  const nNetInflow = normalize(clip(raws.map((r) => r.mainNetInflow)));
  const nNetPct = normalize(clip(raws.map((r) => r.netInflowPct)));
  const nLimitUp = normalize(raws.map((r) => r.limitUpCount));
  const nConsec = normalize(raws.map((r) => r.maxConsecutive));
  const nSeal = normalize(raws.map((r) => r.sealStrength));
  const nBoardPct = normalize(clip(raws.map((r) => r.boardPct)));

  const items: MainlineItem[] = raws.map((r, i) => {
    // ① 方向持续性 25：近3日累计涨幅(15) + 近5日上涨天数(10，按比例)
    const directionScore = nSum3d[i]! * 15 + (r.upDays5 / 5) * 10;
    // ② 资金确认 30：主力净流入额(18) + 净占比(12)
    const fundScore = nNetInflow[i]! * 18 + nNetPct[i]! * 12;
    // ③ 龙头情绪 25：涨停家数(10) + 最高连板(10) + 封板强度(5)
    const leaderScore = nLimitUp[i]! * 10 + nConsec[i]! * 10 + nSeal[i]! * 5;
    // ④ 赚钱效应 20：板块涨幅(8) + 上涨家数占比(7) + 炸板率(5，越低越好)
    const effectScore = nBoardPct[i]! * 8 + r.upRatio * 7 + (1 - r.bustRatio) * 5;

    const score = directionScore + fundScore + leaderScore + effectScore;
    return {
      boardCode: r.code,
      boardName: r.name,
      score: Number(score.toFixed(1)),
      directionScore: Number(directionScore.toFixed(1)),
      fundScore: Number(fundScore.toFixed(1)),
      leaderScore: Number(leaderScore.toFixed(1)),
      effectScore: Number(effectScore.toFixed(1)),
      coreStocks: r.coreStocks,
      reason: `方向${directionScore.toFixed(0)}/资金${fundScore.toFixed(0)}/情绪${leaderScore.toFixed(0)}/效应${effectScore.toFixed(0)}，涨停${r.limitUpCount}家最高${r.maxConsecutive}板，龙头${r.coreStocks.join("、") || "—"}`,
    };
  });

  items.sort((a, b) => b.score - a.score);
  return { date: targetDate, items: items.slice(0, capped) };
}

/** 当日板块异动：对比 board_history 最近两个交易日涨跌幅，取 delta 最大者 */
export async function getDailyBoardChangesData(
  type: "industry" | "concept",
  limit = 5,
): Promise<{
  type: string;
  date: string | null;
  items: Array<{ code: string; name: string; changePercent: number | null; delta: number | null }>;
}> {
  const capped = Math.min(limit, 50);
  const dates = await db
    .selectDistinct({ date: boardHistory.date })
    .from(boardHistory)
    .where(eq(boardHistory.type, type))
    .orderBy(desc(boardHistory.date))
    .limit(2);

  // 只有一天快照：退化为当日涨幅榜
  if (dates.length < 2) {
    const only = dates[0]?.date ?? null;
    if (!only) return { type, date: null, items: [] };
    const rows = await db
      .select()
      .from(boardHistory)
      .where(and(eq(boardHistory.type, type), eq(boardHistory.date, only)))
      .limit(capped);
    const parsed = rows
      .map((r) => ({ code: r.code, name: r.name, changePercent: n(r.changePercent) }))
      .filter((r) => r.changePercent != null)
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
      .slice(0, capped);
    return { type, date: only, items: parsed.map((r) => ({ ...r, delta: null })) };
  }

  const today = dates[0]!.date;
  const prev = dates[1]!.date;
  const rows = await db
    .select()
    .from(boardHistory)
    .where(and(eq(boardHistory.type, type), eq(boardHistory.date, today)));

  const prevRows = await db
    .select({ code: boardHistory.code, changePercent: boardHistory.changePercent })
    .from(boardHistory)
    .where(and(eq(boardHistory.type, type), eq(boardHistory.date, prev)));

  const prevMap = new Map(prevRows.map((r) => [r.code, n(r.changePercent)]));

  const items = rows
    .map((r) => {
      const cur = n(r.changePercent);
      const prevPct = prevMap.get(r.code) ?? null;
      const delta = cur != null && prevPct != null ? cur - prevPct : null;
      return { code: r.code, name: r.name, changePercent: cur, delta };
    })
    .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity))
    .slice(0, capped);

  return { type, date: today, items };
}

/** 连板统计：从 bar1d_adj 全市场日 K 按涨停阈值统计连续涨停天数 */
export async function getConsecutiveLimitUpData(
  date?: string,
  minConsecutive = 3,
  limit = 5,
): Promise<{
  date: string | null;
  items: Array<{
    symbol: string;
    name: string | null;
    consecutiveCount: number;
    changePercent: number | null;
    lastPrice: number | null;
  }>;
}> {
  const minC = Math.max(minConsecutive, 2);
  const capped = Math.min(limit, 50);

  let target: Date;
  if (date) {
    target = new Date(`${date}T00:00:00`);
  } else {
    const latest = await db
      .select({ time: bar1dAdj.time })
      .from(bar1dAdj)
      .orderBy(desc(bar1dAdj.time))
      .limit(1);
    if (latest.length === 0) return { date: null, items: [] };
    target = latest[0]!.time;
  }
  const targetDate = target.toISOString().slice(0, 10);

  const recentDates = await db
    .selectDistinct({ time: bar1dAdj.time })
    .from(bar1dAdj)
    .where(lte(bar1dAdj.time, target))
    .orderBy(desc(bar1dAdj.time))
    .limit(16);
  if (recentDates.length === 0) return { date: targetDate, items: [] };
  const start = recentDates[recentDates.length - 1]!.time;

  const bars = await db
    .select({
      symbol: bar1dAdj.symbol,
      time: bar1dAdj.time,
      close: bar1dAdj.close,
    })
    .from(bar1dAdj)
    .where(and(gte(bar1dAdj.time, start), lte(bar1dAdj.time, target)));

  const insts = await db
    .select({ symbol: instrument.symbol, name: instrument.name })
    .from(instrument);
  const nameMap = new Map(insts.map((i) => [i.symbol, i.name]));

  const bySymbol = new Map<string, { time: Date; close: number }[]>();
  for (const b of bars) {
    const list = bySymbol.get(b.symbol) ?? [];
    list.push({ time: b.time, close: Number(b.close) });
    bySymbol.set(b.symbol, list);
  }

  const result: Array<{
    symbol: string;
    name: string | null;
    consecutiveCount: number;
    changePercent: number | null;
    lastPrice: number | null;
  }> = [];

  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime());
    const last = list[list.length - 1]!;
    if (last.time.toISOString().slice(0, 10) !== targetDate) continue;

    const name = nameMap.get(symbol) ?? null;
    const threshold = limitUpThreshold(symbol, name);

    let count = 0;
    for (let i = list.length - 1; i >= 1; i--) {
      const prevClose = list[i - 1]!.close;
      const close = list[i]!.close;
      if (prevClose <= 0) break;
      const pct = ((close - prevClose) / prevClose) * 100;
      if (pct >= threshold) count++;
      else break;
    }

    if (count < minC) continue;

    const prevClose = list.length >= 2 ? list[list.length - 2]!.close : null;
    const changePercent =
      prevClose != null && prevClose > 0 ? ((last.close - prevClose) / prevClose) * 100 : null;

    result.push({
      symbol,
      name,
      consecutiveCount: count,
      changePercent: changePercent != null ? Number(changePercent.toFixed(2)) : null,
      lastPrice: last.close,
    });
  }

  result.sort((a, b) => b.consecutiveCount - a.consecutiveCount);
  return { date: targetDate, items: result.slice(0, capped) };
}

export interface StockPoolItem {
  symbol: string;
  name: string;
  source: string | null;
  score: string | null;
}

/** 读取某交易日选股池，并与上一交易日对比（新增 / 移除） */
export async function getStockPoolChangeData(date: string): Promise<{
  date: string;
  prevDate: string | null;
  today: StockPoolItem[];
  added: StockPoolItem[];
  removed: StockPoolItem[];
}> {
  const select = {
    symbol: stockPool.symbol,
    name: stockPool.name,
    source: stockPool.source,
    score: stockPool.score,
  };

  const todayRows = await db.select(select).from(stockPool).where(eq(stockPool.date, date));

  const prevDates = await db
    .selectDistinct({ date: stockPool.date })
    .from(stockPool)
    .where(lt(stockPool.date, date))
    .orderBy(desc(stockPool.date))
    .limit(1);
  const prevDate = prevDates[0]?.date ?? null;

  let prevRows: typeof todayRows = [];
  if (prevDate) {
    prevRows = await db.select(select).from(stockPool).where(eq(stockPool.date, prevDate));
  }

  const prevSet = new Set(prevRows.map((r) => r.symbol));
  const todaySet = new Set(todayRows.map((r) => r.symbol));

  return {
    date,
    prevDate,
    today: todayRows,
    added: todayRows.filter((r) => !prevSet.has(r.symbol)),
    removed: prevRows.filter((r) => !todaySet.has(r.symbol)),
  };
}

// ---------- agent tools ----------

/** 读取复盘 skill（方法论 + UI 模块配置），前端可展示/编辑 */
export const getReviewSkillTool = createTool({
  id: "getReviewSkill",
  description:
    "读取复盘 skill（复盘方法论提示词 + UI 模块配置）。生成复盘前必须先调用本工具，严格遵循其中的方法论。",
  inputSchema: z.object({
    name: z.string().default("default").describe("skill 名称，默认 default"),
  }),
  outputSchema: z.object({
    name: z.string(),
    content: z.unknown(),
  }),
  execute: async ({ name }) => {
    const rows = await db
      .select({ content: reviewSkill.content })
      .from(reviewSkill)
      .where(eq(reviewSkill.name, name));
    return { name, content: rows[0]?.content ?? null };
  },
});

const fundFlowItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  rank: z.number(),
  changePercent: z.number().nullable(),
  mainNetInflow: z.number().nullable(),
  mainNetInflowPercent: z.number().nullable(),
  superLargeNetInflow: z.number().nullable(),
  largeNetInflow: z.number().nullable(),
  mediumNetInflow: z.number().nullable(),
  smallNetInflow: z.number().nullable(),
  price: z.number().nullable(),
  topStockCode: z.string().nullable(),
  topStockName: z.string().nullable(),
});

/** 资金流排行（行业 / 概念 / 个股），从 fund_flow_rank 表读取 */
export const fundFlowRankTool = createTool({
  id: "getFundFlowRank",
  description:
    "获取 A 股资金流排行（从数据库快照读取，非实时）：category 为 industry（行业）/ concept（概念）/ stock（个股）。" +
    "返回主力净流入等资金流指标，用于判断当日资金主线方向。",
  inputSchema: z.object({
    category: z.enum(["industry", "concept", "stock"]).describe("分类：行业 / 概念 / 个股"),
    date: z.string().optional().describe("交易日 YYYY-MM-DD，缺省取最新快照日期"),
    limit: z.number().default(10).describe("返回前 N 名，最大 50"),
  }),
  outputSchema: z.object({
    category: z.string(),
    date: z.string().nullable(),
    items: z.array(fundFlowItemSchema),
  }),
  execute: async ({ category, date, limit }) => getFundFlowRankData(category, date, limit),
});

/** 板块成分股（核心个股），从 board_constituent 表读取 */
export const boardConstituentsTool = createTool({
  id: "getBoardConstituents",
  description:
    "获取指定板块的成分股列表（从数据库读取），按涨跌幅降序。用于识别主线板块中的核心个股。",
  inputSchema: z.object({
    boardCode: z.string().describe("板块代码，如 BK1027"),
    limit: z.number().default(10).describe("返回前 N 名，最大 50"),
  }),
  outputSchema: z.object({
    boardCode: z.string(),
    items: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        changePercent: z.number().nullable(),
        turnoverRate: z.number().nullable(),
        amount: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ boardCode, limit }) => getBoardConstituentsData(boardCode, limit),
});

/** 主线（规则化）：四维加权评分（方向持续性 + 资金确认 + 龙头情绪 + 赚钱效应），不依赖 LLM */
export const mainlineTool = createTool({
  id: "getMainline",
  description:
    "规则化生成当日主线（top N 行业板块 + 龙头股）。四维加权评分总分 100：" +
    "方向持续性(25，近3日涨幅+近5日上涨天数)、资金确认(30，主力净流入额+净占比)、" +
    "龙头情绪(25，涨停家数+最高连板+封板强度)、赚钱效应(20，板块涨幅+上涨家数占比+炸板率)。" +
    "返回结果已含每维得分与理由，可直接作为主线模块渲染。",
  inputSchema: z.object({
    date: z.string().optional().describe("交易日 YYYY-MM-DD，缺省取最新涨停池快照日期"),
    limit: z.number().default(5).describe("返回前 N 条主线，最大 10"),
  }),
  outputSchema: z.object({
    date: z.string().nullable(),
    items: z.array(
      z.object({
        boardCode: z.string(),
        boardName: z.string(),
        score: z.number(),
        directionScore: z.number(),
        fundScore: z.number(),
        leaderScore: z.number(),
        effectScore: z.number(),
        coreStocks: z.array(z.string()),
        reason: z.string(),
      }),
    ),
  }),
  execute: async ({ date, limit }) => getMainlineData(date, limit),
});

/** 当日板块异动，从 board_history 表对比计算 */
export const dailyBoardChangesTool = createTool({
  id: "getDailyBoardChanges",
  description:
    "获取当日板块异动 top N（从 board_history 快照对比上一交易日涨跌幅变化幅度 delta，降序）。" +
    "type 为 industry / concept。",
  inputSchema: z.object({
    type: z.enum(["industry", "concept"]).default("industry").describe("板块类型"),
    limit: z.number().default(5).describe("返回前 N 名，最大 50"),
  }),
  outputSchema: z.object({
    type: z.string(),
    date: z.string().nullable(),
    items: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        changePercent: z.number().nullable(),
        delta: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ type, limit }) => getDailyBoardChangesData(type, limit),
});

/** 连板统计，从 bar1d_adj 表按涨幅阈值计算 */
export const consecutiveLimitUpTool = createTool({
  id: "getConsecutiveLimitUp",
  description:
    "统计连续涨停（连板）的个股：从 bar1d_adj 日 K 按涨停阈值（ST≈4.8%、创业板/科创板≈19.8%、主板≈9.8%）" +
    "计算连续涨停天数，筛选 >= minConsecutive（默认 3 连板及以上）的个股，按连板数降序。",
  inputSchema: z.object({
    date: z.string().optional().describe("目标交易日 YYYY-MM-DD，缺省取最新交易日"),
    minConsecutive: z.number().default(3).describe("最低连板数，默认 3"),
    limit: z.number().default(5).describe("返回前 N 名，最大 50"),
  }),
  outputSchema: z.object({
    date: z.string().nullable(),
    items: z.array(
      z.object({
        symbol: z.string(),
        name: z.string().nullable(),
        consecutiveCount: z.number(),
        changePercent: z.number().nullable(),
        lastPrice: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ date, minConsecutive, limit }) =>
    getConsecutiveLimitUpData(date, minConsecutive, limit),
});

/** 选股池变动，从 stock_pool 表对比 */
export const stockPoolChangeTool = createTool({
  id: "getStockPoolChange",
  description:
    "读取指定交易日的自选股票池，并与上一交易日对比，返回今日列表 + 新增 + 移除，用于评估选股与主线匹配度。",
  inputSchema: z.object({
    date: z.string().describe("交易日，格式 YYYY-MM-DD"),
  }),
  outputSchema: z.object({
    date: z.string(),
    prevDate: z.string().nullable(),
    today: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        source: z.string().nullable(),
        score: z.string().nullable(),
      }),
    ),
    added: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        source: z.string().nullable(),
        score: z.string().nullable(),
      }),
    ),
    removed: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        source: z.string().nullable(),
        score: z.string().nullable(),
      }),
    ),
  }),
  execute: async ({ date }) => getStockPoolChangeData(date),
});
