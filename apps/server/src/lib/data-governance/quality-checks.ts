import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { GovernanceAsset } from "./types";
import type {
  QualityCheckResult,
  QualityExecutionContext,
} from "./quality-runner";
import type { QualityRuleDefinition } from "./quality-rules";

function result(
  rule: QualityRuleDefinition,
  status: QualityCheckResult["status"],
  observedValue: number | null,
  details: Record<string, unknown>,
): QualityCheckResult {
  return {
    ruleId: rule.id,
    status,
    severity: rule.severity,
    observedValue,
    details,
  };
}

function failureStatus(
  rule: QualityRuleDefinition,
): QualityCheckResult["status"] {
  return rule.severity === "critical" ? "failed" : "warning";
}

function table(asset: GovernanceAsset) {
  const tables: Record<
    string,
    ReturnType<typeof sql.identifier>
  > = {
    instrument: sql.identifier("instrument"),
    trading_calendar: sql.identifier("trading_calendar"),
    bar1d_raw: sql.identifier("bar1d_raw"),
    bar1d_hfq: sql.identifier("bar1d_hfq"),
    adj_factor: sql.identifier("adj_factor"),
    adj_factor_latest: sql.identifier("adj_factor_latest"),
    news_article: sql.identifier("news_article"),
    news_article_symbol: sql.identifier("news_article_symbol"),
    news_embedding: sql.identifier("news_embedding"),
    news_event: sql.identifier("news_event"),
    news_event_symbol: sql.identifier("news_event_symbol"),
    research_report: sql.identifier("research_report"),
    research_report_document: sql.identifier("research_report_document"),
    research_report_chunk: sql.identifier("research_report_chunk"),
    research_report_forecast: sql.identifier("research_report_forecast"),
    company_announcement: sql.identifier("company_announcement"),
  };
  const value = tables[asset.key];
  if (!value) throw new Error(`quality checks are not configured for ${asset.key}`);
  return value;
}

function identifiers(values: readonly string[]) {
  if (values.some((value) => !/^[a-z][a-z0-9_]*$/.test(value))) {
    throw new Error("invalid governance contract identifier");
  }
  return sql.join(values.map((value) => sql.identifier(value)), sql`, `);
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const EXTRA_REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  bar1d_raw: ["open", "high", "low", "close", "volume", "amount"],
  bar1d_hfq: ["open", "high", "low", "close", "volume", "amount"],
};

async function freshness(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) {
  const field = context.asset.contract.eventTimeField;
  const response = await db.execute(sql`
    SELECT count(*) AS row_count, max(${sql.identifier(field)}) AS latest
    FROM ${table(context.asset)}
  `);
  const row = response.rows[0] as
    | { row_count: string | number; latest: unknown }
    | undefined;
  const rowCount = asNumber(row?.row_count) ?? 0;
  const latest =
    row?.latest == null ? null : new Date(String(row.latest));
  const staleAfterHours = asNumber(rule.params.staleAfterHours) ?? 24;
  if (latest == null || Number.isNaN(latest.getTime())) {
    return result(rule, failureStatus(rule), null, {
      rowCount,
      field,
      staleAfterHours,
      reason: "no_data",
    });
  }
  const ageHours = Math.max(
    0,
    (context.now.getTime() - latest.getTime()) / 3_600_000,
  );
  const passed = ageHours <= staleAfterHours;
  return result(rule, passed ? "passed" : failureStatus(rule), ageHours, {
    rowCount,
    field,
    latest: latest.toISOString(),
    staleAfterHours,
  });
}

async function requiredColumns(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) {
  const required = [
    ...context.asset.contract.primaryKey,
    context.asset.contract.eventTimeField,
    ...(context.asset.contract.knownAtField
      ? [context.asset.contract.knownAtField]
      : []),
    ...(EXTRA_REQUIRED_COLUMNS[context.asset.key] ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const response = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${context.asset.key}
      AND column_name IN (
        SELECT jsonb_array_elements_text(${JSON.stringify(required)}::jsonb)
      )
  `);
  const found = new Set(
    response.rows.map((row) => String((row as { column_name: string }).column_name)),
  );
  const missing = required.filter((column) => !found.has(column));
  return result(
    rule,
    missing.length === 0 ? "passed" : failureStatus(rule),
    required.length - missing.length,
    { required, missing },
  );
}

async function primaryKey(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) {
  const columns = context.asset.contract.primaryKey;
  if (columns.length === 0) {
    return result(rule, failureStatus(rule), null, {
      reason: "missing_primary_key_contract",
    });
  }
  const response = await db.execute(sql`
    SELECT
      count(*) AS duplicate_groups,
      coalesce(sum(duplicate_count - 1), 0) AS duplicate_rows
    FROM (
      SELECT count(*) AS duplicate_count
      FROM ${table(context.asset)}
      GROUP BY ${identifiers(columns)}
      HAVING count(*) > 1
    ) duplicates
  `);
  const row = response.rows[0] as
    | { duplicate_groups: string | number; duplicate_rows: string | number }
    | undefined;
  const duplicateRows = asNumber(row?.duplicate_rows) ?? 0;
  return result(
    rule,
    duplicateRows === 0 ? "passed" : failureStatus(rule),
    duplicateRows,
    {
      primaryKey: columns,
      duplicateGroups: asNumber(row?.duplicate_groups) ?? 0,
    },
  );
}

async function ohlcv(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) {
  const response = await db.execute(sql`
    WITH recent AS (
      SELECT *
      FROM ${table(context.asset)}
      WHERE ${sql.identifier(context.asset.contract.eventTimeField)} >=
        (SELECT max(${sql.identifier(context.asset.contract.eventTimeField)})
         FROM ${table(context.asset)}) - interval '7 days'
    )
    SELECT
      count(*) AS row_count,
      count(*) FILTER (
        WHERE open <= 0
          OR high <= 0
          OR low <= 0
          OR close <= 0
          OR volume < 0
          OR high < greatest(open, close, low)
          OR low > least(open, close, high)
      ) AS invalid_rows
    FROM recent
  `);
  const row = response.rows[0] as
    | { row_count: string | number; invalid_rows: string | number }
    | undefined;
  const rowCount = asNumber(row?.row_count) ?? 0;
  const invalidRows = asNumber(row?.invalid_rows) ?? 0;
  if (rowCount === 0) {
    return result(rule, failureStatus(rule), 0, {
      rowCount,
      invalidRows,
      reason: "no_recent_data",
    });
  }
  return result(
    rule,
    invalidRows === 0 ? "passed" : failureStatus(rule),
    invalidRows,
    { rowCount, invalidRows },
  );
}

async function coverage(
  rule: QualityRuleDefinition,
  _context: QualityExecutionContext,
) {
  const response = await db.execute(sql`
    WITH latest AS (
      SELECT max(time) AS trade_time FROM bar1d_raw
    ),
    expected AS (
      SELECT symbol FROM instrument WHERE status = 'listed'
    ),
    observed AS (
      SELECT DISTINCT b.symbol
      FROM bar1d_raw b, latest
      WHERE b.time = latest.trade_time
    )
    SELECT
      (SELECT count(*) FROM expected) AS expected_symbols,
      (SELECT count(*) FROM observed) AS observed_symbols
  `);
  const row = response.rows[0] as
    | {
        expected_symbols: string | number;
        observed_symbols: string | number;
      }
    | undefined;
  const expected = asNumber(row?.expected_symbols) ?? 0;
  const observed = asNumber(row?.observed_symbols) ?? 0;
  if (expected === 0) {
    return result(rule, failureStatus(rule), null, {
      expectedSymbols: expected,
      observedSymbols: observed,
      reason: "no_expected_symbols",
    });
  }
  const ratio = observed / expected;
  const minimumRatio = asNumber(rule.params.minimumRatio) ?? 1;
  return result(
    rule,
    ratio >= minimumRatio ? "passed" : failureStatus(rule),
    ratio,
    { expectedSymbols: expected, observedSymbols: observed, minimumRatio },
  );
}

async function symbolLinks(
  rule: QualityRuleDefinition,
  _context: QualityExecutionContext,
) {
  const response = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM news_article) AS total_articles,
      count(*) AS unlinked_articles
    FROM news_article AS article
    LEFT JOIN news_article_symbol AS link ON link.article_id = article.id
    WHERE link.article_id IS NULL
  `);
  const row = response.rows[0] as
    | { total_articles: string | number; unlinked_articles: string | number }
    | undefined;
  const totalArticles = asNumber(row?.total_articles) ?? 0;
  const unlinkedArticles = asNumber(row?.unlinked_articles) ?? 0;
  if (totalArticles === 0) {
    return result(rule, failureStatus(rule), null, {
      totalArticles,
      unlinkedArticles,
      reason: "no_articles",
    });
  }
  const linkedRatio = (totalArticles - unlinkedArticles) / totalArticles;
  return result(
    rule,
    unlinkedArticles === 0 ? "passed" : failureStatus(rule),
    linkedRatio,
    { totalArticles, unlinkedArticles },
  );
}

async function researchDocuments(
  rule: QualityRuleDefinition,
  _context: QualityExecutionContext,
) {
  const response = await db.execute(sql`
    SELECT
      count(*) AS total_documents,
      count(*) FILTER (
        WHERE extract_status <> 'extracted'
          OR storage_key IS NULL
          OR full_text IS NULL
          OR extracted_at IS NULL
      ) AS incomplete_documents
    FROM research_report_document
  `);
  const row = response.rows[0] as
    | { total_documents: string | number; incomplete_documents: string | number }
    | undefined;
  const totalDocuments = asNumber(row?.total_documents) ?? 0;
  const incompleteDocuments = asNumber(row?.incomplete_documents) ?? 0;
  return result(
    rule,
    totalDocuments > 0 && incompleteDocuments === 0 ? "passed" : failureStatus(rule),
    incompleteDocuments,
    {
      totalDocuments,
      incompleteDocuments,
      ...(totalDocuments === 0 ? { reason: "no_documents" } : {}),
    },
  );
}

async function calendarAlignment(
  rule: QualityRuleDefinition,
  _context: QualityExecutionContext,
) {
  const response = await db.execute(sql`
    WITH bar_dates AS (
      SELECT DISTINCT time::date AS trade_date FROM bar1d_raw
    )
    SELECT count(*) AS misaligned_dates
    FROM bar_dates AS bars
    LEFT JOIN trading_calendar AS calendar
      ON calendar.trade_date = bars.trade_date
    WHERE calendar.trade_date IS NULL OR calendar.is_trading_day = false
  `);
  const row = response.rows[0] as
    | { misaligned_dates: string | number }
    | undefined;
  const misaligned = asNumber(row?.misaligned_dates) ?? 0;
  return result(
    rule,
    misaligned === 0 ? "passed" : failureStatus(rule),
    misaligned,
    { misalignedDates: misaligned },
  );
}

async function pit(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) {
  const knownAt = context.asset.contract.knownAtField;
  if (knownAt) {
    const invalidCondition =
      context.asset.key === "adj_factor"
        ? sql`${sql.identifier(knownAt)} IS NULL OR ${sql.identifier(knownAt)} < ${sql.identifier("date")}`
        : context.asset.key === "adj_factor_latest"
          ? sql`${sql.identifier(knownAt)} IS NULL OR ${sql.identifier(knownAt)} < ${sql.identifier("date")}`
          : sql`${sql.identifier(knownAt)} IS NULL`;
    const response = await db.execute(sql`
      SELECT count(*) AS invalid_rows
      FROM ${table(context.asset)}
      WHERE ${invalidCondition}
    `);
    const row = response.rows[0] as
      | { invalid_rows: string | number }
      | undefined;
    const invalidRows = asNumber(row?.invalid_rows) ?? 0;
    return result(
      rule,
      invalidRows === 0 ? "passed" : failureStatus(rule),
      invalidRows,
      { knownAtField: knownAt, invalidRows },
    );
  }
  if (context.asset.key === "bar1d_raw") {
    const response = await db.execute(sql`
      SELECT count(*) AS invalid_rows
      FROM bar1d_raw
      WHERE ingested_at IS NULL OR ingested_at < time
    `);
    const row = response.rows[0] as
      | { invalid_rows: string | number }
      | undefined;
    const invalidRows = asNumber(row?.invalid_rows) ?? 0;
    return result(
      rule,
      invalidRows === 0 ? "passed" : failureStatus(rule),
      invalidRows,
      { knownAtField: "ingested_at", invalidRows },
    );
  }
  return result(rule, "error", null, {
    reason: "known_at_contract_missing",
  });
}

const CHECKS = {
  "freshness.business_time": freshness,
  "completeness.required_columns": requiredColumns,
  "uniqueness.primary_key": primaryKey,
  "validity.ohlcv": ohlcv,
  "validity.research_documents": researchDocuments,
  "coverage.active_symbols": coverage,
  "coverage.symbol_links": symbolLinks,
  "consistency.calendar_alignment": calendarAlignment,
  "pit.as_of_known_at": pit,
} satisfies Record<
  QualityRuleDefinition["checkKey"],
  (
    rule: QualityRuleDefinition,
    context: QualityExecutionContext,
  ) => Promise<QualityCheckResult>
>;

export async function executeQualityRule(
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
): Promise<QualityCheckResult> {
  if (rule.assetKey !== context.asset.key) {
    throw new Error("quality rule asset does not match its context");
  }
  try {
    return await CHECKS[rule.checkKey](rule, context);
  } catch (error) {
    return result(rule, "error", null, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
