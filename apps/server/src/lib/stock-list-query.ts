import { asc, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";

export type InstrumentListQuery =
  | { ok: true; page: number; limit: number; q: string }
  | { ok: false; message: string };

export type WatchlistQuery =
  | { ok: true; mode: "legacy"; q: string }
  | { ok: true; mode: "paginated"; page: number; limit: number; q: string }
  | { ok: false; message: string };

const pageSchema = z.coerce.number().int().min(1);
const limitSchema = z.coerce.number().int().min(1).max(200);
const querySchema = z.string().trim().max(200);

function queryValue(search: URLSearchParams, key: string): string | undefined {
  const value = search.get(key);
  return value == null ? undefined : value;
}

function parsePagination(
  search: URLSearchParams,
  defaults?: { page: number; limit: number },
): { page: number; limit: number; q: string } | null {
  const page = pageSchema.safeParse(queryValue(search, "page") ?? defaults?.page ?? "");
  const limit = limitSchema.safeParse(queryValue(search, "limit") ?? defaults?.limit ?? "");
  const q = querySchema.safeParse(queryValue(search, "q") ?? "");
  if (!page.success || !limit.success || !q.success) return null;
  return { page: page.data, limit: limit.data, q: q.data };
}

export function parseInstrumentListQuery(search: URLSearchParams): InstrumentListQuery {
  const parsed = parsePagination(search, { page: 1, limit: 50 });
  return parsed
    ? { ok: true, ...parsed }
    : { ok: false, message: "page, limit, or q is invalid" };
}

export function parseWatchlistQuery(search: URLSearchParams): WatchlistQuery {
  const hasPage = search.has("page");
  const hasLimit = search.has("limit");
  const q = querySchema.safeParse(queryValue(search, "q") ?? "");
  if (!q.success) return { ok: false, message: "q is invalid" };
  if (!hasPage && !hasLimit) return { ok: true, mode: "legacy", q: q.data };
  if (hasPage !== hasLimit) {
    return { ok: false, message: "page and limit must be provided together" };
  }
  const parsed = parsePagination(search);
  return parsed
    ? { ok: true, mode: "paginated", ...parsed }
    : { ok: false, message: "page or limit is invalid" };
}

export function stockSymbolAscending(column: SQLWrapper) {
  return asc(column);
}
