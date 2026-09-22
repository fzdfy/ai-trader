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
import crypto from "node:crypto";

// ============================================================================
// 公共工具
// ============================================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT = 15_000;

/**
 * 数据源拉取结果。
 *   ok：拉取+解析是否成功（与「有无新增」无关 —— 新闻按 (source,url) 去重，0 新增属正常）
 *   inserted：实际写入条数
 * 用于区分「上游故障」与「本次无新数据」，避免把源故障静默当成任务成功。
 */
interface SourceResult {
  ok: boolean;
  inserted: number;
}

/** 个股新闻源失败占比阈值：超过则视为该源整体故障（单股偶发失败可容忍） */
const STOCK_FAIL_RATIO = 0.5;

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

/** A 股合法代码前缀（沪/深/北），用于过滤日期、编号、金额等 6 位数字误匹配 */
const LEGAL_CODE_PREFIX = /^(60|68|00|30|43|83|87|88|92)/;

/** 从标题/正文中提取 6 位 A 股代码（去重，仅保留合法前缀） */
function extractSymbols(text: string): string[] {
  // 匹配 6 位数字后按 A 股代码前缀过滤，排除日期(19xx/20xx)、纯编号、金额等；
  // 最终仍以 instrument 白名单为准（getKnownSymbols 过滤）。
  const matches = text.match(/\b(\d{6})\b/g);
  if (!matches) return [];
  return [...new Set(matches.filter((c) => LEGAL_CODE_PREFIX.test(c)))];
}

/** instrument 白名单：裸代码(6 位) → 标准 symbol(600519.SH)，用于关联过滤与规范化 */
let symbolCache: Map<string, string> | null = null;
let symbolCacheAt = 0;
const SYMBOL_CACHE_TTL_MS = 10 * 60 * 1000;

async function getKnownSymbols(): Promise<Map<string, string>> {
  const now = Date.now();
  if (symbolCache && now - symbolCacheAt < SYMBOL_CACHE_TTL_MS) return symbolCache;
  const rows = await db.select({ symbol: instrument.symbol }).from(instrument);
  // instrument.symbol 为带后缀标准格式（如 600519.SH），extractSymbols 提取的是 6 位裸代码，
  // 用裸代码作 key 才能命中，value 保留标准 symbol 以便落库与查询端（标准 symbol）对齐。
  const map = new Map<string, string>();
  for (const r of rows) {
    const bare = r.symbol.split(".")[0];
    if (bare && !map.has(bare)) map.set(bare, r.symbol);
  }
  symbolCache = map;
  symbolCacheAt = now;
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

  // 规范化 url：空 url 生成幂等兜底键，避免 (source, url) 主键冲突导致丢数据
  const normalized = articles.map((a) => {
    if (a.url) return a;
    const hash = crypto
      .createHash("md5")
      .update(
        [a.source, a.title, a.publishedAt?.getTime() ?? "", a.content ?? a.summary ?? ""].join("|"),
      )
      .digest("hex");
    return { ...a, url: `fallback:${a.source}:${hash}` };
  });

  const knownSymbols = await getKnownSymbols();

  // 预先提取每条新闻的关联 symbol（用 instrument 白名单过滤，并规范化为标准 symbol）
  const symbolMap = new Map<string, string[]>();
  for (const a of normalized) {
    const text = [a.title, a.content ?? a.summary ?? ""].join(" ");
    const symbols = extractSymbols(text)
      .map((c) => knownSymbols.get(c))
      .filter((s): s is string => s != null);
    if (symbols.length > 0) symbolMap.set(a.url, symbols);
  }

  let inserted = 0;
  // 按批次写入，onConflictDoNothing 保证幂等；returning 仅返回真正新增的行
  for (let i = 0; i < normalized.length; i += 100) {
    const batch = normalized.slice(i, i + 100);
    try {
      const insertedRows = await db
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
        .onConflictDoNothing()
        .returning({ id: newsArticle.id, url: newsArticle.url });

      // 仅对真正新增的文章建立标的关联（旧文章关联已存在，无需重复处理）
      for (const row of insertedRows) {
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
      // 入库失败 = 数据丢失，向上抛出（由调用方标记该源失败），不可静默吞掉
      console.error(`[news] batch insert failed (offset=${i}):`, (error as Error).message ?? error);
      throw error;
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

async function fetchClsTelegraph(): Promise<SourceResult> {
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
      return { ok: false, inserted: 0 };
    }
    const json = (await res.json()) as {
      errno?: number;
      msg?: string;
      data?: { roll_data?: any[] };
    };
    if (json.errno !== 0) {
      console.error(`[news:cls] API error: errno=${json.errno}, msg=${json.msg ?? ""}`);
      return { ok: false, inserted: 0 };
    }

    const rollData = json.data?.roll_data as any[] | undefined;
    if (!rollData?.length) {
      console.log("[news:cls] no new data");
      return { ok: true, inserted: 0 };
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
    return { ok: true, inserted: count };
  } catch (error) {
    console.error("[news:cls] fetch failed:", (error as Error).message ?? error);
    return { ok: false, inserted: 0 };
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

async function fetchEastMoneyGlobal(): Promise<SourceResult> {
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
      return { ok: false, inserted: 0 };
    }
    const json = (await res.json()) as {
      data?: { fastNewsList?: EastMoneyNewsItem[]; list?: EastMoneyNewsItem[] };
    };
    const list: EastMoneyNewsItem[] = json.data?.fastNewsList ?? json.data?.list ?? [];

    if (!list.length) {
      console.log("[news:em_global] no new data");
      return { ok: true, inserted: 0 };
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
    return { ok: true, inserted: count };
  } catch (error) {
    console.error("[news:em_global] fetch failed:", (error as Error).message ?? error);
    return { ok: false, inserted: 0 };
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
 * 参数说明（对照 a-stock-data §5.1）：type 必须为 "cmsArticleWebOld"，
 * 且需带 param.cmsArticleWebOld 子对象（searchScope/sort/pageIndex/pageSize 等）。
 * 旧写法 type:["819"] 已被东财废弃，会返回 {"msg":"包含未知的type：819","result":{}}。
 * 响应为 JSONP：<callback>(<json>)，需 strip 括号后再 JSON.parse，
 * 正文列表位于 result.cmsArticleWebOld。
 */
async function fetchStockNews(symbol: string): Promise<SourceResult> {
  // 去掉 symbol 的前缀 (sh/sz/bj)，只留 6 位代码
  const code = symbol.includes(".") ? symbol.split(".")[0] : symbol;

  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery_news&param=${encodeURIComponent(
    JSON.stringify({
      uid: "",
      keyword: code,
      type: ["cmsArticleWebOld"], // 个股新闻（旧值 "819" 已废弃）
      client: "web",
      clientType: "web",
      clientVersion: "curr",
      param: {
        cmsArticleWebOld: {
          searchScope: "default",
          sort: "default",
          pageIndex: 1,
          pageSize: 20,
          preTag: "",
          postTag: "",
        },
      },
    }),
  )}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Referer: "https://so.eastmoney.com/" },
    });
    if (!res.ok) {
      console.error(`[news:stock] ${symbol} HTTP ${res.status}`);
      return { ok: false, inserted: 0 };
    }

    const text = await res.text();
    // 解析 JSONP：<callback>(<json>) → 取首个 '(' 与末个 ')' 之间的 JSON。
    // 不可用贪婪正则捕获括号内容：([\s\S]*) 会把结尾的 ) 与 ; 一并吞入，
    // 导致 JSON.parse 报 "Unexpected non-whitespace character after JSON"。
    const open = text.indexOf("(");
    const close = text.lastIndexOf(")");
    if (open < 0 || close <= open) {
      console.error(`[news:stock] ${symbol} JSONP parse failed`);
      return { ok: false, inserted: 0 };
    }

    const json = JSON.parse(text.slice(open + 1, close));
    const list: any[] = json.result?.cmsArticleWebOld ?? [];

    if (!list.length) return { ok: true, inserted: 0 };

    const articles = list
      .filter((r: any) => r.title)
      .map((r: any) => ({
        source: "eastmoney_stock" as const,
        title: r.title as string,
        content: (r.content as string | undefined) ?? undefined,
        url: (r.url as string) ?? "",
        publishedAt: parseEastMoneyTime(r.date),
        rawJson: r,
      }));

    const count = await upsertArticles(articles);
    if (count > 0) console.log(`[news:stock] ${symbol} new=${count}`);
    return { ok: true, inserted: count };
  } catch (error) {
    console.error(`[news:stock] ${symbol} fetch failed:`, (error as Error).message ?? error);
    return { ok: false, inserted: 0 };
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
  const failures: string[] = [];

  // ① 财联社电报（单次源：HTTP/签名/解析任一失败即视为源故障）
  try {
    const r = await fetchClsTelegraph();
    total += r.inserted;
    if (!r.ok) failures.push("财联社电报");
  } catch (error) {
    console.error("[news:cls] unexpected error:", error);
    failures.push("财联社电报");
  }

  // ② 东财全球资讯（单次源）
  try {
    const r = await fetchEastMoneyGlobal();
    total += r.inserted;
    if (!r.ok) failures.push("东财全球资讯");
  } catch (error) {
    console.error("[news:em_global] unexpected error:", error);
    failures.push("东财全球资讯");
  }

  // ③ 个股新闻 — 按自选股逐个拉取（有间隔防封）；单股偶发失败可容忍，
  //    但多数自选股失败则视为源故障（接口整体不可用），避免静默漏数据。
  try {
    const symbols = await getWatchlistSymbols();
    console.log(`[news:stock] fetching for ${symbols.length} symbols`);
    let stockFailed = 0;
    for (const symbol of symbols) {
      try {
        const r = await fetchStockNews(symbol);
        total += r.inserted;
        if (!r.ok) stockFailed++;
      } catch (error) {
        console.error(`[news:stock] ${symbol} unexpected error:`, error);
        stockFailed++;
      }
      // 个股接口间隔 200ms，避免触发东财反爬
      await new Promise((r) => setTimeout(r, 200));
    }
    if (symbols.length > 0 && stockFailed / symbols.length >= STOCK_FAIL_RATIO) {
      failures.push(`个股新闻(${stockFailed}/${symbols.length} 失败)`);
    }
  } catch (error) {
    console.error("[news:stock] unexpected error:", error);
    failures.push("个股新闻");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[news] === done. new=${total} elapsed=${elapsed}s ===`);

  // 任一数据源拉取失败：本次同步不完整，抛错使 job_run 标 failed，而非静默 success。
  // 说明：新闻按 (source,url) 去重，「0 新增」属正常不触发失败；仅上游故障才抛错。
  if (failures.length > 0) {
    throw new Error(`[news] 数据源拉取失败，本次同步不完整: ${failures.join("、")}`);
  }
}
