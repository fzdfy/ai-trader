/**
 * news 管道 — 三源新闻拉取、去重、入库、标的关联。
 *
 * 三源架构（2026-08 定稿）：
 *   ① 财联社电报 — 全市场实时快讯，v1 API + 本地签名，零 key
 *   ② 东财全球资讯 — 东财 7×24 全球财经快讯
 *   ③ 个股新闻 — 按自选股逐个拉取东财个股新闻流
 *
 * 去重策略：ON CONFLICT (source, url) DO NOTHING，幂等写入。
 * 标的关联：从标题/正文中正则匹配 instrument 表中已有 symbol，
 *           写入 news_article_symbol 多对多关联表。
 *
 * 数据源文档参考：a-stock-data V3.6.0（simonlin1212）
 *   - §5.2 cls_telegraph: cls.cn/v1/roll/get_roll_list，sign=md5(sha1(排序 query))
 *   - §5.3 东财全球资讯: np-weblist 直连
 *   - §5.1 个股新闻: search-api-web JSONP
 */

import { db } from "../../../db";
import { newsArticle, newsArticleSymbol, instrument, watchlist } from "../../../db/schema";
import { inArray } from "drizzle-orm";
import crypto from "node:crypto";

// ============================================================================
// 公共工具
// ============================================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT = 15_000;

/** 带超时的 fetch */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = FETCH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 从标题/正文中提取 6 位 A 股代码（去重） */
function extractSymbols(text: string): string[] {
  // 匹配 6 位数字代码，排除明显不是股票代码的（如日期、纯数字金额等上下文判断）
  // 先做宽松匹配，后续用 instrument 表过滤即可
  const matches = text.match(/\b(\d{6})\b/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

/** 从 instrument 表加载所有已知 symbol → 快速白名单 */
let symbolCache: Set<string> | null = null;
async function getKnownSymbols(): Promise<Set<string>> {
  if (symbolCache) return symbolCache;
  const rows = await db.select({ symbol: instrument.symbol }).from(instrument);
  symbolCache = new Set(rows.map((r) => r.symbol));
  console.log(`[news] loaded ${symbolCache.size} known symbols from instrument`);
  return symbolCache;
}

/** 获取自选股 symbol 列表 */
async function getWatchlistSymbols(): Promise<string[]> {
  const rows = await db.selectDistinct({ symbol: watchlist.symbol }).from(watchlist);
  return rows.map((r) => r.symbol);
}

/**
 * 通用新闻入库 — 去重 + 标的关联。
 * @returns 实际写入的条数（不含冲突跳过的）
 */
async function upsertArticles(
  articles: Array<{
    source: string;
    title: string;
    content?: string;
    url: string;
    publishedAt?: Date;
    summary?: string;
    rawJson?: Record<string, unknown>;
  }>,
): Promise<number> {
  if (articles.length === 0) return 0;

  const knownSymbols = await getKnownSymbols();

  // 预先提取每条新闻的关联 symbol（用 instrument 白名单过滤）
  const symbolMap = new Map<string, string[]>();
  for (const a of articles) {
    const text = [a.title, a.content ?? a.summary ?? ""].join(" ");
    const codes = extractSymbols(text).filter((c) => knownSymbols.has(c));
    if (codes.length > 0) symbolMap.set(a.url, codes);
  }

  let inserted = 0;
  // 按批次写入，onConflictDoNothing 保证幂等
  for (let i = 0; i < articles.length; i += 100) {
    const batch = articles.slice(i, i + 100);
    try {
      await db
        .insert(newsArticle)
        .values(
          batch.map((a) => ({
            source: a.source,
            title: a.title,
            content: a.content ?? null,
            url: a.url,
            publishedAt: a.publishedAt ?? null,
            summary: a.summary ?? null,
            rawJson: a.rawJson ?? null,
          })),
        )
        .onConflictDoNothing();

      // onConflictDoNothing 不返回实际写入的行，需回查已入库的 URL
      const urls = batch.map((a) => a.url);
      const existing = await db
        .select({ id: newsArticle.id, url: newsArticle.url })
        .from(newsArticle)
        .where(inArray(newsArticle.url, urls));

      for (const row of existing) {
        const symbols = symbolMap.get(row.url);
        if (symbols && symbols.length > 0) {
          await db
            .insert(newsArticleSymbol)
            .values(symbols.map((s) => ({ articleId: row.id, symbol: s })))
            .onConflictDoNothing();
        }
        inserted++;
      }
    } catch (error) {
      console.error(`[news] batch insert failed (offset=${i}):`, (error as Error).message ?? error);
    }
  }

  return inserted;
}

// ============================================================================
// 财联社电报 (CLS)
// ============================================================================

/**
 * 财联社电报 sign 算法：
 *   sign = md5(sha1(按 key 字典序排序的 query 字符串))
 * 示例：query = "app=CailianpressWeb&os=web&sv=8.7.9"
 *        sha1(query) → hex, md5(sha1_hex) → sign
 *
 * 调用方式：GET https://www.cls.cn/v1/roll/get_roll_list?<query>&sign=<sign>
 * 返回：{ errno: 0, data: { roll_data: [{ ctime, title, brief, content, shareurl }], ... } }
 *
 * 维护线索：财联社改版时，对照 RSSHub lib/routes/cls 更新路径和签名。
 */
function clsSign(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const sha1Hex = crypto.createHash("sha1").update(sorted).digest("hex");
  return crypto.createHash("md5").update(sha1Hex).digest("hex");
}

async function fetchClsTelegraph(): Promise<number> {
  console.log("[news:cls] fetching telegraph...");
  const params: Record<string, string> = {
    app: "CailianpressWeb",
    os: "web",
    sv: "8.7.9",
  };
  const sign = clsSign(params);
  const url = `https://www.cls.cn/v1/roll/get_roll_list?${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&")}&sign=${sign}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Referer: "https://www.cls.cn/telegraph" },
    });
    if (!res.ok) {
      console.error(`[news:cls] HTTP ${res.status}`);
      return 0;
    }
    const json = await res.json();
    if (json.errno !== 0) {
      console.error(`[news:cls] API error: errno=${json.errno}, msg=${json.msg ?? ""}`);
      return 0;
    }

    const rollData = json.data?.roll_data as any[] | undefined;
    if (!rollData?.length) {
      console.log("[news:cls] no new data");
      return 0;
    }

    const articles = rollData
      .filter((r: any) => r.title)
      .map((r: any) => ({
        source: "cls" as const,
        title: r.title as string,
        content: (r.content as string) ?? (r.brief as string) ?? undefined,
        url: (r.shareurl as string) ?? `https://www.cls.cn/detail/${r.id ?? ""}`,
        publishedAt: r.ctime ? new Date(Number(r.ctime) * 1000) : undefined,
        summary: r.brief ? (r.brief as string) : undefined,
        rawJson: r,
      }));

    const count = await upsertArticles(articles);
    console.log(`[news:cls] done, new=${count}/${rollData.length}`);
    return count;
  } catch (error) {
    console.error("[news:cls] fetch failed:", (error as Error).message ?? error);
    return 0;
  }
}

// ============================================================================
// 东财全球资讯 (East Money 7×24)
// ============================================================================

/**
 * 东财全球资讯 — 7×24 财经快讯。
 *
 * 数据源：np-weblist.eastmoney.com（东方财富全球快讯接口）
 * 返回格式：JSON，字段因版本而异，做兼容解析。
 *
 * TODO: 东财接口偶有改版，若接口失效，可对照 a-stock-data §5.3 更新端点。
 */
interface EastMoneyNewsItem {
  id?: string | number;
  title?: string;
  digest?: string;
  content?: string;
  url?: string;
  showtime?: string;
  ctime?: string | number;
}

async function fetchEastMoneyGlobal(): Promise<number> {
  console.log("[news:em_global] fetching 7×24 news...");

  // 东财全球快讯 API（可能随版本变化，这里是主流可用端点）
  const url = "https://np-weblist.eastmoney.com/comm/web/getFastNewsList";
  const params = new URLSearchParams({
    client: "web",
    fastColumn: "102", // 7×24 全球直播
    sortEnd: "",
    pageIndex: "1",
    pageSize: "100",
  });

  try {
    const res = await fetchWithTimeout(`${url}?${params}`, {
      headers: { "User-Agent": UA, Referer: "https://kuaixun.eastmoney.com/" },
    });
    if (!res.ok) {
      console.error(`[news:em_global] HTTP ${res.status}`);
      return 0;
    }
    const json = await res.json();
    const list: EastMoneyNewsItem[] = json.data?.fastNewsList ?? json.data?.list ?? [];

    if (!list.length) {
      console.log("[news:em_global] no new data");
      return 0;
    }

    const articles = list
      .filter((r: EastMoneyNewsItem) => r.title)
      .map((r: EastMoneyNewsItem) => ({
        source: "eastmoney_global" as const,
        title: r.title!,
        content: r.digest ?? r.content ?? undefined,
        url: r.url ?? "",
        publishedAt: parseEastMoneyTime(r.showtime ?? r.ctime),
        summary: r.digest ?? undefined,
        rawJson: r as Record<string, unknown>,
      }));

    const count = await upsertArticles(articles);
    console.log(`[news:em_global] done, new=${count}/${list.length}`);
    return count;
  } catch (error) {
    console.error("[news:em_global] fetch failed:", (error as Error).message ?? error);
    return 0;
  }
}

/** 东财时间格式兼容：字符串 "YYYY-MM-DD HH:mm:ss" 或 Unix 时间戳 */
function parseEastMoneyTime(t: string | number | undefined): Date | undefined {
  if (t == null) return undefined;
  if (typeof t === "number") return new Date(t * 1000);
  const d = new Date(t);
  return isNaN(d.getTime()) ? undefined : d;
}

// ============================================================================
// 个股新闻 (East Money search-api-web)
// ============================================================================

/**
 * 个股新闻 — 东财个股新闻流。
 *
 * 端点：search-api-web.eastmoney.com（JSONP 格式）
 * 对自选股列表逐个拉取，每次返回最近约 20 条。
 *
 * TODO: 该接口返回 JSONP（jQuery...(...)），需要 strip 前后缀再 JSON.parse。
 */
async function fetchStockNews(symbol: string): Promise<number> {
  // 去掉 symbol 的前缀 (sh/sz/bj)，只留 6 位代码
  const code = symbol.includes(".") ? symbol.split(".")[0] : symbol;

  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=${encodeURIComponent(
    JSON.stringify({
      uid: "",
      keyword: code,
      type: ["819"], // 819 = 个股新闻
      client: "web",
      clientType: "web",
      pageIndex: 1,
      pageSize: 20,
    }),
  )}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Referer: "https://so.eastmoney.com/" },
    });
    if (!res.ok) {
      console.error(`[news:stock] ${symbol} HTTP ${res.status}`);
      return 0;
    }

    const text = await res.text();
    // 解析 JSONP：jQuery_xxx(...) → 提取括号中的 JSON
    const jsonpMatch = text.match(/^[^(]*\(([\s\S]*)\)?;?\s*$/);
    if (!jsonpMatch) {
      console.error(`[news:stock] ${symbol} JSONP parse failed`);
      return 0;
    }

    const json = JSON.parse(jsonpMatch[1]);
    const list: any[] = json.Data ?? json.data ?? [];

    if (!list.length) return 0;

    const articles = list
      .filter((r: any) => r.Title || r.title)
      .map((r: any) => ({
        source: "eastmoney_stock" as const,
        title: (r.Title ?? r.title) as string,
        content: (r.Content ?? r.content) as string | undefined,
        url: (r.Url ?? r.url) as string,
        publishedAt:
          (r.Date ?? r.date)
            ? new Date(r.Date ?? r.date)
            : r.ShowTime
              ? new Date(r.ShowTime)
              : undefined,
        rawJson: r,
      }));

    const count = await upsertArticles(articles);
    if (count > 0) console.log(`[news:stock] ${symbol} new=${count}`);
    return count;
  } catch (error) {
    console.error(`[news:stock] ${symbol} fetch failed:`, (error as Error).message ?? error);
    return 0;
  }
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * newsPipeRun — 新闻管道主函数
 *
 * 由 sync-worker cron (每 2 分钟) 调度执行。
 * 三大源独立拉取，单个失败不影响其他：
 *   - 财联社电报（全市场实时快讯）
 *   - 东财全球资讯（7×24）
 *   - 个股新闻（按自选股遍历，间隔 200ms 防封）
 */
export async function newsPipeRun(): Promise<void> {
  console.log("[news] === start ===");
  const startTime = Date.now();
  let total = 0;

  // ① 财联社电报
  try {
    total += await fetchClsTelegraph();
  } catch (error) {
    console.error("[news:cls] unexpected error:", error);
  }

  // ② 东财全球资讯
  try {
    total += await fetchEastMoneyGlobal();
  } catch (error) {
    console.error("[news:em_global] unexpected error:", error);
  }

  // ③ 个股新闻 — 按自选股逐个拉取（有间隔防封）
  try {
    const symbols = await getWatchlistSymbols();
    console.log(`[news:stock] fetching for ${symbols.length} symbols`);
    for (const symbol of symbols) {
      try {
        total += await fetchStockNews(symbol);
      } catch {
        // 单股失败不阻塞
      }
      // 个股接口间隔 200ms，避免触发东财反爬
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (error) {
    console.error("[news:stock] unexpected error:", error);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[news] === done. new=${total} elapsed=${elapsed}s ===`);
}
