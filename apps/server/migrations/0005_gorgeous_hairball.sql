CREATE TABLE "news_article" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text NOT NULL,
	"published_at" timestamp,
	"summary" text,
	"sentiment" numeric,
	"raw_json" jsonb,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_article_source_url_unq" UNIQUE("source","url")
);
--> statement-breakpoint
CREATE TABLE "news_article_symbol" (
	"article_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"score" numeric,
	"relation_type" text,
	CONSTRAINT "news_article_symbol_article_id_symbol_pk" PRIMARY KEY("article_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "news_embedding" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector,
	"tsv" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"event_time" timestamp NOT NULL,
	"impact_score" numeric,
	"payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_event_symbol" (
	"event_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"impact_score" numeric,
	CONSTRAINT "news_event_symbol_event_id_symbol_pk" PRIMARY KEY("event_id","symbol")
);
