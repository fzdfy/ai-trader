/**
 * 新闻管道：财联社全市场电报 + quant 市场新闻 + quant 自选股新闻。
 *
 * 东财内容请求全部经过 quant Provider；server 只负责调用、统一入库和标的关联。
 * 单个源失败不会中断其他源，全部完成后用 job_run 失败标记本次同步不完整。
 */
import crypto from "node:crypto";

import { db } from "../../../db";
import { watchlist } from "../../../db/schema";
import { quant, type NewsItem } from "../../../lib/quant";
import {
  ingestNewsItems,
  syncStockNews,
} from "../../../services/stock-content-service";
import { updateProgress } from "../progress";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT = 15_000;
const STOCK_FAIL_RATIO = 0.5;

interface SourceResult {
  ok: boolean;
  inserted: number;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = FETCH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function watchlistSymbols(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ symbol: watchlist.symbol })
    .from(watchlist)
    .orderBy(watchlist.symbol);
  return rows.map((row) => row.symbol);
}

function clsSign(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const sha1Hex = crypto.createHash("sha1").update(sorted).digest("hex");
  return crypto.createHash("md5").update(sha1Hex).digest("hex");
}

async function fetchClsTelegraph(): Promise<SourceResult> {
  const params = { app: "CailianpressWeb", os: "web", sv: "8.7.9" };
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const url = `https://www.cls.cn/v1/roll/get_roll_list?${query}&sign=${clsSign(params)}`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Referer: "https://www.cls.cn/telegraph" },
    });
    if (!response.ok) return { ok: false, inserted: 0 };
    const payload = (await response.json()) as {
      errno?: number;
      data?: { roll_data?: Array<Record<string, unknown>> };
    };
    if (payload.errno !== 0) return { ok: false, inserted: 0 };
    const items: NewsItem[] = (payload.data?.roll_data ?? [])
      .filter((row) => typeof row.title === "string" && row.title)
      .map((row) => ({
        source: "cls",
        title: String(row.title),
        content:
          typeof row.content === "string"
            ? row.content
            : typeof row.brief === "string"
              ? row.brief
              : null,
        url:
          typeof row.shareurl === "string"
            ? row.shareurl
            : `https://www.cls.cn/detail/${String(row.id ?? "")}`,
        published_at: row.ctime ? new Date(Number(row.ctime) * 1000).toISOString() : null,
        related_symbols: [],
      }));
    return { ok: true, inserted: await ingestNewsItems(items) };
  } catch (error) {
    console.error("[news:cls] fetch failed:", (error as Error).message ?? error);
    return { ok: false, inserted: 0 };
  }
}

async function fetchMarketNews(): Promise<SourceResult> {
  try {
    const items = await quant.marketNews(100);
    return { ok: true, inserted: await ingestNewsItems(items) };
  } catch (error) {
    console.error("[news:market] fetch failed:", (error as Error).message ?? error);
    return { ok: false, inserted: 0 };
  }
}

export async function newsPipeRun(): Promise<void> {
  console.log("[news] === start ===");
  const startedAt = Date.now();
  let inserted = 0;
  const failures: string[] = [];

  updateProgress(0, 3, "开始同步财联社电报");
  const cls = await fetchClsTelegraph();
  inserted += cls.inserted;
  if (!cls.ok) failures.push("财联社电报");

  updateProgress(1, 3, "开始同步市场新闻");
  const market = await fetchMarketNews();
  inserted += market.inserted;
  if (!market.ok) failures.push("市场新闻");

  updateProgress(2, 3, "开始同步自选股新闻");
  try {
    const symbols = await watchlistSymbols();
    let failed = 0;
    for (const symbol of symbols) {
      const result = await syncStockNews(symbol);
      inserted += result.inserted;
      if (!result.ok) failed++;
    }
    if (symbols.length > 0 && failed / symbols.length >= STOCK_FAIL_RATIO) {
      failures.push(`自选股新闻(${failed}/${symbols.length} 失败)`);
    }
  } catch (error) {
    console.error("[news:stock] unexpected error:", error);
    failures.push("自选股新闻");
  }
  updateProgress(3, 3, `新闻同步完成，新增 ${inserted} 条`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[news] === done. new=${inserted} elapsed=${elapsed}s ===`);
  if (failures.length > 0) {
    throw new Error(`[news] 数据源拉取失败，本次同步不完整: ${failures.join("、")}`);
  }
}
