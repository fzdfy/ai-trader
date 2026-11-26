import { asc, sql, type SQLWrapper } from "drizzle-orm";

/**
 * Board ranks are stored as text for upstream compatibility, but the API
 * contract is numeric (`1, 2, ..., 10`), not lexicographic (`1, 10, 100`).
 */
export function numericTextAscending(column: SQLWrapper) {
  return asc(sql`cast(${column} as integer)`);
}
