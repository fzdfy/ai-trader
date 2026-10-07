DROP VIEW "public"."bar1d_hfq";--> statement-breakpoint
DROP VIEW "public"."bar1d_qfq";--> statement-breakpoint
ALTER TABLE "adj_factor" DROP CONSTRAINT "adj_factor_symbol_date_pk";--> statement-breakpoint
ALTER TABLE "adj_factor_latest" DROP CONSTRAINT "adj_factor_latest_pkey";--> statement-breakpoint
ALTER TABLE "adj_factor" ADD COLUMN "known_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor_latest" ADD COLUMN "known_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "adj_factor" ADD CONSTRAINT "adj_factor_symbol_date_known_at_pk" PRIMARY KEY("symbol","date","known_at");--> statement-breakpoint
ALTER TABLE "adj_factor_latest" ADD CONSTRAINT "adj_factor_latest_symbol_known_at_pk" PRIMARY KEY("symbol","known_at");--> statement-breakpoint
CREATE INDEX "adj_factor_symbol_known_at_idx" ON "adj_factor" USING btree ("symbol","known_at");--> statement-breakpoint
CREATE FUNCTION "public"."adj_factor_asof"(p_symbol text, p_as_of timestamp)
RETURNS SETOF "public"."adj_factor"
LANGUAGE sql STABLE AS $$
  select af.*
  from "adj_factor" af
  where af."symbol" = p_symbol
    and af."known_at" = (
      select max(af2."known_at") from "adj_factor" af2
      where af2."symbol" = p_symbol and af2."known_at" <= p_as_of
    )
$$;--> statement-breakpoint
CREATE FUNCTION "public"."bar1d_qfq_at"(p_symbol text, p_as_of timestamp)
RETURNS TABLE (
  "time" timestamp,
  "symbol" text,
  "open" numeric,
  "high" numeric,
  "low" numeric,
  "close" numeric,
  "close_raw" numeric,
  "volume" numeric,
  "amount" numeric,
  "avg_price" numeric,
  "indicators" jsonb,
  "source_updated_at" timestamp,
  "ingested_at" timestamp
)
LANGUAGE sql STABLE AS $$
  select
    b."time", b."symbol",
    (coalesce(f."qfq_ratio", 1) * b."open"  + coalesce(f."qfq_offset", 0)) as "open",
    (coalesce(f."qfq_ratio", 1) * b."high"  + coalesce(f."qfq_offset", 0)) as "high",
    (coalesce(f."qfq_ratio", 1) * b."low"   + coalesce(f."qfq_offset", 0)) as "low",
    (coalesce(f."qfq_ratio", 1) * b."close" + coalesce(f."qfq_offset", 0)) as "close",
    b."close" as "close_raw", b."volume", b."amount", b."avg_price", b."indicators",
    b."source_updated_at", b."ingested_at"
  from "bar1d_raw" b
  left join lateral (
    select af."qfq_ratio" as qfq_ratio, af."qfq_offset" as qfq_offset
    from "adj_factor" af
    where af."symbol" = b."symbol" and af."date" <= b."time"::date
      and af."known_at" = (
        select max(af2."known_at") from "adj_factor" af2
        where af2."symbol" = b."symbol" and af2."known_at" <= p_as_of
      )
    order by af."date" desc
    limit 1
  ) f on true
  where b."symbol" = p_symbol
$$;--> statement-breakpoint
CREATE FUNCTION "public"."bar1d_hfq_at"(p_symbol text, p_as_of timestamp)
RETURNS TABLE (
  "time" timestamp,
  "symbol" text,
  "open" numeric,
  "high" numeric,
  "low" numeric,
  "close" numeric,
  "close_raw" numeric,
  "volume" numeric,
  "amount" numeric,
  "avg_price" numeric,
  "indicators" jsonb,
  "source_updated_at" timestamp,
  "ingested_at" timestamp
)
LANGUAGE sql STABLE AS $$
  select
    b."time", b."symbol",
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."open"  + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as "open",
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."high"  + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as "high",
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."low"   + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as "low",
    (coalesce(l."scale", 1) * (coalesce(f."qfq_ratio", 1) * b."close" + coalesce(f."qfq_offset", 0)) + coalesce(l."hfq_base", 0)) as "close",
    b."close" as "close_raw", b."volume", b."amount", b."avg_price", b."indicators",
    b."source_updated_at", b."ingested_at"
  from "bar1d_raw" b
  left join lateral (
    select af."qfq_ratio" as qfq_ratio, af."qfq_offset" as qfq_offset
    from "adj_factor" af
    where af."symbol" = b."symbol" and af."date" <= b."time"::date
      and af."known_at" = (
        select max(af2."known_at") from "adj_factor" af2
        where af2."symbol" = b."symbol" and af2."known_at" <= p_as_of
      )
    order by af."date" desc
    limit 1
  ) f on true
  left join "adj_factor_latest" l on l."symbol" = b."symbol"
    and l."known_at" = (
      select max(l2."known_at") from "adj_factor_latest" l2
      where l2."symbol" = b."symbol" and l2."known_at" <= p_as_of
    )
  where b."symbol" = p_symbol
$$;--> statement-breakpoint
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
      and af."known_at" = (
        select max(af2."known_at") from "adj_factor" af2 where af2."symbol" = b."symbol"
      )
    order by af."date" desc
    limit 1
  ) f on true
  left join "adj_factor_latest" l on l."symbol" = b."symbol"
    and l."known_at" = (
      select max(l2."known_at") from "adj_factor_latest" l2 where l2."symbol" = b."symbol"
    )
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
      and af."known_at" = (
        select max(af2."known_at") from "adj_factor" af2 where af2."symbol" = b."symbol"
      )
    order by af."date" desc
    limit 1
  ) f on true
);
