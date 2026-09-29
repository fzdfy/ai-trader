DROP VIEW "public"."bar1d_hfq";--> statement-breakpoint
DROP VIEW "public"."bar1d_qfq";--> statement-breakpoint
ALTER TABLE "adj_factor" ADD COLUMN "qfq_ratio" numeric DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor" ADD COLUMN "qfq_offset" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor_latest" ADD COLUMN "hfq_base" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor" DROP COLUMN "cum_gap";--> statement-breakpoint
ALTER TABLE "adj_factor" DROP COLUMN "hfq_shift";--> statement-breakpoint
ALTER TABLE "adj_factor_latest" DROP COLUMN "cum_gap";--> statement-breakpoint
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