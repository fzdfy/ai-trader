import { Hono } from "hono";
import { db } from "../db";
import { sql, and, eq, isNull, isNotNull, desc, count, gte, inArray, max } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";
import { jobRun } from "../db/schema";
import { createLogger } from "../lib/logger";
import { getLogContext, runWithLogContext } from "../lib/request-context";
import { localDateStr, getSyncTradeDate } from "../workers/sync-worker/calendar";
import { runManualSync, cleanupStaleRuns } from "../workers/sync-worker/runner";

const syncRoute = new Hono();

const log = createLogger("sync");

/** 已知同步模块元信息（与 sync-worker cron-config 对齐） */
export const SYNC_MODULES: { jobType: string; name: string }[] = [
  { jobType: "kline-1m", name: "分钟 K 线" },
  { jobType: "kline-1d", name: "日 K 线" },
  { jobType: "gap-detect", name: "缺口检测" },
  { jobType: "news", name: "新闻" },
  { jobType: "boards", name: "板块排行" },
  { jobType: "board-kline", name: "板块指数 K 线" },
  { jobType: "constituents", name: "板块成分股" },
  { jobType: "fundflow", name: "资金流排行" },
  { jobType: "limit-up-pool", name: "涨停池" },
  { jobType: "board-fund-flow", name: "板块资金流" },
  { jobType: "dragon-tiger", name: "龙虎榜" },
  { jobType: "hot-reason", name: "题材归因" },
  { jobType: "kline-period", name: "周期 K 线" },
  { jobType: "features", name: "特征计算" },
  // 历史回补：与当日同步分离的独立任务（收盘后错峰运行，只补窗口内缺失的历史交易日）
  { jobType: "limit-up-pool-backfill", name: "涨停池回补" },
  { jobType: "dragon-tiger-backfill", name: "龙虎榜回补" },
  { jobType: "hot-reason-backfill", name: "题材归因回补" },
  { jobType: "kline-1d-backfill", name: "日 K 线回补" },
  { jobType: "sync-manual", name: "手动同步" },
];

/** 与手动同步写同一批行情表、需互斥的 worker 定时任务
 *  （手动同步执行 boards / kline-1d / kline-period，三者都必须互斥，避免并发写冲突；
 *   回补任务写 limit_up_pool / dragon_tiger_daily / hot_reason，与手动同步同表，同样互斥） */
const WORKER_MARKET_JOBS = [
  "boards",
  "kline-1d",
  "kline-period",
  "board-kline",
  "constituents",
  "fundflow",
  "limit-up-pool",
  "board-fund-flow",
  "dragon-tiger",
  "hot-reason",
  "features",
  "limit-up-pool-backfill",
  "dragon-tiger-backfill",
  "hot-reason-backfill",
  "kline-1d-backfill",
];

/** 查询最近一次数据更新时间（取 board 表最新 updated_at 作为行情数据新鲜度） */
async function queryLastUpdated(): Promise<string | null> {
  const res = await db.execute(sql`SELECT MAX(updated_at) AS updated_at FROM board`);
  const value = res.rows[0]?.updated_at as Date | string | null | undefined;
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 当前应同步交易日是否已有成功的手动同步（sync-manual）记录，用于防止同日重复触发。
 * 与管道级 hasSuccessToday 口径一致，均按 trade_date 判定（而非 startedAt 的自然日，
 * 避免 23:59 / 00:30 跨日执行被错判）；日历缺失（tradeDate 为 null）时不拦截。
 */
async function hasManualSuccessToday(): Promise<boolean> {
  const tradeDate = await getSyncTradeDate();
  if (!tradeDate) return false;
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, "sync-manual"),
        eq(jobRun.status, "success"),
        eq(jobRun.tradeDate, tradeDate),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// GET /api/v1/sync/last-updated — 最近数据更新时间
syncRoute.get("/last-updated", async (c) => {
  const updatedAt = await queryLastUpdated();
  return ok(c, { updatedAt });
});

// GET /api/v1/sync/status — 当前运行中的同步任务（跨进程状态，来自 job_run 表）
syncRoute.get("/status", async (c) => {
  await cleanupStaleRuns();
  const rows = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(isNotNull(jobRun.startedAt), isNull(jobRun.finishedAt)));
  return ok(c, { runningJobs: rows.map((r) => r.jobType) });
});

/**
 * GET /api/v1/sync/records?page=1&pageSize=20&jobType=boards&status=running
 *
 * 同步记录分页查询（倒序，最新在前）。
 */
syncRoute.get("/records", async (c) => {
  await cleanupStaleRuns();
  const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query("pageSize") ?? "20"), 5), 100);
  const jobType = c.req.query("jobType");
  const status = c.req.query("status");

  const conditions = [];
  if (jobType) conditions.push(eq(jobRun.jobType, jobType));
  if (status) conditions.push(eq(jobRun.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const total =
    (await db.select({ value: count() }).from(jobRun).where(where))[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(jobRun)
    .where(where)
    .orderBy(desc(jobRun.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return ok(c, {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      jobType: r.jobType,
      status: r.status,
      total: r.total,
      processed: r.processed,
      message: r.message,
      error: r.error,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs:
        r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    })),
  });
});

/**
 * GET /api/v1/sync/modules
 *
 * 每个同步模块的最新状态汇总（含运行中进度），供「同步中心」页展示。
 */
syncRoute.get("/modules", async (c) => {
  await cleanupStaleRuns();

  const today = localDateStr();
  const todayStart = new Date(`${today}T00:00:00`);

  // 每个模块仅取最新一条（DISTINCT ON），今日统计与全局最近成功时间各用聚合查询，
  // 避免全表扫描：job_run 由 news 每 2 分钟写入一行，前端每 3 秒轮询，无界查询会持续劣化。
  const latestRows = await db
    .selectDistinctOn([jobRun.jobType])
    .from(jobRun)
    .orderBy(jobRun.jobType, desc(jobRun.id));

  const todayAgg = await db
    .select({ jobType: jobRun.jobType, status: jobRun.status, value: count() })
    .from(jobRun)
    .where(gte(jobRun.startedAt, todayStart))
    .groupBy(jobRun.jobType, jobRun.status);

  const [lastSuccess] = await db
    .select({ at: max(jobRun.finishedAt) })
    .from(jobRun)
    .where(eq(jobRun.status, "success"));

  // 每个模块取最新一条 + 聚合今日统计
  const latestByType = new Map<string, (typeof latestRows)[number]>();
  for (const r of latestRows) latestByType.set(r.jobType, r);

  const todayStats = new Map<string, { success: number; failed: number }>();
  for (const r of todayAgg) {
    const s = todayStats.get(r.jobType) ?? { success: 0, failed: 0 };
    if (r.status === "success") s.success += Number(r.value);
    else if (r.status === "failed") s.failed += Number(r.value);
    todayStats.set(r.jobType, s);
  }

  const lastSuccessAt = lastSuccess?.at ?? null;

  const modules = SYNC_MODULES.map((m) => {
    const latest = latestByType.get(m.jobType);
    const stats = todayStats.get(m.jobType) ?? { success: 0, failed: 0 };
    return {
      jobType: m.jobType,
      name: m.name,
      status: latest?.status ?? "never",
      total: latest?.total ?? null,
      processed: latest?.processed ?? null,
      message: latest?.message ?? null,
      error: latest?.error ?? null,
      startedAt: latest?.startedAt ?? null,
      finishedAt: latest?.finishedAt ?? null,
      durationMs:
        latest?.startedAt && latest?.finishedAt
          ? latest.finishedAt.getTime() - latest.startedAt.getTime()
          : null,
      lastSuccessAt: latest?.status === "success" ? (latest?.finishedAt ?? null) : null,
      todaySuccess: stats.success,
      todayFailed: stats.failed,
    };
  });

  // 兜底：数据库里出现的未知模块也返回（如脚本手动同步产生的记录）
  for (const jobType of latestByType.keys()) {
    if (SYNC_MODULES.some((m) => m.jobType === jobType)) continue;
    const latest = latestByType.get(jobType)!;
    const stats = todayStats.get(jobType) ?? { success: 0, failed: 0 };
    modules.push({
      jobType,
      name: jobType,
      status: latest.status,
      total: latest.total ?? null,
      processed: latest.processed ?? null,
      message: latest.message ?? null,
      error: latest.error ?? null,
      startedAt: latest.startedAt ?? null,
      finishedAt: latest.finishedAt ?? null,
      durationMs:
        latest.startedAt && latest.finishedAt
          ? latest.finishedAt.getTime() - latest.startedAt.getTime()
          : null,
      lastSuccessAt: latest.status === "success" ? (latest.finishedAt ?? null) : null,
      todaySuccess: stats.success,
      todayFailed: stats.failed,
    });
  }

  return ok(c, { modules, lastSuccessAt });
});

// POST /api/v1/sync/run — 手动触发全量数据同步（板块 + 板块K线 + 成分股 + 日线 + 周期线 + 特征 + 资金流 + 涨停池）
// 异步触发：请求立即返回，任务在后台执行（避免长任务悬挂 HTTP 连接），
// 前端通过 /sync/modules 轮询看到进度与最终状态。
syncRoute.post("/run", async (c) => {
  await cleanupStaleRuns();

  // 防重入：存在未结束的 sync-manual 任务则拒绝（基于 job_run 状态，跨请求/进程一致）
  const active = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(and(eq(jobRun.jobType, "sync-manual"), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
    .limit(1);
  if (active.length > 0) {
    return badRequest(c, "已有同步任务进行中，请稍候");
  }

  // 幂等：今日已成功过则默认拒绝，避免重复全市场拉取；?force=true 可强制重跑
  const force = c.req.query("force") === "true";
  if (!force && (await hasManualSuccessToday())) {
    return badRequest(c, "今日已手动同步成功，如需重跑请加 ?force=true");
  }

  // 与 worker 定时任务互斥：worker 正在跑同一批行情管道时拒绝，避免跨进程并发写
  const workerActive = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(inArray(jobRun.jobType, WORKER_MARKET_JOBS), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
    .limit(1);
  if (workerActive.length > 0) {
    return badRequest(c, `行情同步进行中（${workerActive[0]!.jobType}），请稍候`);
  }

  const inserted = await db
    .insert(jobRun)
    .values({
      jobType: "sync-manual",
      status: "running",
      startedAt: new Date(),
      // 落库 tradeDate：与管道级 hasSuccessToday / hasManualSuccessToday 的幂等口径一致
      tradeDate: await getSyncTradeDate(),
    })
    .returning({ id: jobRun.id });
  const runId = inserted[0]?.id ?? null;

  // 后台执行，不阻塞请求；结束后落终态（success / failed）
  // 建立独立日志链路（source=manual），并以触发本次同步的 HTTP 请求为父链路，
  // 使「接口日志 → 手动同步总任务 → 各管道 → quant 调用」可在 Loki 中串联
  const parentRequestId = getLogContext()?.requestId;
  void runWithLogContext(
    {
      requestId: crypto.randomUUID(),
      ...(parentRequestId ? { parentRequestId } : {}),
      source: "manual",
      jobName: "sync-manual",
      ...(runId != null ? { jobRunId: String(runId) } : {}),
    },
    async () => {
      try {
        const { executed, skipped } = await runManualSync({ force });

        if (runId != null) {
          // 全部管道因「今日已同步」跳过 → 本次无实际拉取，标记成功但写明说明文案
          const noop = executed.length === 0 && skipped.length > 0;
          await db
            .update(jobRun)
            .set({
              status: "success",
              finishedAt: new Date(),
              ...(noop ? { message: `今日已同步，本次未实际拉取（跳过 ${skipped.length} 个管道）` } : {}),
            })
            .where(eq(jobRun.id, runId));
        }
        log.info({ job_run_id: runId, executed: executed.length, skipped: skipped.length }, "manual sync done");
      } catch (error) {
        log.error({ err: error, error_type: (error as Error)?.name ?? "Error" }, "manual sync failed");
        if (runId != null) {
          await db
            .update(jobRun)
            .set({
              status: "failed",
              error: (error as Error)?.message ?? "同步失败",
              finishedAt: new Date(),
            })
            .where(eq(jobRun.id, runId));
        }
      }
    },
  );

  return ok(c, { accepted: true, runId });
});

export { syncRoute };
