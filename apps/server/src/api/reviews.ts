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
 * 六大模块（固定，代码写死顺序/标题/图表类型，不受 skill 配置影响）：
 *   1. fundflow    资金流向（行业 / 概念 / 个股 top5，来自 fund_flow_rank 表）
 *   2. mainline    主线（规则化：资金流 + 涨幅打分，成分股来自 board_constituent 表）
 *   3. boardchange 当日板块异动（top5，来自 board_history 表对比）
 *   4. limitup     3 连板及以上（top5，来自 bar1d_adj 表按涨幅阈值统计）
 *   5. stockpool   今日自选股票池（列表 + 与上一交易日变动）
 *   6. summary     总结（agent 生成，输入为全部结构化模块数据）
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
import {
  getFundFlowRankData,
  getDailyBoardChangesData,
  getConsecutiveLimitUpData,
  getStockPoolChangeData,
  getMainlineData,
  type MainlineItem,
} from "../agent/mastra/tools/review-tools";

const reviewsRoute = new Hono();

/** 默认复盘方法论（首次读取时种子写入） */
const DEFAULT_INSTRUCTIONS = `你是专业的 A 股复盘分析师。复盘需遵循：
1. 资金流向：以主力净流入为主要依据，识别行业、概念、个股资金净流入最集中的方向（各 top5）。
2. 主线：主线 = 资金净流入 + 涨幅居前 + 有清晰产业逻辑的板块，最多保留 5 个，并给出每个主线的核心个股。
3. 板块异动：关注当日涨幅较上一交易日变化最大的板块（异动）。
4. 连板情绪：关注 3 连板及以上的个股，判断市场高度与赚钱效应。
5. 选股池：评估选股池标的与主线的匹配度，指出新增/移除变动。
6. 总结：精炼、有观点，覆盖大盘/资金面、主线、连板情绪、选股点评、明日关注点。`;

/** 固定复盘模块（顺序 / 标题 / 图表类型写死，前端按 type 渲染） */
const REVIEW_MODULES = [
  { type: "fundflow", title: "资金流向", chart: "fundflow" },
  { type: "mainline", title: "主线", chart: "mainline" },
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

/** 六大模块的数据对象 */
interface ReviewData {
  fundflow: { industry: unknown[]; concept: unknown[]; stock: unknown[] };
  mainline: unknown[];
  boardChanges: unknown[];
  limitUp: unknown[];
  stockPool: { today: unknown[]; added: unknown[]; removed: unknown[] };
  summary: string;
}

/** 模块类型 → 数据源字段映射 */
const DATA_SOURCES: Record<
  string,
  "fundflow" | "mainline" | "boardChanges" | "limitUp" | "stockPool" | "summary"
> = {
  fundflow: "fundflow",
  mainline: "mainline",
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

  lines.push("【当日板块异动 Top5】");
  for (const r of (data.boardChanges as Array<Record<string, unknown>>) ?? []) {
    lines.push(`- ${r.name ?? "-"}: 涨幅${pct(r.changePercent)}，异动${r.delta != null ? `+${r.delta}%` : "-"}`);
  }

  lines.push("【3 连板及以上】");
  for (const r of (data.limitUp as Array<Record<string, unknown>>) ?? []) {
    lines.push(`- ${r.name ?? r.symbol ?? "-"}: ${r.consecutiveCount}连板，涨跌幅${pct(r.changePercent)}`);
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
 */
async function runSummaryAgent(
  date: string,
  instructions: string,
  data: ReviewData,
): Promise<string> {
  const agent = mastra.getAgent("reviewAnalyst");
  const prompt = `你是专业的 A 股复盘分析师。\n\n复盘方法论：\n${instructions}\n\n` +
    `请根据以下 ${date} 交易日的结构化复盘数据，撰写一段精炼、有观点的当日总结，` +
    `覆盖：大盘/资金面、主线方向、连板情绪、选股池点评、明日关注点。` +
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

    // 1. 结构化数据快照（全部从 DB 读取，并行）
    const [fundflow, boardChanges, limitUp, stockPool] = await Promise.all([
      fetchFundFlow(date),
      fetchBoardChanges(),
      fetchLimitUp(date),
      fetchStockPool(date),
    ]);

    // 2. 规则化主线（无 agent）
    const mainline = await buildMainline(date);

    // 3. agent 生成总结（输入全部结构化数据）
    const data: ReviewData = { fundflow, mainline, boardChanges, limitUp, stockPool, summary: "" };
    const summary = await runSummaryAgent(date, instructions, data);
    data.summary = summary;

    // 4. 依据固定模块组装 sections 并落库（同日期覆盖）
    const sections = buildSections(data);
    await persistReview(date, sections, summary, { instructions });

    return ok(c, { date, sections, summary, skill: { instructions } });
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
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ date }) });

      // 1. 结构化数据快照（DB 读取，并行）
      const [fundflow, boardChanges, limitUp, stockPool] = await Promise.all([
        fetchFundFlow(date),
        fetchBoardChanges(),
        fetchLimitUp(date),
        fetchStockPool(date),
      ]);
      const dataMap: Record<string, unknown> = { fundflow, boardChanges, limitUp, stockPool };

      // 2. 推送除 mainline / summary 外的结构化模块（fundflow/boardchange/limitup/stockpool）
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

      // 4. agent 生成总结（压轴）→ 推送
      const data: ReviewData = { fundflow, mainline, boardChanges, limitUp, stockPool, summary: "" };
      const summary = await runSummaryAgent(date, instructions, data);
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

      // 5. 组装并落库（同日期覆盖）
      const sections = buildSections(data);
      await persistReview(date, sections, summary, { instructions });

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
