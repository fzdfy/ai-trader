import { eq } from "drizzle-orm";
import { mastra } from "../agent/mastra";
import {
  getDailyBoardChangesData,
  getConsecutiveLimitUpData,
  getFundFlowRankData,
  getLimitUpPoolData,
  getMainlineData,
  getMarketEmotionData,
  getStockPoolChangeData,
  type LimitUpPoolItem,
  type MainlineItem,
  type MarketEmotionResult,
} from "../agent/mastra/tools/review-tools";
import { db } from "../db";
import { reviewDaily, reviewSkill } from "../db/schema";
import { loadDefaultMetric, MAINLINE_DEF } from "../lib/metrics";
import { getSyncTradeDate } from "../workers/sync-worker/calendar";

export const DEFAULT_INSTRUCTIONS = `你是专业的 A 股复盘分析师，负责对指定交易日进行复盘并产出「总结」。

## 复盘结构（九项）
1~6. 六个主线维度（每个维度含子指标得分与领先板块）：
  - 方向持续性：近3日累计涨幅、近5日上涨天数
  - 资金聚焦：主力净流入额、净占比、5日主力净流入
  - 龙头梯队：涨停家数、最高连板数、封板强度
  - 赚钱效应：板块涨幅、上涨家数占比、炸板率
  - 题材催化：题材涨停集中度、题材归因强度
  - 机构/游资确认：龙虎榜净买额、上榜家数
7. 主线：六维加权总分 top N 行业板块（总分 100，口径以 getMainline 返回的 metric.instruction 为准）。
8. 自选股：今日选股池与上一交易日的新增/移除，评估与主线匹配度。
9. 总结

## 总结输出要求
150 字左右，精炼、有观点，覆盖：大盘/资金面、主线方向、连板情绪（含情绪温度）、选股池点评、明日关注点。
用 Markdown 列表；结论必须有数据支撑，不得虚构。`;

export async function ensureReviewInstructions(): Promise<string> {
  const rows = await db
    .select({ content: reviewSkill.content })
    .from(reviewSkill)
    .where(eq(reviewSkill.name, "default"));
  const content = rows[0]?.content as { instructions?: unknown } | undefined;
  if (content && typeof content.instructions === "string") return content.instructions;
  await db
    .insert(reviewSkill)
    .values({
      name: "default",
      content: { instructions: DEFAULT_INSTRUCTIONS },
    })
    .onConflictDoNothing({ target: reviewSkill.name });
  return DEFAULT_INSTRUCTIONS;
}

interface MetricCtx {
  preset: string;
  version: number;
  displayName: string;
  instruction: string;
}

async function loadMetricCtxs(): Promise<{
  mainline: MetricCtx | null;
  marketEmotion: MetricCtx | null;
}> {
  const load = async (kind: string): Promise<MetricCtx | null> => {
    try {
      const metric = await loadDefaultMetric(kind);
      return {
        preset: metric.preset,
        version: metric.version,
        displayName: metric.displayName,
        instruction: metric.instruction,
      };
    } catch (error) {
      console.error(`[reviews] load ${kind} metric failed:`, (error as Error).message ?? error);
      return null;
    }
  };
  const [mainline, marketEmotion] = await Promise.all([load("mainline"), load("market-emotion")]);
  return { mainline, marketEmotion };
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function resolveReviewDate(input?: string): Promise<string> {
  return input?.trim() || (await getSyncTradeDate()) || formatDate(new Date());
}

function formatYuan(value: number | null | undefined): string {
  if (value == null) return "-";
  const absolute = Math.abs(value);
  if (absolute >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (absolute >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return String(Math.round(value));
}

export interface ReviewSection {
  type: string;
  title: string;
  chart: string;
  data: unknown;
}

interface ReviewData {
  fundflow: { industry: unknown[]; concept: unknown[]; stock: unknown[] };
  mainline: MainlineItem[];
  limitUpPool: LimitUpPoolItem[];
  boardChanges: unknown[];
  limitUp: unknown[];
  stockPool: { today: unknown[]; added: unknown[]; removed: unknown[] };
  marketEmotion: MarketEmotionResult | null;
  summary: string;
}

interface DimensionSubScore {
  key: string;
  label: string;
  score: number;
  weight: number;
}

interface DimensionBoard {
  boardName: string;
  coreStocks: string[];
  dimScore: number;
  totalScore: number;
  subs: DimensionSubScore[];
}

interface DimensionSectionData {
  key: string;
  label: string;
  weight: number;
  boards: DimensionBoard[];
}

function buildDimensionSections(items: MainlineItem[]): DimensionSectionData[] {
  return MAINLINE_DEF.dims.map((dimension) => {
    const boards = items
      .map((mainline) => ({
        boardName: mainline.boardName,
        coreStocks: mainline.coreStocks ?? [],
        dimScore: mainline.dimScores?.[dimension.key] ?? 0,
        totalScore: mainline.score ?? 0,
        subs: dimension.subs.map((sub) => ({
          key: sub.key,
          label: sub.label,
          score: mainline.subScores?.[sub.key] ?? 0,
          weight: sub.weightDefault,
        })),
      }))
      .sort((left, right) => right.dimScore - left.dimScore)
      .slice(0, 5);
    return {
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weightDefault,
      boards,
    };
  });
}

function buildSections(data: ReviewData): ReviewSection[] {
  const sections: ReviewSection[] = [];
  for (const dimension of buildDimensionSections(data.mainline ?? [])) {
    sections.push({
      type: "mainline_dim",
      title: dimension.label,
      chart: "dimension",
      data: dimension,
    });
  }
  sections.push({
    type: "mainline",
    title: "主线",
    chart: "mainline",
    data: data.mainline ?? [],
  });
  sections.push({
    type: "stockpool",
    title: "今日自选股票池",
    chart: "stockpool",
    data: data.stockPool,
  });
  sections.push({
    type: "summary",
    title: "总结",
    chart: "text",
    data: data.summary,
  });
  return sections;
}

async function fetchFundFlow(date?: string): Promise<ReviewData["fundflow"]> {
  const [industry, concept, stock] = await Promise.all([
    getFundFlowRankData("industry", date, 5),
    getFundFlowRankData("concept", date, 5),
    getFundFlowRankData("stock", date, 5),
  ]);
  return {
    industry: industry.items,
    concept: concept.items,
    stock: stock.items,
  };
}

async function fetchBoardChanges(): Promise<unknown[]> {
  return (await getDailyBoardChangesData("industry", 5)).items;
}

async function fetchLimitUpPool(date?: string): Promise<LimitUpPoolItem[]> {
  return (await getLimitUpPoolData(date, 100)).items;
}

async function fetchLimitUp(date?: string): Promise<unknown[]> {
  return (await getConsecutiveLimitUpData(date, 3, 5)).items;
}

async function fetchStockPool(date: string): Promise<ReviewData["stockPool"]> {
  const result = await getStockPoolChangeData(date);
  return {
    today: result.today,
    added: result.added,
    removed: result.removed,
  };
}

async function buildMainline(date: string): Promise<MainlineItem[]> {
  return (await getMainlineData(date)).items;
}

function serializeReviewData(data: ReviewData): string {
  const lines: string[] = [];
  const flow = (value: unknown) => formatYuan(typeof value === "number" ? value : null);
  const percent = (value: unknown) => (value == null ? "-" : `${value}%`);

  const fundRows = (rows: unknown[], label: string) => {
    lines.push(`【${label}】`);
    for (const row of (rows as Array<Record<string, unknown>>) ?? []) {
      lines.push(
        `- ${row.name ?? "-"}: 主力净流入${flow(row.mainNetInflow)}，涨跌幅${percent(row.changePercent)}`,
      );
    }
  };
  fundRows(data.fundflow.industry, "行业资金流向 Top5");
  fundRows(data.fundflow.concept, "概念资金流向 Top5");
  fundRows(data.fundflow.stock, "个股资金流向 Top5");

  lines.push("【主线（六维加权）】");
  for (const mainline of data.mainline ?? []) {
    const dimensions = MAINLINE_DEF.dims
      .map(
        (dimension) => `${dimension.label}${(mainline.dimScores?.[dimension.key] ?? 0).toFixed(1)}`,
      )
      .join("/");
    lines.push(
      `- ${mainline.boardName}（总分${mainline.score}）: ${dimensions}，核心股[${mainline.coreStocks.join("、")}]`,
    );
  }

  const sealedPool = (data.limitUpPool ?? []).filter((row) => row.isLimitUp);
  if (sealedPool.length > 0) {
    const maximum = Math.max(...sealedPool.map((row) => row.limitUpCount));
    const leaders = sealedPool
      .filter((row) => row.limitUpCount >= 2)
      .sort((left, right) => right.limitUpCount - left.limitUpCount)
      .slice(0, 8);
    lines.push("【涨停池/连板梯队】");
    lines.push(`- 封板 ${sealedPool.length} 家，最高 ${maximum} 板`);
    for (const row of leaders) {
      lines.push(`- ${row.name}: ${row.limitUpCount}板（${row.industry ?? "—"}）`);
    }
  }

  lines.push("【当日板块异动 Top5】");
  for (const row of (data.boardChanges as Array<Record<string, unknown>>) ?? []) {
    lines.push(
      `- ${row.name ?? "-"}: 涨幅${percent(row.changePercent)}，异动${row.delta != null ? `+${row.delta}%` : "-"}`,
    );
  }

  lines.push("【3 连板及以上】");
  for (const row of (data.limitUp as Array<Record<string, unknown>>) ?? []) {
    lines.push(
      `- ${row.name ?? row.symbol ?? "-"}: ${row.consecutiveCount}连板，涨跌幅${percent(row.changePercent)}`,
    );
  }

  if (data.marketEmotion) {
    const emotion = data.marketEmotion;
    lines.push(
      `【市场情绪温度】${emotion.temperature} 度（涨停${emotion.limitUpCount}家、炸板率${(emotion.bustRate * 100).toFixed(1)}%、最高${emotion.maxConsecutive}连板）`,
    );
  }

  const stockPoolName = (row: unknown) => {
    const item = row as { name?: string; symbol?: string };
    return item.name ? `${item.name}(${item.symbol})` : (item.symbol ?? "-");
  };
  lines.push("【选股池】");
  lines.push(
    `- 今日 ${data.stockPool.today.length} 只：${data.stockPool.today.map(stockPoolName).join("、") || "无"}`,
  );
  lines.push(
    `- 新增 ${data.stockPool.added.length} 只：${data.stockPool.added.map(stockPoolName).join("、") || "无"}`,
  );
  lines.push(
    `- 移除 ${data.stockPool.removed.length} 只：${data.stockPool.removed.map(stockPoolName).join("、") || "无"}`,
  );
  return lines.join("\n");
}

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
  const prompt =
    `你是专业的 A 股复盘分析师。\n\n复盘方法论：\n${instructions}${metricBlock}\n\n` +
    `请根据以下 ${date} 交易日的结构化复盘数据，撰写一段精炼、有观点的当日总结，` +
    `覆盖：大盘/资金面、主线方向、连板情绪（含情绪温度）、选股池点评、明日关注点。` +
    `直接输出总结正文（可用 Markdown 列表），不要输出 JSON 或代码块。\n\n` +
    serializeReviewData(data);
  return (await agent.generate(prompt)).text.trim();
}

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

async function loadReviewData(
  date: string,
  signal?: AbortSignal,
): Promise<{
  instructions: string;
  context: Awaited<ReturnType<typeof loadMetricCtxs>>;
  data: ReviewData;
}> {
  signal?.throwIfAborted();
  const [instructions, context] = await Promise.all([ensureReviewInstructions(), loadMetricCtxs()]);
  const [fundflow, limitUpPool, boardChanges, limitUp, stockPool, marketEmotion] =
    await Promise.all([
      fetchFundFlow(date),
      fetchLimitUpPool(date),
      fetchBoardChanges(),
      fetchLimitUp(date),
      fetchStockPool(date),
      getMarketEmotionData(date),
    ]);
  signal?.throwIfAborted();
  const mainline = await buildMainline(date);
  return {
    instructions,
    context,
    data: {
      fundflow,
      mainline,
      limitUpPool,
      boardChanges,
      limitUp,
      stockPool,
      marketEmotion,
      summary: "",
    },
  };
}

export interface ReviewGenerationResult {
  date: string;
  sections: ReviewSection[];
  summary: string;
  skill: Record<string, unknown>;
}

export async function generateReview(
  dateInput?: string,
  signal?: AbortSignal,
): Promise<ReviewGenerationResult> {
  const date = await resolveReviewDate(dateInput);
  const { instructions, context, data } = await loadReviewData(date, signal);
  signal?.throwIfAborted();
  data.summary = await runSummaryAgent(
    date,
    instructions,
    data,
    context.mainline?.instruction,
    context.marketEmotion?.instruction,
  );
  signal?.throwIfAborted();

  const sections = buildSections(data);
  const skill = {
    instructions,
    mainline: context.mainline,
    marketEmotion: context.marketEmotion,
  };
  await persistReview(date, sections, data.summary, skill);
  return { date, sections, summary: data.summary, skill };
}

export async function generateReviewStreaming(
  dateInput: string | undefined,
  onSection: (section: ReviewSection, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<ReviewGenerationResult> {
  const date = await resolveReviewDate(dateInput);
  const { instructions, context, data } = await loadReviewData(date, signal);
  const sections = buildSections(data);
  for (let index = 0; index < sections.length - 1; index += 1) {
    signal?.throwIfAborted();
    await onSection(sections[index]!, index);
  }

  signal?.throwIfAborted();
  data.summary = await runSummaryAgent(
    date,
    instructions,
    data,
    context.mainline?.instruction,
    context.marketEmotion?.instruction,
  );
  const finalSections = buildSections(data);
  await onSection(finalSections.at(-1)!, finalSections.length - 1);
  const skill = {
    instructions,
    mainline: context.mainline,
    marketEmotion: context.marketEmotion,
  };
  await persistReview(date, finalSections, data.summary, skill);
  return { date, sections: finalSections, summary: data.summary, skill };
}
