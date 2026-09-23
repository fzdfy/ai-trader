import { Hono } from "hono";
import { db } from "../db";
import { sql, desc, inArray } from "drizzle-orm";
import { ok, notFound, serverError } from "../lib/response";
import { jobRun } from "../db/schema";
import { createLogger } from "../lib/logger";
import { SYNC_MODULES } from "./sync";

const dataCenterRoute = new Hono();

const log = createLogger("data-center");

/**
 * 数据中心 —— 股票数据相关表的目录（表清单 + 表结构 + 更新记录）。
 *
 * 元信息（中文名 / 描述）与 schema 定义（db/schema/md.ts）保持一一对应，
 * 用静态注册表显式声明，避免运行时从 pg catalog 猜中文名。
 * `timeColumn` 既用于计算「更新时间」，也决定了该表的业务时间口径：
 *   - 时间序列表（K 线 / 盘口 / 日历）：取分区列 time / trade_date，走索引且语义为「最新数据时间」
 *   - 快照 / 排行表：取 updated_at / ingested_at / ts，语义为「最近一次写入时间」
 * `jobTypes` 为该表对应的同步任务，用于「更新记录」tab 检索 job_run。
 */
export interface DataTableDef {
  /** 实际表名 */
  table: string;
  /** 中文名 */
  name: string;
  /** 描述 */
  description: string;
  /** 计算「更新时间」所聚合的时间列 */
  timeColumn: string;
  /** 写入该表的同步任务 jobType */
  jobTypes: string[];
}

export const DATA_CENTER_TABLES: DataTableDef[] = [
  {
    table: "board",
    name: "板块排行",
    description:
      "行业 / 概念板块实时排行快照（涨跌幅、热度、总市值、领涨股）。每次同步全量覆盖，行情页板块列表的数据源。",
    timeColumn: "updated_at",
    jobTypes: ["boards"],
  },
  {
    table: "board_history",
    name: "板块排行历史",
    description:
      "板块排行的每日快照，按交易日追加以支持板块轮动与历史涨幅回溯；同日重复同步只保留最后一次结果。",
    timeColumn: "updated_at",
    jobTypes: ["boards"],
  },
  {
    table: "board_constituent",
    name: "板块成分股",
    description:
      "板块与成分股的绑定关系，并缓存成分股最新行情（涨跌幅、换手率、成交额），供热力图二级节点直接读取。",
    timeColumn: "updated_at",
    jobTypes: ["constituents"],
  },
  {
    table: "board_kline",
    name: "板块指数日 K 线",
    description:
      "落库行业 / 概念板块指数的日 K 线，收盘后定时同步，供筹码分布等模块从库读取，避免实时拉取上游。",
    timeColumn: "time",
    jobTypes: ["board-kline"],
  },
  {
    table: "instrument",
    name: "交易标的基础信息",
    description:
      "整个系统的「股票字典」，存储 A 股全部标的（股票 / ETF / 可转债 / 指数）的元数据与上市、退市状态。",
    timeColumn: "updated_at",
    jobTypes: [],
  },
  {
    table: "trading_calendar",
    name: "交易日历",
    description:
      "判断某一天是否交易、交易多久的唯一权威来源（全天 / 半日市 / 休市），供同步管道跳过非交易日与对账补洞推导分钟点。",
    timeColumn: "trade_date",
    jobTypes: [],
  },
  {
    table: "quote_latest",
    name: "最新行情快照",
    description:
      "每只股票一行、覆盖写的最新行情（价格、涨跌幅、量额、换手率、PE/PB、涨跌停价、盘口五档）。",
    timeColumn: "ts",
    jobTypes: [],
  },
  {
    table: "quote_snapshot",
    name: "盘口快照历史",
    description:
      "以「盘口变化事件」为记录单位、只追加不覆盖的流水表，记录价格跳动 / 放量 / 定时的盘口深度演变，用于盘中回放分析。",
    timeColumn: "time",
    jobTypes: [],
  },
  {
    table: "bar1m_adj",
    name: "1 分钟 K 线",
    description:
      "分钟级明细基表（前复权），5m / 15m / 30m / 60m 等粒度均通过连续聚合从此表派生。",
    timeColumn: "time",
    jobTypes: ["kline-1m"],
  },
  {
    table: "bar1d_adj",
    name: "日 K 线",
    description:
      "权威日线数据（前复权），从上游独立同步（含集合竞价），周线 / 月线可由此派生；回测读取层 load_kline 的唯一数据源。",
    timeColumn: "time",
    jobTypes: ["kline-1d", "kline-1d-backfill"],
  },
  {
    table: "bar_period_adj",
    name: "周期 K 线",
    description:
      "由日线聚合生成的派生周期线（5 日 / 周 / 月），不再向上游拉取，保证与日线复权口径完全一致。",
    timeColumn: "time",
    jobTypes: ["kline-period"],
  },
  {
    table: "fund_flow_rank",
    name: "资金流排行",
    description:
      "行业 / 概念 / 个股三档资金流排行快照，含主力、超大单、大单、中单、小单净流入净额与净占比。",
    timeColumn: "updated_at",
    jobTypes: ["fundflow"],
  },
  {
    table: "limit_up_pool",
    name: "涨停池",
    description:
      "每日涨停 / 曾涨停个股快照，含连板数、首次封板时间、炸板次数、封单金额、涨停类型与题材标签，是主线识别的核心输入。",
    timeColumn: "updated_at",
    jobTypes: ["limit-up-pool", "limit-up-pool-backfill"],
  },
  {
    table: "board_fund_flow_period",
    name: "板块周期资金流",
    description:
      "板块级 5 日 / 10 日周期资金流排行快照，用于判断资金聚焦的持续性；单日资金流见资金流排列表。",
    timeColumn: "updated_at",
    jobTypes: ["board-fund-flow"],
  },
  {
    table: "dragon_tiger_daily",
    name: "龙虎榜",
    description:
      "全市场龙虎榜日快照（个股级），含上榜原因、收盘价、涨跌幅与净买入额（万元），是机构 / 游资确认维度的原始数据源。",
    timeColumn: "updated_at",
    jobTypes: ["dragon-tiger", "dragon-tiger-backfill"],
  },
  {
    table: "hot_reason",
    name: "题材归因",
    description:
      "同花顺强势股当日题材归因快照（个股级），reason 为核心题材标签字段，是题材催化维度的原始数据源。",
    timeColumn: "updated_at",
    jobTypes: ["hot-reason", "hot-reason-backfill"],
  },
];

/** jobType → 中文名（与同步中心共用一份映射，未知 jobType 回退原始值） */
const JOB_TYPE_NAMES = new Map(SYNC_MODULES.map((m) => [m.jobType, m.name]));

function jobTypeName(jobType: string): string {
  return JOB_TYPE_NAMES.get(jobType) ?? jobType;
}

/** SQL 标识符白名单校验：注册表内的表名 / 列名才允许拼接进 SQL */
function isSafeIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

function assertDefIsSafe(def: DataTableDef): void {
  if (!isSafeIdentifier(def.table) || !isSafeIdentifier(def.timeColumn)) {
    throw new Error(`data-center 非法标识符: ${def.table}.${def.timeColumn}`);
  }
}

/** pg 返回值统一序列化为 ISO 字符串（timestamp / date 都会被驱动解析为 Date） */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 单表最近更新时间（MAX(timeColumn)） */
async function queryTableUpdatedAt(def: DataTableDef): Promise<string | null> {
  assertDefIsSafe(def);
  const res = await db.execute(
    sql`SELECT MAX(${sql.raw(`"${def.timeColumn}"`)}) AS updated_at FROM ${sql.raw(`"${def.table}"`)}`,
  );
  return toIso(res.rows[0]?.updated_at);
}

/** 全部表最近更新时间，合并为单条 UNION ALL 查询，避免逐表往返 */
async function queryAllUpdatedAt(): Promise<Map<string, string | null>> {
  const parts = DATA_CENTER_TABLES.map((def) => {
    assertDefIsSafe(def);
    return sql`SELECT ${sql.raw(`'${def.table}'`)} AS table_name, MAX(${sql.raw(`"${def.timeColumn}"`)}) AS updated_at FROM ${sql.raw(`"${def.table}"`)}`;
  });

  const res = await db.execute(sql.join(parts, sql` UNION ALL `));
  const map = new Map<string, string | null>();
  for (const row of res.rows) {
    map.set(String(row.table_name), toIso(row.updated_at));
  }
  return map;
}

function findDef(table: string): DataTableDef | undefined {
  return DATA_CENTER_TABLES.find((d) => d.table === table);
}

/**
 * GET /api/v1/data-center/tables
 *
 * 数据中心表清单：中文名 + 实际表名 + 描述 + 更新时间。
 */
dataCenterRoute.get("/tables", async (c) => {
  try {
    const updatedAtMap = await queryAllUpdatedAt();
    return ok(c, {
      tables: DATA_CENTER_TABLES.map((def) => ({
        table: def.table,
        name: def.name,
        description: def.description,
        updatedAt: updatedAtMap.get(def.table) ?? null,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "query data-center tables failed");
    return serverError(c, "查询数据表清单失败");
  }
});

/**
 * GET /api/v1/data-center/tables/:table
 *
 * 单表详情：基础元信息 + 表结构（information_schema + 主键标记）+ 更新记录（job_run）。
 */
dataCenterRoute.get("/tables/:table", async (c) => {
  const table = c.req.param("table");
  const def = findDef(table);
  if (!def) return notFound(c, `未收录的数据表：${table}`);

  try {
    const [updatedAt, columnRes, records] = await Promise.all([
      queryTableUpdatedAt(def),
      db.execute(sql`
        SELECT
          c.column_name    AS name,
          c.data_type      AS data_type,
          c.is_nullable    AS is_nullable,
          c.column_default AS column_default,
          (pk.column_name IS NOT NULL) AS is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT a.attname AS column_name
          FROM pg_index i
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE n.nspname = 'public' AND t.relname = ${def.table} AND i.indisprimary
        ) pk ON pk.column_name = c.column_name
        WHERE c.table_schema = 'public' AND c.table_name = ${def.table}
        ORDER BY c.ordinal_position
      `),
      def.jobTypes.length > 0
        ? db
            .select()
            .from(jobRun)
            .where(inArray(jobRun.jobType, def.jobTypes))
            .orderBy(desc(jobRun.id))
            .limit(50)
        : Promise.resolve([] as (typeof jobRun.$inferSelect)[]),
    ]);

    return ok(c, {
      table: def.table,
      name: def.name,
      description: def.description,
      updatedAt,
      columns: columnRes.rows.map((row) => ({
        name: String(row.name),
        dataType: String(row.data_type),
        isNullable: row.is_nullable === "YES",
        columnDefault: row.column_default == null ? null : String(row.column_default),
        isPrimaryKey: Boolean(row.is_primary_key),
      })),
      records: records.map((r) => ({
        id: r.id,
        jobType: r.jobType,
        jobName: jobTypeName(r.jobType),
        tradeDate: r.tradeDate,
        status: r.status,
        total: r.total,
        processed: r.processed,
        message: r.message,
        error: r.error,
        startedAt: toIso(r.startedAt),
        finishedAt: toIso(r.finishedAt),
        durationMs:
          r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      })),
    });
  } catch (error) {
    log.error({ err: error, table }, "query data-center table detail failed");
    return serverError(c, "查询数据表详情失败");
  }
});

export { dataCenterRoute };
