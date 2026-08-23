/**
 * 复盘 API — 挂载于 /api/v1/reviews
 *
 * 提供：
 *   GET  /skill           读取复盘 skill（方法论 + UI 模块配置）
 *   PUT  /skill           编辑复盘 skill
 *   POST /generate        生成/重新生成某交易日复盘（agent 动态读取 skill）
 *   POST /generate/stream 流式生成（SSE 分节渐进输出）
 *   GET  /list            复盘日期列表（回放选择用）
 *   GET  /:date           回放某交易日复盘
 *
 * 六大模块（由 skill.sections 决定顺序/标题/图表类型）：
 *   1. fundflow    资金流向（行业 / 概念 / 个股 top5，来自 fund_flow_rank 表）
 *   2. mainline    主线（top5 + 核心个股，agent 生成）
 *   3. boardchange 当日板块异动（top5，来自 board_history 表对比）
 *   4. limitup     3 连板及以上（top5，来自 bar1d_adj 表按涨幅阈值统计）
 *   5. stockpool   今日自选股票池（列表 + 与上一交易日变动）
 *   6. summary     总结（agent 生成）
 *
 * 所有数据均从数据库读取（结构化模块直接查 DB 复用 agent 工具，主线/总结由 agent 生成）。
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
} from "../agent/mastra/tools/review-tools";

const reviewsRoute = new Hono();

/** 默认复盘 skill（首次读取时种子写入） */
const DEFAULT_SKILL = {
  instructions: `你是专业的 A 股复盘分析师。复盘需遵循：
1. 资金流向：以主力净流入为主要依据，分别识别行业、概念、个股资金净流入最集中的方向（各 top5）。
2. 主线：主线 = 资金净流入 + 涨幅居前 + 有清晰产业逻辑的板块，最多保留 5 个，并给出每个主线的核心个股。
3. 板块异动：关注当日涨幅较上一交易日变化最大的板块（异动）。
4. 连板情绪：关注 3 连板及以上的个股，判断市场高度与赚钱效应。
5. 选股池：评估选股池标的与主线的匹配度，指出新增/移除变动。
6. 总结：精炼、有观点，覆盖大盘/资金面、主线、连板情绪、选股点评、明日关注点。`,
  sections: [
    { type: "fundflow", title: "资金流向", chart: "fundflow" },
    { type: "mainline", title: "主线", chart: "mainline" },
    { type: "boardchange", title: "当日板块异动", chart: "bar" },
    { type: "limitup", title: "3 连板及以上", chart: "table" },
    { type: "stockpool", title: "今日自选股票池", chart: "stockpool" },
    { type: "summary", title: "总结", chart: "text" },
  ],
};

/** 确保存在默认 skill，返回其 content */
async function ensureSkill(): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ content: reviewSkill.content })
    .from(reviewSkill)
    .where(eq(reviewSkill.name, "default"));
  if (rows[0]?.content) return rows[0].content as Record<string, unknown>;
  await db
    .insert(reviewSkill)
    .values({ name: "default", content: DEFAULT_SKILL })
    .onConflictDoNothing({ target: reviewSkill.name });
  return DEFAULT_SKILL as unknown as Record<string, unknown>;
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 从 agent 输出中稳健解析 JSON（兼容 markdown 代码块包裹） */
function parseAgentJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 自描述复盘模块：type + title + chart（来自 skill.sections）+ 渲染数据 data。
 * 前端据此动态渲染，不再写死模块类型。
 */
interface ReviewSection {
  type: string;
  title: string;
  chart: string;
  data: unknown;
}

/** skill.sections 中单个模块的配置形态 */
interface SectionConfig {
  type?: string;
  title?: string;
  chart?: string;
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

/** agent 生成的模块（需等待推理，流式时先占位后补推） */
const AGENT_SOURCES = new Set(["mainline", "summary"]);

/**
 * 依据 skill.sections（输出模块配置）与复盘数据，组装自描述的 sections。
 * 顺序、标题、图表类型完全由 skill 决定，前端按 chart 类型通用渲染。
 */
function buildSections(skill: unknown, data: ReviewData): ReviewSection[] {
  const raw = skill && typeof skill === "object" ? (skill as { sections?: unknown }).sections : null;
  if (!Array.isArray(raw)) return [];
  return (raw as SectionConfig[]).map((s) => {
    const type = s.type ?? "unknown";
    const source = DATA_SOURCES[type];
    return {
      type,
      title: s.title ?? type,
      chart: s.chart ?? "table",
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
 * 调用复盘 agent 生成主线与总结。
 * 将最新 skill 的 instructions 直接注入提示词，确保严格遵循最新方法论。
 */
async function runAgent(
  date: string,
  skill: Record<string, unknown>,
): Promise<{ mainline: unknown[]; summary: string }> {
  const agent = mastra.getAgent("reviewAnalyst");
  const skillInstructions =
    skill && typeof skill.instructions === "string" ? skill.instructions : "";
  const prompt = skillInstructions
    ? `请对 ${date} 交易日进行复盘。\n\n本次复盘必须严格遵循以下方法论（skill），不得偏离：\n${skillInstructions}`
    : `请对 ${date} 交易日进行复盘。`;
  const response = await agent.generate(prompt);

  let mainline: unknown[] = [];
  let summary = "";
  const parsed = parseAgentJson(response.text);
  if (parsed) {
    mainline = Array.isArray(parsed.mainline)
      ? (parsed.mainline as Record<string, unknown>[]).map((m) => ({
          boardName: typeof m.boardName === "string" ? m.boardName : "",
          coreStocks: Array.isArray(m.coreStocks)
            ? m.coreStocks.filter((s): s is string => typeof s === "string")
            : [],
          reason: typeof m.reason === "string" ? m.reason : "",
        }))
      : [];
    summary = typeof parsed.summary === "string" ? parsed.summary : "";
  }
  if (!summary) summary = response.text;
  return { mainline, summary };
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

// GET /api/v1/reviews/skill — 读取复盘 skill
reviewsRoute.get("/skill", async (c) => {
  const content = await ensureSkill();
  return ok(c, { content });
});

// PUT /api/v1/reviews/skill — 编辑复盘 skill
reviewsRoute.put("/skill", async (c) => {
  const body = (await c.req.json()) as { content?: Record<string, unknown> };
  if (!body.content || typeof body.content !== "object") {
    return badRequest(c, "content is required");
  }
  await db
    .insert(reviewSkill)
    .values({ name: "default", content: body.content, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: reviewSkill.name,
      set: { content: body.content, updatedAt: new Date() },
    });
  return ok(c, { content: body.content });
});

// POST /api/v1/reviews/generate — 生成/重新生成复盘
reviewsRoute.post("/generate", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  const date = body.date?.trim() || formatDate(new Date());

  try {
    const skill = await ensureSkill();

    // 1. 结构化数据快照（全部从 DB 读取，复用 agent 工具）
    const [fundflow, boardChanges, limitUp, stockPool] = await Promise.all([
      fetchFundFlow(date),
      fetchBoardChanges(),
      fetchLimitUp(date),
      fetchStockPool(date),
    ]);

    // 2. agent 生成主线与总结
    const { mainline, summary } = await runAgent(date, skill);

    // 3. 组装数据并依据 skill.sections 生成自描述 sections
    const data: ReviewData = { fundflow, mainline, boardChanges, limitUp, stockPool, summary };
    const sections = buildSections(skill, data);

    // 4. 落库（同日期覆盖）
    await persistReview(date, sections, summary, skill);

    return ok(c, { date, sections, summary, skill });
  } catch (err) {
    console.error("[reviews] generate error:", err);
    return serverError(c, "复盘生成失败，请稍后重试。");
  }
});

// POST /api/v1/reviews/generate/stream — 流式生成复盘（SSE 分节渐进输出）
//
// 事件类型：
//   meta     { date }                              —— 会话元信息
//   section  { index, type, title, chart, data }   —— 单个复盘模块（渐进推送）
//   done     { date }                              —— 全部完成并落库
//   error    { message }                           —— 出错
reviewsRoute.post("/generate/stream", async (c) => {
  const body = (await c.req.json()) as { date?: string };
  const date = body.date?.trim() || formatDate(new Date());

  return streamSSE(c, async (stream) => {
    try {
      const skill = await ensureSkill();
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ date }) });

      // 1. 结构化数据快照（快速，DB 读取）
      const [fundflow, boardChanges, limitUp, stockPool] = await Promise.all([
        fetchFundFlow(date),
        fetchBoardChanges(),
        fetchLimitUp(date),
        fetchStockPool(date),
      ]);

      const raw = (skill as { sections?: unknown }).sections;
      const sectionConfigs = Array.isArray(raw) ? (raw as SectionConfig[]) : [];
      const dataMap: Record<string, unknown> = {
        fundflow,
        boardChanges,
        limitUp,
        stockPool,
      };

      // 2. 先推结构化模块；agent 生成模块先占位 data=null
      const pendingIndexes: number[] = [];
      for (let i = 0; i < sectionConfigs.length; i++) {
        const s = sectionConfigs[i]!;
        const type = s.type ?? "unknown";
        const source = DATA_SOURCES[type];
        if (source && AGENT_SOURCES.has(source)) pendingIndexes.push(i);
        await stream.writeSSE({
          event: "section",
          data: JSON.stringify({
            index: i,
            type,
            title: s.title ?? type,
            chart: s.chart ?? "table",
            data: source && !AGENT_SOURCES.has(source) ? dataMap[source] : null,
          }),
        });
      }

      // 3. agent 生成主线与总结（慢）
      const { mainline, summary } = await runAgent(date, skill);

      // 4. 补推主线/总结模块
      const agentData: Record<string, unknown> = { mainline, summary };
      for (const i of pendingIndexes) {
        const s = sectionConfigs[i]!;
        const type = s.type ?? "unknown";
        const source = DATA_SOURCES[type];
        await stream.writeSSE({
          event: "section",
          data: JSON.stringify({
            index: i,
            type,
            title: s.title ?? type,
            chart: s.chart ?? "table",
            data: source ? agentData[source] : null,
          }),
        });
      }

      // 5. 组装并落库（同日期覆盖）
      const data: ReviewData = { fundflow, mainline, boardChanges, limitUp, stockPool, summary };
      const sections = buildSections(skill, data);
      await persistReview(date, sections, summary, skill);

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
