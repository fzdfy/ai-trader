/**
 * 复盘 API — 挂载于 /api/v1/reviews
 *
 * 提供：
 *   GET  /skill           读取复盘 skill（方法论 + UI 模块配置）
 *   PUT  /skill           编辑复盘 skill
 *   POST /generate        生成/重新生成某交易日复盘（agent 动态读取 skill）
 *   GET  /list            复盘日期列表（回放选择用）
 *   GET  /:date           回放某交易日复盘
 */
import { Hono } from "hono";
import { db } from "../db";
import { reviewSkill, reviewDaily, stockPool } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, badRequest, serverError } from "../lib/response";
import { createSdk, withSdkRetry } from "../lib/sdk";
import { mastra } from "../agent/mastra";

const reviewsRoute = new Hono();

/** 默认复盘 skill（首次读取时种子写入） */
const DEFAULT_SKILL = {
  instructions: `你是专业的 A 股复盘分析师。复盘需遵循：
1. 行业资金流向：以主力净流入为主要依据，识别资金净流入最集中的行业。
2. 主线：主线 = 资金净流入 + 涨幅居前 + 有清晰产业逻辑的板块，只保留 1~3 个。
3. 选股池：评估选股池标的与主线的匹配度，指出哪些标的在主线内、哪些偏离。
4. 总结：精炼、有观点，覆盖大盘/资金面、主线、选股点评、明日关注点。`,
  sections: [
    { type: "fundflow", title: "行业资金流向", chart: "bar" },
    { type: "mainline", title: "主线", chart: "bar" },
    { type: "stockpool", title: "选股池", chart: "table" },
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

    // 1. 结构化数据快照：行业资金流（东方财富）+ 当日选股池
    //    sectorRank 内部会走多 provider 重试/降级；此处再用业务层重试兜底，避免偶发抖动被误判为失败。
    let fundflow: unknown[] = [];
    try {
      const rows = await withSdkRetry(
        () => createSdk().fundFlow.sectorRank({ sectorType: "industry", indicator: "today" }),
        { label: "reviews.sectorFundFlow" },
      );
      console.log("generate", rows);
      fundflow = rows.map((r) => ({
        code: r.code,
        name: r.name,
        changePercent: r.changePercent,
        mainNetInflow: r.mainNetInflow,
        mainNetInflowPercent: r.mainNetInflowPercent,
        superLargeNetInflow: r.superLargeNetInflow,
        largeNetInflow: r.largeNetInflow,
        mediumNetInflow: r.mediumNetInflow,
        smallNetInflow: r.smallNetInflow,
        topStockName: r.topStockName ?? null,
        topStockCode: r.topStockCode ?? null,
      }));
    } catch (error) {
      console.error(`[reviews] sector fundflow fetch failed after retries:`, error);
    }
    console.log("poolRows select");
    const poolRows = await db
      .select({
        symbol: stockPool.symbol,
        name: stockPool.name,
        source: stockPool.source,
        score: stockPool.score,
      })
      .from(stockPool)
      .where(eq(stockPool.date, date));
    const pool = poolRows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      source: r.source,
      score: r.score,
    }));

    // 2. agent 动态读取 skill + 数据，生成主线与总结
    const agent = mastra.getAgent("reviewAnalyst");
    const response = await agent.generate(`请对 ${date} 交易日进行复盘。`);

    let mainline: unknown[] = [];
    let summary = "";
    const parsed = parseAgentJson(response.text);
    if (parsed) {
      mainline = Array.isArray(parsed.mainline) ? parsed.mainline : [];
      summary = typeof parsed.summary === "string" ? parsed.summary : "";
    }
    if (!summary) summary = response.text;

    // 3. 落库（同日期覆盖，支持"重新生成并更新"）
    await db
      .insert(reviewDaily)
      .values({
        date,
        fundflow,
        mainline,
        stockPool: pool,
        summary,
        skill,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: reviewDaily.date,
        set: {
          fundflow,
          mainline,
          stockPool: pool,
          summary,
          skill,
          updatedAt: new Date(),
        },
      });

    return ok(c, { date, fundflow, mainline, stockPool: pool, summary, skill });
  } catch (err) {
    console.error("[reviews] generate error:", err);
    return serverError(c, "复盘生成失败，请稍后重试。");
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
  return ok(c, {
    date: row.date,
    fundflow: row.fundflow,
    mainline: row.mainline,
    stockPool: row.stockPool,
    summary: row.summary,
    skill: row.skill,
    updatedAt: row.updatedAt,
  });
});

export { reviewsRoute };
