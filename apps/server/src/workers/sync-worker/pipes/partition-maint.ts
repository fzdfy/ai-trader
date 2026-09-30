/**
 * partition-maint 管道 — bar1d_raw 年度 RANGE 分区的自动维护与巡检。
 *
 * 背景：bar1d_raw 已按 time 年度分区（迁移 0023）。PostgreSQL 不会自动为新年度建分区：
 * 目标年份若无分区，写入会落进 bar1d_raw_default，且 DEFAULT 一旦有数据，
 * 再对同一区间 CREATE ... PARTITION OF 会因约束冲突失败
 * （"updated partition constraint for default partition would be violated"），届时必须先
 * 搬迁 DEFAULT 中的行才能补齐，运维成本陡增。故需提前建分区 + 巡检 DEFAULT。
 *
 * 本任务做两件事（幂等，可重复安全执行）：
 *   1) 补齐 [当前年, 当前年 + RUNWAY_YEARS] 的年度分区（CREATE TABLE IF NOT EXISTS ... PARTITION OF）；
 *   2) 巡检 bar1d_raw_default：只要非空即 throw，让 job_run 标 failed 并落日志，把
 *      「分区断档」暴露在同步中心，而不是等下游读不到数据才发现。
 *
 * 纯 DDL 维护，不写行情表，不参与手动同步互斥；安排每周低峰运行，无需交易日守卫。
 */
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { updateProgress } from "../progress";

const PARENT_TABLE = "bar1d_raw";
const DEFAULT_PARTITION = "bar1d_raw_default";

/** 提前创建的年份跨度：确保当前年 ~ 当前年 + RUNWAY_YEARS 都有分区（约等于提前 2 年） */
const RUNWAY_YEARS = 2;

/** 与迁移 0023 一致的分区命名规则 */
function partitionName(year: number): string {
  return `${PARENT_TABLE}_${year}`;
}

/** 分区名 → 是否已存在于 pg_class（relkind='r' 普通表） */
async function partitionExists(name: string): Promise<boolean> {
  const res = await db.execute(sql`SELECT to_regclass(${name}) AS reg`);
  return res.rows[0]?.reg != null;
}

/** 幂等创建某年度分区；返回 true 表示本次新建，false 表示已存在被跳过 */
async function ensureYearPartition(year: number): Promise<boolean> {
  const name = partitionName(year);
  if (await partitionExists(name)) return false;
  // CREATE TABLE 等 DDL 不支持扩展协议占位符（$1），且标识符无法参数化；
  // year 为内部整数，拼接安全。
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "${PARENT_TABLE}" ` +
        `FOR VALUES FROM ('${year}-01-01') TO ('${year + 1}-01-01')`,
    ),
  );
  return true;
}

/**
 * 巡检 DEFAULT 分区：非空即抛错（含行数与时间范围，便于定位漏配的年份区间）。
 * 用 EXISTS 做廉价探测，只在已非空时才做 count/min/max 诊断。
 */
async function assertDefaultPartitionEmpty(): Promise<void> {
  const probe = await db.execute(
    sql`SELECT EXISTS(SELECT 1 FROM ${sql.raw(`"${DEFAULT_PARTITION}"`)}) AS present`,
  );
  if (!probe.rows[0]?.present) return;

  const diag = await db.execute(sql`
    SELECT count(*)::bigint AS n, MIN("time") AS min_t, MAX("time") AS max_t
    FROM ${sql.raw(`"${DEFAULT_PARTITION}"`)}
  `);
  const { n, min_t, max_t } = diag.rows[0] as {
    n: string | number;
    min_t: Date | string | null;
    max_t: Date | string | null;
  };
  throw new Error(
    `[partition-maint] ${DEFAULT_PARTITION} 非空（${n} 行，${String(min_t)} ~ ${String(max_t)}）：` +
      `存在未被年度分区覆盖的数据，说明分区断档。需先搬迁这些行到正确分区，再补齐分区，` +
      `否则新建重分区会因 DEFAULT 约束冲突失败。`,
  );
}

/**
 * 管道入口：巡检 DEFAULT 分区 → 幂等补齐年度分区（当前年 ~ 当前年 + RUNWAY_YEARS）。
 */
export async function partitionMaintPipeRun(): Promise<void> {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y <= currentYear + RUNWAY_YEARS; y++) years.push(y);

  updateProgress(0, years.length + 1, "巡检 bar1d_raw_default 分区");
  await assertDefaultPartitionEmpty();

  let created = 0;
  let idx = 0;
  for (const year of years) {
    const isNew = await ensureYearPartition(year);
    if (isNew) created++;
    idx++;
    updateProgress(idx, years.length + 1, `${partitionName(year)} ${isNew ? "已创建" : "已存在"}`);
  }

  updateProgress(
    years.length + 1,
    years.length + 1,
    `分区维护完成：检查 ${years.length} 个年度分区，新建 ${created} 个`,
  );
  console.log(
    `[partition-maint] ensured ${years[0]}~${years[years.length - 1]} partitions (created ${created})`,
  );
}
