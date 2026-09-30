-- 第 3 条：把 bar1d_raw 改造为按 time 的年度 RANGE 分区表。
--
-- 背景：读时派生视图 bar1d_qfq/hfq 与批量导出都对 bar1d_raw 做区间扫描。实测
-- bar1d_raw.time 与物理行的相关度 correlation = -0.025（≈0，行序由「逐标的写入」导致），
-- 故 BRIN(time) 无法有效裁剪块区间 —— 分区是本项目唯一可行的区间裁剪手段。
--
-- 影响面（迁移前已核对）：
--   * 仅两个视图 bar1d_qfq / bar1d_hfq 依赖 bar1d_raw，无外键引用；
--   * 写入侧 sync-worker 用 onConflictDoUpdate(target=[time, symbol])，冲突目标含分区键 time，分区表支持；
--   * PK(time, symbol) 已含分区键 time，满足分区表主键约束要求。
--
-- 存量数据 16,940,984 行 / heap ~1.9GB 需重建，故本迁移为重型操作（建议业务低峰执行）。

DROP VIEW "public"."bar1d_hfq";--> statement-breakpoint
DROP VIEW "public"."bar1d_qfq";--> statement-breakpoint
ALTER TABLE "bar1d_raw" RENAME TO "bar1d_raw_legacy";--> statement-breakpoint
ALTER INDEX "bar1d_raw_time_symbol_pk" RENAME TO "bar1d_raw_legacy_time_symbol_pk";--> statement-breakpoint
ALTER INDEX "bar1d_raw_symbol_time_idx" RENAME TO "bar1d_raw_legacy_symbol_time_idx";--> statement-breakpoint
CREATE TABLE "bar1d_raw" (
  "time" timestamp NOT NULL,
  "symbol" text NOT NULL,
  "open" numeric NOT NULL,
  "high" numeric NOT NULL,
  "low" numeric NOT NULL,
  "close" numeric NOT NULL,
  "volume" numeric NOT NULL,
  "amount" numeric,
  "avg_price" numeric,
  "indicators" jsonb,
  "source_updated_at" timestamp,
  "ingested_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "bar1d_raw_time_symbol_pk" PRIMARY KEY ("time","symbol")
) PARTITION BY RANGE ("time");--> statement-breakpoint
DO $$
DECLARE
  y int;
BEGIN
  FOR y IN 1990..2035 LOOP
    EXECUTE format(
      'CREATE TABLE "bar1d_raw_%s" PARTITION OF "bar1d_raw" FOR VALUES FROM (%L) TO (%L)',
      y, y || '-01-01', (y + 1) || '-01-01'
    );
  END LOOP;
END $$;--> statement-breakpoint
CREATE TABLE "bar1d_raw_default" PARTITION OF "bar1d_raw" DEFAULT;--> statement-breakpoint
INSERT INTO "bar1d_raw" SELECT * FROM "bar1d_raw_legacy";--> statement-breakpoint
CREATE INDEX "bar1d_raw_symbol_time_idx" ON "bar1d_raw" ("symbol","time");--> statement-breakpoint
DROP TABLE "bar1d_raw_legacy";--> statement-breakpoint
CREATE VIEW "public"."bar1d_hfq" AS (
  select
    b."time" as time,
    b."symbol" as symbol,
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."open"  + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as open,
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."high"  + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as high,
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."low"   + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as low,
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."close" + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as close,
    b."close" as close_raw,
    b."volume" as volume,
    b."amount" as amount,
    b."avg_price" as avg_price,
    b."indicators" as indicators,
    b."source_updated_at" as source_updated_at,
    b."ingested_at" as ingested_at
  from "bar1d_raw" b
  left join lateral (
    select af."qfq_ratio" as qfq_ratio, af."qfq_offset" as qfq_offset
    from "adj_factor" af
    where af."symbol" = b."symbol" and af."date" <= b."time"::date
    order by af."date" desc
    limit 1
  ) f on true
  left join "adj_factor_latest" l on l."symbol" = b."symbol"
);--> statement-breakpoint
CREATE VIEW "public"."bar1d_qfq" AS (
  select
    b."time" as time,
    b."symbol" as symbol,
    (coalesce(f."qfq_ratio", 1) * b."open"  + coalesce(f."qfq_offset", 0)) as open,
    (coalesce(f."qfq_ratio", 1) * b."high"  + coalesce(f."qfq_offset", 0)) as high,
    (coalesce(f."qfq_ratio", 1) * b."low"   + coalesce(f."qfq_offset", 0)) as low,
    (coalesce(f."qfq_ratio", 1) * b."close" + coalesce(f."qfq_offset", 0)) as close,
    b."close" as close_raw,
    b."volume" as volume,
    b."amount" as amount,
    b."avg_price" as avg_price,
    b."indicators" as indicators,
    b."source_updated_at" as source_updated_at,
    b."ingested_at" as ingested_at
  from "bar1d_raw" b
  left join lateral (
    select af."qfq_ratio" as qfq_ratio, af."qfq_offset" as qfq_offset
    from "adj_factor" af
    where af."symbol" = b."symbol" and af."date" <= b."time"::date
    order by af."date" desc
    limit 1
  ) f on true
);
