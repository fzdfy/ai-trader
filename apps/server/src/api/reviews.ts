/**
 * 复盘 API — 挂载于 /api/v1/reviews
 *
 * 提供：
 *   GET  /skill           读取复盘方法论（instructions）
 *   PUT  /skill           编辑复盘方法论
 *   POST /generate        生成/重新生成某交易日复盘（一次性返回）
 *   POST /generate/stream 流式生成（结构化模块就绪即推送，总结压轴）
 *   GET  /list            复盘日期列表（回放选择用）
 *   GET  /mainline        规则化主线（独立接口，date/limit 可选）
 *   GET  /:date           回放某交易日复盘
 *
 * 八大模块（固定，代码写死顺序/标题/图表类型，与 skill「复盘模块」1~7 对齐）：
 *   1. fundflow        资金流向（行业 / 概念 / 个股 top5，来自 fund_flow_rank 表）
 *   2. mainline        主线（规则化：四维加权评分，来自涨停池 + 资金流 + 板块历史）
 *   3. limitup_pool    涨停池/连板梯队（连板梯队/封板/题材，来自 limit_up_pool 表）
 *   4. market_emotion  市场情绪温度（0~100，来自 limit_up_pool 口径化）
 *   5. boardchange     当日板块异动（top5，来自 board_history 表对比）
 *   6. limitup         3 连板及以上（top5，来自 bar1d_adj 表按涨幅阈值统计）
 *   7. stockpool       今日自选股票池（列表 + 与上一交易日变动）
 *   8. summary         总结（agent 生成，输入为全部结构化模块数据）
 *
 * 结构化模块全部从数据库直接组装（快、稳）；agent 仅生成总结（压轴），
 * 输入为精选后的结构化数据，输出为纯文本，无 JSON 解析风险。
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db";
import { reviewSkill, reviewDaily } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, badRequest, serverError } from "../lib/response";
import { mastra } from "../agent/mastra";
import { loadDefaultMetric } from "../lib/metrics";
import {
  getFundFlowRankData,
  getDailyBoardChangesData,
  getConsecutiveLimitUpData,
  getStockPoolChangeData,
  getMainlineData,
  getLimitUpPoolData,
  getMarketEmotionData,
  type MainlineItem,
  type LimitUpPoolItem,
  type MarketEmotionResult,
} from "../agent/mastra/tools/review-tools";

const reviewsRoute = new Hono();

/** 默认复盘方法论（首次读取时种子写入；导出供一次性脚本更新已存在的旧 skill 记录） */
export const DEFAULT_INSTRUCTIONS = `你是专业的 A 股复盘分析师，负责对指定交易日进行复盘并产出「总结」。

## 复盘模块（按此结构组织）
1. 资金流向：行业/概念/个股主力净流入各 top5，识别资金聚焦方向。
2. 主线：方向持续性 + 资金确认 + 龙头情绪 + 赚钱效应加权，总分 100（口径以 getMainline 返回的 metric.instruction 为准）。
3. 涨停池/连板梯队：涨停家数、连板梯队（首板/二板/高度板）、炸板率、封板强度、题材归类。
4. 市场情绪温度：涨停规模 + 封板质量 + 连板高度加权，0~100 越高越热（口径以 getMarketEmotion 返回的 metric.instruction 为准）。
5. 板块异动：当日较上一交易日涨幅变化最大的板块（轮动信号）。
6. 连板：3 连板及以上个股，判断市场高度与赚钱效应。
7. 选股池：今日选股池与上一交易日的新增/移除，评估与主线匹配度。

## 总结输出要求
150 字左右，精炼、有观点，覆盖：大盘/资金面、主线方向、连板情绪（含情绪温度）、选股池点评、明日关注点。
用 Markdown 列表；结论必须有数据支撑，不得虚构。`;

/** 固定复盘模块（顺序 / 标题 / 图表类型写死，与 skill「复盘模块」1~7 对齐，前端按 type 渲染） */
const REVIEW_MODULES = [
  { type: "fundflow", title: "资金流向", chart: "fundflow" },
  { type: "mainline", title: "主线", chart: "mainline" },
  { type: "limitup_pool", title: "涨停池/连板梯队", chart: "limitup_pool" },
  { type: "market_emotion", title: "市场情绪温度", chart: "market_emotion" },
  { type: "boardchange", title: "当日板块异动", chart: "bar" },
  { type: "limitup", title: "3 连板及以上", chart: "table" },
  { type: "stockpool", title: "今日自选股票池", chart: "stockpool" },
  { type: "summary", title: "总结", chart: "text" },
] as const;

/** 确保存在默认方法论，返回 instructions 字符串 */
async function ensureInstructions(): Promise<string> {
  const rows = await db
    .select({ content: reviewSkill.content })
    .from(reviewSkill)
    .where(eq(reviewSkill.name, "default"));
  const content = rows[0]?.content as { instructions?: unknown } | undefined;
  if (content && typeof content.instructions === "string") return content.instructions;
  await db
    .insert(reviewSkill)
    .values({ name: "default", content: { instructions: DEFAULT_INSTRUCTIONS } })
    .onConflictDoNothing({ target: reviewSkill.name });
  return DEFAULT_INSTRUCTIONS;
}

/** 口径元数据快照（含当前生效的 preset/version/instruction，回放时口径冻结） */
interface MetricCtx {
  preset: string;
  version: number;
  displayName: string;
  instruction: string;
}

/**
 * 读取当前默认口径快照（mainline + market-emotion），供总结 agent 注入与落库快照。
 * 失败（如表尚未就绪）返回 null，调用方按无口径处理，不阻断复盘生成。
 */
async function loadMetricCtxs(): Promise<{
  mainline: MetricCtx | null;
  marketEmotion: MetricCtx | null;
}> {
  const load = async (kind: string): Promise<MetricCtx | null> => {
    try {
      const m = await loadDefaultMetric(kind);
      return {
        preset: m.preset,
        version: m.version,
        displayName: m.displayName,
        instruction: m.instruction,
      };
    } catch (err) {
      console.error(`[reviews] load ${kind} metric failed:`, (err as Error).message ?? err);
      return null;
    }
  };
  const [mainline, marketEmotion] = await Promise.all([load("mainline"), load("market-emotion")]);
  return { mainline, marketEmotion };
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 金额（元）→ 万/亿 中文量级 */
function fmtYuan(v: number | null | undefined): string {
  if (v == null) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v));
}

/**
 * 自描述复盘模块：type + title + chart（固定 REVIEW_MODULES）+ 渲染数据 data。
 * 前端据此动态渲染，按 type 分派到专用组件。
 */
interface ReviewSection {
  type: string;
  title: string;
  chart: string;
  data: unknown;
}

/** 八大模块的数据对象 */
interface ReviewData {
  fundflow: { industry: unknown[]; concept: unknown[]; stock: unknown[] };
  mainline: unknown[];
  limitUpPool: LimitUpPoolItem[];
  boardChanges: unknown[];
  limitUp: unknown[];
  stockPool: { today: unknown[]; added: unknown[]; removed: unknown[] };
  marketEmotion: MarketEmotionResult | null;
  summary: string;
}

/** 模块类型 → 数据源字段映射 */
const DATA_SOURCES: Record<
  string,
  | "fundflow"
  | "mainline"
  | "limitUpPool"
  | "marketEmotion"
  | "boardChanges"
  | "limitUp"
  | "stockPool"
  | "summary"
> = {
  fundflow: "fundflow",
  mainline: "mainline",
  limitup_pool: "limitUpPool",
  market_emotion: "marketEmotion",
  boardchange: "boardChanges",
  limitup: "limitUp",
  stockpool: "stockPool",
  summary: "summary",
};

/**
 * 依据固定 REVIEW_MODULES 与复盘数据，组装自描述的 sections。
 * 顺序、标题、图表类型写死；模块数据缺失时 data 为 null（前端按空状态处理）。
 */
function buildSections(data: ReviewData): ReviewSection[] {
  return REVIEW_MODULES.map((s) => {
    const source = DATA_SOURCES[s.type];
    return {
      type: s.type,
      title: s.title,
      chart: s.chart,
      data: source ? data[source] : null,
    };
  });
}

// ---------- 结构化数据获取（复用 agent 工具，全部从 DB 读取） ----------

/** 资金流：行业 / 概念 / 个股各 top5（从 fund_flow_rank 表） */
async function fetchFundFlow(date?: string): Promise<ReviewData["fundflow"]> {
  const [industry, concept, stock] = await Promise.all([
    getFundFlowRankData("industry", date, 5),
    getFundFlowRankData("concept", date, 5),
    getFundFlowRankData("stock", date, 5),
  ]);
  return { industry: industry.items, concept: concept.items, stock: stock.items };
}

/** 当日板块异动 top5（从 board_history 表对比上一交易日） */
async function fetchBoardChanges(): Promise<unknown[]> {
  const res = await getDailyBoardChangesData("industry", 5);
  return res.items;
}

/** 涨停池/连板梯队（从 limit_up_pool 表，按连板数降序，含封板/炸板/题材） */
async function fetchLimitUpPool(date?: string): Promise<LimitUpPoolItem[]> {
  const res = await getLimitUpPoolData(date, 100);
  return res.items;
}

/** 3 连板及以上 top5（从 bar1d_adj 表按涨幅阈值统计） */
async function fetchLimitUp(date?: string): Promise<unknown[]> {
  const res = await getConsecutiveLimitUpData(date, 3, 5);
  return res.items;
}

/** 今日选股池 + 与上一交易日变动（从 stock_pool 表） */
async function fetchStockPool(date: string): Promise<ReviewData["stockPool"]> {
  const res = await getStockPoolChangeData(date);
  return { today: res.today, added: res.added, removed: res.removed };
}

/**
 * 规则化生成主线：复用 review-tools 的 getMainlineData（单一数据源），
 * 基于行业资金流 + 板块成分股，不依赖 agent，快且稳定。
 */
async function buildMainline(date: string): Promise<MainlineItem[]> {
  const res = await getMainlineData(date);
  return res.items;
}

/** 将结构化复盘数据压缩为紧凑文本，注入 agent 提示词 */
function serializeReviewData(data: ReviewData): string {
  const lines: string[] = [];
  const flow = (v: unknown) => fmtYuan(typeof v === "number" ? v : null);
  const pct = (v: unknown) => (v == null ? "-" : `${v}%`);

  const fundRows = (rows: unknown[], label: string) => {
    const list = (rows as Array<Record<string, unknown>>) ?? [];
    lines.push(`【${label}】`);
    for (const r of list) {
      lines.push(`- ${r.name ?? "-"}: 主力净流入${flow(r.mainNetInflow)}，涨跌幅${pct(r.changePercent)}`);
    }
  };
  fundRows(data.fundflow.industry, "行业资金流向 Top5");
  fundRows(data.fundflow.concept, "概念资金流向 Top5");
  fundRows(data.fundflow.stock, "个股资金流向 Top5");

  lines.push("【主线】");
  for (const m of (data.mainline as MainlineItem[]) ?? []) {
    lines.push(`- ${m.boardName}: 核心股[${m.coreStocks.join("、")}] ${m.reason}`);
  }

  // 涨停池连板梯队摘要（封板股按连板数降序，供 agent 点评梯队高度与题材）
  const sealedPool = (data.limitUpPool ?? []).filter((r) => r.isLimitUp);
  if (sealedPool.length > 0) {
    const maxPool = Math.max(...sealedPool.map((r) => r.limitUpCount));
    const leaders = sealedPool
      .filter((r) => r.limitUpCount >= 2)
      .sort((a, b) => b.limitUpCount - a.limitUpCount)
      .slice(0, 8);
    lines.push("【涨停池/连板梯队】");
    lines.push(`- 封板 ${sealedPool.length} 家，最高 ${maxPool} 板`);
    for (const r of leaders) {
      lines.push(`- ${r.name}: ${r.limitUpCount}板（${r.industry ?? "—"}）`);
    }
  }

  lines.push("【当日板块异动 Top5】");
  for (const r of (data.boardChanges as Array<Record<string, unknown>>) ?? []) {
    lines.push(`- ${r.name ?? "-"}: 涨幅${pct(r.changePercent)}，异动${r.delta != null ? `+${r.delta}%` : "-"}`);
  }

  lines.push("【3 连板及以上】");
  for (const r of (data.limitUp as Array<Record<string, unknown>>) ?? []) {
    lines.push(`- ${r.name ?? r.symbol ?? "-"}: ${r.consecutiveCount}连板，涨跌幅${pct(r.changePercent)}`);
  }

  if (data.marketEmotion) {
    const e = data.marketEmotion;
    lines.push(
      `【市场情绪温度】${e.temperature} 度（涨停${e.limitUpCount}家、炸板率${(e.bustRate * 100).toFixed(1)}%、最高${e.maxConsecutive}连板）`,
    );
  }

  const pool = data.stockPool;
  const poolName = (r: unknown) => {
    const it = r as { name?: string; symbol?: string };
    return it.name ? `${it.name}(${it.symbol})` : (it.symbol ?? "-");
  };
  lines.push("【选股池】");
  lines.push(`- 今日 ${(pool.today ?? []).length} 只：${(pool.today as unknown[]).map(poolName).join("、") || "无"}`);
  lines.push(`- 新增 ${(pool.added ?? []).length} 只：${(pool.added as unknown[]).map(poolName).join("、") || "无"}`);
  lines.push(`- 移除 ${(pool.removed ?? []).length} 只：${(pool.removed as unknown[]).map(poolName).join("、") || "无"}`);

  return lines.join("\n");
}

/**
 * 调用复盘 agent 生成总结（压轴模块）。
 * 输入为全部结构化模块的精选数据，输出为纯文本总结（无 JSON 解析）。
 * mainlineInstruction：当前主线口径说明（来自 stock_metric），注入 prompt 供 agent 理解主线得分口径。
 */
async function runSummaryAgent(
  date: string,
  instructions: string,
  data: ReviewData,
  mainlineInstruction?: string,
  marketEmotionInstruction?: string,
): Promise<string> {
  const agent = mastra.getAgent("reviewAnalyst");
  const metricLines = [
    mainlineInstruction
      ? `【主线口径】（主线模块分数按此口径计算，请据此点评主线）：\n${mainlineInstruction}`
      : "",
    marketEmotionInstruction
      ? `【市场情绪口径】（情绪温度按此口径计算，请据此点评情绪冷热）：\n${marketEmotionInstruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const metricBlock = metricLines ? `\n\n${metricLines}` : "";
  const prompt = `你是专业的 A 股复盘分析师。\n\n复盘方法论：\n${instructions}${metricBlock}\n\n` +
    `请根据以下 ${date} 交易日的结构化复盘数据，撰写一段精炼、有观点的当日总结，` +
    `覆盖：大盘/资金面、主线方向、连板情绪（含情绪温度）、选股池点评、明日关注点。` +
    `直接输出总结正文（可用 Markdown 列表），不要输出 JSON 或代码块。\n\n` +
    serializeReviewData(data);
  const response = await agent.generate(prompt);
  return response.text.trim();
}

/** 落库（同日期覆盖，支持"重新生成并更新"） */
async function persistReview(
  date: string,
  sections: ReviewSection[],
  summary: string,
  skill: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(reviewDaily)
    .values({ date, sections, summary, skill, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: reviewDaily.date,
      set: { sections, summary, skill, updatedAt: new Date() },
    });
}

// GET /api/v1/reviews/skill — 读取复盘方法论（instructions）
reviewsRoute.get("/skill", async (c) => {
  const instructions = await ensureInstructions();
  return ok(c, { content: { instructions } });
});

// PUT /api/v1/reviews/skill — 编辑复盘方法论
reviewsRoute.put("/skill", async (c) => {
  const body = (await c.req.json()) as { content?: { instructions?: unknown } };
  const instructions = body.content?.instructions;
  if (typeof instructions !== "string" || !instructions.trim()) {
    return badRequest(c, "content.instructions is required");
  }
  const content = { instructions };
  await db
    .insert(reviewSkill)
    .values({ name: "default", content, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: reviewSkill.name,
      set: { content, updatedAt: new Date() },
    });
  return ok(c, { content });
});

// POST /api/v1/reviews/generate — 生成/重新生成复盘（一次性返回）
reviewsRoute.post("/generate", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  const date = body.date?.trim() || formatDate(new Date());

  try {
    const instructions = await ensureInstructions();
    const ctx = await loadMetricCtxs();

    // 1. 结构化数据快照（全部从 DB 读取，并行；市场情绪温度从涨停池单表计算）
    const [fundflow, limitUpPool, boardChanges, limitUp, stockPool, marketEmotion] = await Promise.all([
      fetchFundFlow(date),
      fetchLimitUpPool(date),
      fetchBoardChanges(),
      fetchLimitUp(date),
      fetchStockPool(date),
      getMarketEmotionData(date),
    ]);

    // 2. 规则化主线（无 agent）
    const mainline = await buildMainline(date);

    // 3. agent 生成总结（输入全部结构化数据 + 当前主线/情绪口径）
    const data: ReviewData = {
      fundflow,
      mainline,
      limitUpPool,
      boardChanges,
      limitUp,
      stockPool,
      marketEmotion,
      summary: "",
    };
    const summary = await runSummaryAgent(
      date,
      instructions,
      data,
      ctx.mainline?.instruction,
      ctx.marketEmotion?.instruction,
    );
    data.summary = summary;

    // 4. 依据固定模块组装 sections 并落库（同日期覆盖）；skill 快照含口径，回放口径一致
    const sections = buildSections(data);
    const skill = { instructions, mainline: ctx.mainline, marketEmotion: ctx.marketEmotion };
    await persistReview(date, sections, summary, skill);

    return ok(c, { date, sections, summary, skill });
  } catch (err) {
    console.error("[reviews] generate error:", err);
    return serverError(c, "复盘生成失败，请稍后重试。");
  }
});

// POST /api/v1/reviews/generate/stream — 流式生成复盘（结构化模块就绪即推送，总结压轴）
//
// 事件类型：
//   meta     { date }                              —— 会话元信息
//   section  { index, type, title, chart, data }   —— 单个模块（数据就绪即推送，data 恒有值）
//   done     { date }                              —— 全部完成并落库
//   error    { message }                           —— 出错
//
// 推送顺序：
//   1. 结构化模块（fundflow/boardchange/limitup/stockpool，DB 读取）按固定顺序推送；
//   2. mainline（规则化，查成分股）就绪后推送；
//   3. 最后推送 summary（agent 总结压轴）。
// 不推 data=null 占位：前端按 index 填充，仅渲染已就绪模块。
reviewsRoute.post("/generate/stream", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  const date = body.date?.trim() || formatDate(new Date());

  return streamSSE(c, async (stream) => {
    try {
      const instructions = await ensureInstructions();
      const ctx = await loadMetricCtxs();
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ date }) });

      // 1. 结构化数据快照（DB 读取，并行；市场情绪温度从涨停池单表计算）
      const [fundflow, limitUpPool, boardChanges, limitUp, stockPool, marketEmotion] = await Promise.all([
        fetchFundFlow(date),
        fetchLimitUpPool(date),
        fetchBoardChanges(),
        fetchLimitUp(date),
        fetchStockPool(date),
        getMarketEmotionData(date),
      ]);
      const dataMap: Record<string, unknown> = {
        fundflow,
        limitUpPool,
        boardChanges,
        limitUp,
        stockPool,
        marketEmotion,
      };

      // 2. 推送除 mainline / summary 外的结构化模块（fundflow/limitup_pool/market_emotion/boardchange/limitup/stockpool）
      for (let i = 0; i < REVIEW_MODULES.length; i++) {
        const s = REVIEW_MODULES[i]!;
        if (s.type === "mainline" || s.type === "summary") continue;
        await stream.writeSSE({
          event: "section",
          data: JSON.stringify({
            index: i,
            type: s.type,
            title: s.title,
            chart: s.chart,
            data: dataMap[DATA_SOURCES[s.type]!],
          }),
        });
      }

      // 3. 规则化主线（查成分股，稍慢）→ 推送
      const mainline = await buildMainline(date);
      const mainlineIndex = REVIEW_MODULES.findIndex((s) => s.type === "mainline");
      await stream.writeSSE({
        event: "section",
        data: JSON.stringify({
          index: mainlineIndex,
          type: "mainline",
          title: REVIEW_MODULES[mainlineIndex]!.title,
          chart: "mainline",
          data: mainline,
        }),
      });

      // 4. agent 生成总结（压轴）→ 推送（注入当前主线/市场情绪口径）
      const data: ReviewData = {
        fundflow,
        mainline,
        limitUpPool,
        boardChanges,
        limitUp,
        stockPool,
        marketEmotion,
        summary: "",
      };
      const summary = await runSummaryAgent(
        date,
        instructions,
        data,
        ctx.mainline?.instruction,
        ctx.marketEmotion?.instruction,
      );
      data.summary = summary;
      const summaryIndex = REVIEW_MODULES.findIndex((s) => s.type === "summary");
      await stream.writeSSE({
        event: "section",
        data: JSON.stringify({
          index: summaryIndex,
          type: "summary",
          title: REVIEW_MODULES[summaryIndex]!.title,
          chart: "text",
          data: summary,
        }),
      });

      // 5. 组装并落库（同日期覆盖）；skill 快照含口径，回放口径一致
      const sections = buildSections(data);
      await persistReview(date, sections, summary, {
        instructions,
        mainline: ctx.mainline,
        marketEmotion: ctx.marketEmotion,
      });

      await stream.writeSSE({ event: "done", data: JSON.stringify({ date }) });
    } catch (err) {
      console.error("[reviews] stream error:", err);
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "复盘生成失败，请稍后重试。" }),
      });
    }
  });
});

// GET /api/v1/reviews/mainline — 规则化主线（独立接口，供前端/外部直接取主线）
// 查询参数：date（可选，YYYY-MM-DD，缺省取最新快照日期）、limit（可选，默认 5，最大 10）
reviewsRoute.get("/mainline", async (c) => {
  const date = c.req.query("date")?.trim() || undefined;
  const limitParam = c.req.query("limit");
  const parsedLimit = limitParam ? Math.floor(Number(limitParam)) : 5;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 10) : 5;

  try {
    const res = await getMainlineData(date, limit);
    return ok(c, res);
  } catch (err) {
    console.error("[reviews] mainline error:", err);
    return serverError(c, "主线获取失败，请稍后重试。");
  }
});

// GET /api/v1/reviews/list — 复盘日期列表
reviewsRoute.get("/list", async (c) => {
  const rows = await db
    .select({
      date: reviewDaily.date,
      summary: reviewDaily.summary,
      updatedAt: reviewDaily.updatedAt,
    })
    .from(reviewDaily)
    .orderBy(desc(reviewDaily.date));
  return ok(c, rows);
});

// GET /api/v1/reviews/:date — 回放某交易日复盘
reviewsRoute.get("/:date", async (c) => {
  const date = c.req.param("date");
  const rows = await db.select().from(reviewDaily).where(eq(reviewDaily.date, date));
  const row = rows[0];
  if (!row) return ok(c, null);
  // sections 已包含组装好的模块与渲染数据，历史复盘直接渲染
  return ok(c, {
    date: row.date,
    sections: row.sections,
    summary: row.summary,
    skill: row.skill,
    updatedAt: row.updatedAt,
  });
});

export { reviewsRoute };
