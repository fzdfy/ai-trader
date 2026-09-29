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
	CONSTRAINT "bar1d_raw_time_symbol_pk" PRIMARY KEY("time","symbol")
);
--> statement-breakpoint
DROP VIEW "public"."bar1d_qfq";--> statement-breakpoint
DROP TABLE "bar1d_hfq" CASCADE;--> statement-breakpoint
ALTER TABLE "adj_factor" ADD COLUMN "cum_gap" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor" ADD COLUMN "hfq_shift" numeric;--> statement-breakpoint
ALTER TABLE "adj_factor_latest" ADD COLUMN "scale" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor_latest" ADD COLUMN "cum_gap" numeric NOT NULL;--> statement-breakpoint
CREATE INDEX "bar1d_raw_symbol_time_idx" ON "bar1d_raw" USING btree ("symbol","time");--> statement-breakpoint
ALTER TABLE "adj_factor" DROP COLUMN "factor";--> statement-breakpoint
ALTER TABLE "adj_factor_latest" DROP COLUMN "factor";--> statement-breakpoint
CREATE VIEW "public"."bar1d_hfq" AS (
  select
    b."time" as time,
    b."symbol" as symbol,
    (coalesce(l."scale", 1) * b."open"  + coalesce(f."hfq_shift", 0)) as open,
    (coalesce(l."scale", 1) * b."high"  + coalesce(f."hfq_shift", 0)) as high,
    (coalesce(l."scale", 1) * b."low"   + coalesce(f."hfq_shift", 0)) as low,
    (coalesce(l."scale", 1) * b."close" + coalesce(f."hfq_shift", 0)) as close,
    b."close" as close_raw,
    b."volume" as volume,
    b."amount" as amount,
    b."avg_price" as avg_price,
    b."indicators" as indicators,
    b."source_updated_at" as source_updated_at,
    b."ingested_at" as ingested_at
  from "bar1d_raw" b
  left join lateral (
    select af."hfq_shift" as hfq_shift
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
    (b."open"  + coalesce(f."cum_gap", 0) - coalesce(l."cum_gap", 0)) as open,
    (b."high"  + coalesce(f."cum_gap", 0) - coalesce(l."cum_gap", 0)) as high,
    (b."low"   + coalesce(f."cum_gap", 0) - coalesce(l."cum_gap", 0)) as low,
    (b."close" + coalesce(f."cum_gap", 0) - coalesce(l."cum_gap", 0)) as close,
    b."close" as close_raw,
    b."volume" as volume,
    b."amount" as amount,
    b."avg_price" as avg_price,
    b."indicators" as indicators,
    b."source_updated_at" as source_updated_at,
    b."ingested_at" as ingested_at
  from "bar1d_raw" b
  left join lateral (
    select af."cum_gap" as cum_gap
    from "adj_factor" af
    where af."symbol" = b."symbol" and af."date" <= b."time"::date
    order by af."date" desc
    limit 1
  ) f on true
  left join "adj_factor_latest" l on l."symbol" = b."symbol"
);