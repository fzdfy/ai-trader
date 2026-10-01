/**
 * quant 数据服务 HTTP 客户端。
 *
 * server 端行情/板块/资金流数据统一改由 apps/quant（FastAPI 数据服务）提供，
 * 替代原先直接调用 stock-sdk。quant 服务内部已内置东财防封限流与数据源降级链，
 * 返回 snake_case 字段（对齐 DB 表结构），此处只做 HTTP 转发与类型声明。
 */
import { createLogger } from "./logger";
import { traceHeaders } from "./request-context";

const log = createLogger("quant");

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

/** 个股资金流日级一条（quant /fund-flow-120d 返回，单位：元） */
export interface FundFlowDay {
  date: string;
  main_net: number;
  small_net: number;
  mid_net: number;
  large_net: number;
  super_net: number;
  close: number | null;
  change_pct: number | null;
}

/** 板块列表一条（quant /board-list 返回） */
export interface BoardListItem {
  name: string;
  code: string;
  change_pct: number | null;
  total_market_cap: number | null;
  turnover_rate: number | null;
  leader: string;
  leader_change: number | null;
}

/** 板块列表（quant /board-list 返回） */
export interface BoardList {
  board_type: string;
  total: number;
  rows: BoardListItem[];
}

/** 板块成分股一条（quant /board-constituents 返回） */
export interface BoardConstituentItem {
  code: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  turnover_rate: number | null;
  amount: number | null;
}

/** 板块指数日 K 线一根（quant /board-kline 返回） */
export interface BoardKlineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
}

/** 板块资金流向一条（quant /board-fund-flow 返回，金额单位：元，净占比：%） */
export interface BoardFundFlowItem {
  rank: number;
  name: string;
  code: string;
  change_pct: number | null;
  main_net: number | null;
  main_pct: number | null;
  leader: string;
  super_large_net: number | null;
  large_net: number | null;
  medium_net: number | null;
  small_net: number | null;
  top_stock_code: string;
  top_stock_name: string;
}

/** 板块资金流向排名结果（quant /board-fund-flow 返回） */
export interface BoardFundFlow {
  board_type: string;
  period: string;
  total: number;
  rows: BoardFundFlowItem[];
}

/** 因子代码运行校验结果（quant /factors/validate-code 返回） */
export interface FactorCodeValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 校验阶段：syntax（AST 静态）/ data（样本不足）/ runtime（执行报错或未产出）/ executed（已成功执行） */
  stage: "syntax" | "data" | "runtime" | "executed";
  /** 未通过时的原因 */
  reason: string | null;
  /** 实际参与执行校验的样本标的 */
  sampleSymbols: string[];
}

/** 因子表达式运行校验结果（quant /factors/validate-expression 返回；与代码侧同口径） */
export interface FactorExpressionValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 校验阶段：syntax（引擎编译）/ data（样本不足）/ runtime（求值报错或未产出）/ executed（已成功求值） */
  stage: "syntax" | "data" | "runtime" | "executed";
  /** 未通过时的原因 */
  reason: string | null;
  /** 实际参与求值校验的样本标的 */
  sampleSymbols: string[];
}

/** 个股资金流排行一条（quant /fund-flow-rank 返回，金额单位：元，净占比：%） */
export interface FundFlowRankItem {
  code: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  main_net: number | null;
  main_pct: number | null;
  super_large_net: number | null;
  large_net: number | null;
  medium_net: number | null;
  small_net: number | null;
}

/** 个股日 K 线一根（quant /kline 返回；腾讯主源，adjust 复权口径，降级 mootdx/百度不复权） */
export interface StockKlineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  adj_factor: number | null;
}

/** 分段仿射复权参数的一个生效步（quant /adjust-params 返回；date 为 YYYY-MM-DD） */
export interface AdjustParamPoint {
  date: string;
  /** p_t：前复权乘法因子（送转/拆股累计比，无送转段恒为 1） */
  qfq_ratio: number;
  /** D_t：前复权加法偏移（最新段恒为 0） */
  qfq_offset: number;
}

/** Route A 复权仿射参数（quant /adjust-params 返回；对齐 server 端 adj_factor / adj_factor_latest） */
export interface AdjustParams {
  symbol: string;
  /** S：后复权乘法常量（标的级全局） */
  scale: number;
  /** 最后一个参数生效日 = 窗口内最新交易日 */
  latest_date: string;
  /** B：后复权加法常量（标的级全局） */
  hfq_base: number;
  source: string;
  points: AdjustParamPoint[];
}

/** 同花顺强势股 + 题材归因一条（quant /hot-reason 返回；code 为 6 位裸代码） */
export interface HotReasonItem {
  code: string;
  name: string;
  reason: string;
  close: number | null;
  change: number | null;
  change_pct: number | null;
  turnover_rate: number | null;
  amount: number | null;
  volume: number | null;
  large_order_net: number | null;
  market: string;
}

/** 全市场龙虎榜中的一只股票（quant /daily-dragon-tiger 返回；金额单位：万元；code 为 6 位裸代码） */
export interface DragonTigerStock {
  code: string;
  name: string;
  reason: string;
  close: number;
  change_pct: number;
  net_buy_wan: number;
  buy_wan: number;
  sell_wan: number;
  turnover_pct: number;
}

/** 全市场龙虎榜汇总（quant /daily-dragon-tiger 返回） */
export interface DailyDragonTiger {
  date: string;
  total_records: number;
  stocks: DragonTigerStock[];
  note: string | null;
}

/** 涨停池一条（quant /limit-up-pool 返回；code 为 6 位裸代码，落库前转标准 symbol） */
export interface LimitUpPoolItem {
  code: string;
  name: string;
  limit_up_count: number;
  is_limit_up: boolean;
  first_limit_time: string | null;
  open_count: number;
  seal_amount: number | null;
  limit_type: string | null;
  industry: string | null;
  concepts: string | null;
  turnover_rate: number | null;
  amount: number | null;
  float_market_cap: number | null;
}

/** 单个数据源的熔断 / 限流运行时快照（quant /sources/health 返回；当前仅东财有，其余无健康遥测） */
export interface ProviderBreakerStatus {
  /** 是否处于熔断（冷却期内东财请求直接失败，交由降级链兜底） */
  tripped: boolean;
  /** 当前连续失败计数 */
  fail_streak: number;
  /** 触发熔断的连续失败阈值 */
  threshold: number;
  /** 熔断冷却时长（秒） */
  cooldown_sec: number;
  /** 冷却剩余时长（秒），未熔断为 0 */
  cooldown_remaining_sec: number;
  /** 东财两次请求最小间隔（秒） */
  min_interval_sec: number;
  /** 已登记的 WAF 绕过 URL 数 */
  bypass_url_count: number;
}

/** 单个数据源的运行态（quant /sources/health 返回） */
export interface ProviderHealth {
  name: string;
  /** 熔断快照；为 null 表示该源无健康遥测（当前仅东财实现熔断） */
  breaker: ProviderBreakerStatus | null;
}

/** 单个能力的降级链运行态（quant /sources/health 返回） */
export interface CapabilityHealth {
  /** 能力名（如 kline / board_kline） */
  capability: string;
  /** 降级链（源名有序，主源在前） */
  chain: string[];
  /** 链首主源 */
  primary: string | null;
  /** 当前生效源：链中首个「健康」的源；全部不可用为 null */
  active_source: string | null;
  /** 是否已从主源降级（active_source 非链首） */
  degraded: boolean;
  /** 链中是否仍有可用源 */
  available: boolean;
}

/** 数据源健康 / 降级链运行态快照（quant /sources/health 返回） */
export interface DataSourcesHealth {
  providers: ProviderHealth[];
  capabilities: CapabilityHealth[];
}

/** quant 请求超时（毫秒）。上游（东财/腾讯等）网络抖动可能 hang，必须限时避免卡死同步管道 */
const QUANT_TIMEOUT_MS = 20_000;

/**
 * 全量/翻页重接口超时（毫秒）。东财 clist 在 quant 端走 _em_get 串行限流（1s 间隔），
 * 全量板块/个股需翻几十页；且收盘后多个同步管道并发触发时会排队等同一把全局锁，
 * 单接口 20s 内常拿不完，故放宽到 3 分钟（与 fundFlowRank 一致）。
 */
const BULK_TIMEOUT_MS = 180_000;

/**
 * 板块成分股专用超时（毫秒）。东财 clist 单页硬上限只有 100 行（实测 pz=100/300/1000 均只返回
 * 100 行），融资融券（3874 只）需串行翻 39 页，叠加 quant 端 `_em_get` 的 1.5s 最小发起间隔，
 * 单个大板块实测需 259s，历史最高 376s，远超 BULK_TIMEOUT_MS。
 *
 * 而 quant 的 `_em_lock` 是进程级全局锁且覆盖真正的 HTTP 调用，故 worker 侧并发拉取不会提升吞吐，
 * 只会让后续请求排队等同一把锁、把排队时间计进各自的超时预算（实测 4 路并发同一板块，墙钟=4×
 * 单请求）。因此 constituents 管道已改为串行拉取，此处按「单板块最坏耗时」取 600s 留足余量，
 * 避免大板块超时返回空 → 累积到「连续 20 个板块未取到成分股」而误判上游不可用、提前中止整轮。
 */
const CONSTITUENTS_TIMEOUT_MS = 600_000;

/**
 * 因子运行校验超时（毫秒）。quant 侧需先从库中取少量标的的日线样本，
 * 再实际执行/求值（代码走受限沙箱，单次执行看门狗 10s），故在默认 20s 上略作放宽。
 */
const FACTOR_VALIDATE_TIMEOUT_MS = 30_000;

async function getJson<T>(path: string, timeoutMs = QUANT_TIMEOUT_MS): Promise<T> {
  const res = await fetch(`${QUANT_URL}${path}`, {
    // 携带调用链上下文（X-Request-Id / X-Job-Run-Id 等），使 quant 访问日志能挂回本次调用来源
    headers: { Accept: "application/json", ...traceHeaders() },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error({ status: res.status, path, error_type: "QuantHttpError" }, "quant 请求失败");
    throw new Error(`quant ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown, timeoutMs = QUANT_TIMEOUT_MS): Promise<T> {
  const res = await fetch(`${QUANT_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...traceHeaders(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const resBody = await res.text().catch(() => "");
    log.error({ status: res.status, path, error_type: "QuantHttpError" }, "quant 请求失败");
    throw new Error(`quant ${path} -> ${res.status}: ${resBody.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const quant = {
  /** 个股资金流（日级，最近 120 个交易日） */
  fundFlow120d: (symbol: string) =>
    getJson<FundFlowDay[]>(`/api/v1/data/fund-flow-120d?symbol=${encodeURIComponent(symbol)}`),

  /** 板块列表（行业/概念；concept 400+ 需翻页，放宽超时） */
  boardList: (boardType: "industry" | "concept") =>
    getJson<BoardList>(`/api/v1/data/board-list?board_type=${boardType}`, BULK_TIMEOUT_MS),

  /** 板块成分股（大板块需串行翻数十页，超时见 CONSTITUENTS_TIMEOUT_MS 注释） */
  boardConstituents: (boardCode: string) =>
    getJson<BoardConstituentItem[]>(
      `/api/v1/data/board-constituents?board_code=${encodeURIComponent(boardCode)}`,
      CONSTITUENTS_TIMEOUT_MS,
    ),

  /** 板块指数日 K 线（不传 limit 则返回全量历史） */
  boardKline: (boardCode: string, limit?: number) => {
    let path = `/api/v1/data/board-kline?board_code=${encodeURIComponent(boardCode)}`;
    if (limit != null) path += `&limit=${limit}`;
    return getJson<BoardKlineBar[]>(path);
  },

  /** 板块资金流向（行业/概念/地域 × 今日/5日/10日；不传 topN 则返回全量板块，需翻页，放宽超时） */
  boardFundFlow: (boardType: string, period = "today", topN?: number) => {
    let path = `/api/v1/data/board-fund-flow?board_type=${boardType}&period=${period}`;
    if (topN != null) path += `&top_n=${topN}`;
    return getJson<BoardFundFlow>(path, BULK_TIMEOUT_MS);
  },

  /** 全市场个股资金流排行（按主力净流入降序；不传 topN 则返回全量个股） */
  fundFlowRank: (topN?: number) => {
    let path = `/api/v1/data/fund-flow-rank`;
    if (topN != null) path += `?top_n=${topN}`;
    // 全量个股（5000+）在东财分页 + _em_get 串行限流下需约 60~120s，远超默认 20s，
    // 故单独放宽超时，避免资金流排行在手动同步中恒定超时报错。
    return getJson<FundFlowRankItem[]>(path, BULK_TIMEOUT_MS);
  },

  /** 当日涨停池（date 为 YYYY-MM-DD，缺省为今天）；走东财全局串行锁，并发排队下放宽超时 */
  limitUpPool: (date?: string) => {
    let path = `/api/v1/data/limit-up-pool`;
    if (date) path += `?date=${encodeURIComponent(date)}`;
    return getJson<LimitUpPoolItem[]>(path, BULK_TIMEOUT_MS);
  },

  /** 同花顺当日强势股 + 题材归因（date 为 YYYY-MM-DD，缺省为今天） */
  hotReason: (date?: string) => {
    let path = `/api/v1/data/hot-reason`;
    if (date) path += `?date=${encodeURIComponent(date)}`;
    return getJson<HotReasonItem[]>(path);
  },

  /** 全市场龙虎榜汇总（tradeDate 为 YYYY-MM-DD，minNetBuy 单位万元，缺省不限）；走东财全局串行锁，放宽超时 */
  dailyDragonTiger: (tradeDate?: string, minNetBuy?: number) => {
    let path = `/api/v1/data/daily-dragon-tiger`;
    const qs: string[] = [];
    if (tradeDate) qs.push(`trade_date=${encodeURIComponent(tradeDate)}`);
    if (minNetBuy != null) qs.push(`min_net_buy=${minNetBuy}`);
    if (qs.length) path += `?${qs.join("&")}`;
    return getJson<DailyDragonTiger>(path, BULK_TIMEOUT_MS);
  },

  /**
   * 个股日 K 线（主源腾讯，adjust 复权口径 qfq/hfq/none）。
   * 传入 source 可强制指定单一数据源（如 "tencent"、"eastmoney"），失败时不走降级链而是抛错。
   * kline-1d 管道以 adjust=none 落库原始价到 bar1d_raw（北交所因腾讯无历史改传 source=eastmoney）；
   * 复权由 adj-factor 管道反解出的因子经 bar1d_qfq / bar1d_hfq 视图按需派生。
   */
  stockKline: (
    symbol: string,
    limit = 500,
    start?: string,
    end?: string,
    adjust: "qfq" | "hfq" | "none" = "qfq",
    source?: string,
  ) => {
    let path = `/api/v1/data/kline?symbol=${encodeURIComponent(symbol)}&tf=1d&limit=${limit}&adjust=${adjust}`;
    if (start) path += `&start=${encodeURIComponent(start)}`;
    if (end) path += `&end=${encodeURIComponent(end)}`;
    if (source) path += `&source=${encodeURIComponent(source)}`;
    return getJson<StockKlineBar[]>(path);
  },

  /**
   * 复权仿射参数（quant /adjust-params；腾讯仿射复权反解，Route A 分段仿射模型）。
   * 返回 {scale, latest_date, hfq_base, source, points:[{date, qfq_ratio, qfq_offset}]}，
   * 供 adj-factor 管道幂等 upsert 到 adj_factor / adj_factor_latest。
   * 默认腾讯；北交所改传 source=eastmoney。失败时抛错不走降级链（避免污染 qfq 口径）。
   */
  adjustParams: (symbol: string, limit = 800, source?: string) => {
    let path = `/api/v1/data/adjust-params?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
    if (source) path += `&source=${encodeURIComponent(source)}`;
    return getJson<AdjustParams>(path);
  },

  /** 数据源健康 / 熔断状态 + 各能力降级链运行态（运维观测；纯内存读快照，不发外部请求） */
  dataSourcesHealth: () => getJson<DataSourcesHealth>(`/api/v1/data/sources/health`),

  /**
   * 校验 Python 因子代码能否运行：quant 侧先做 AST 白名单静态校验，
   * 再用本地库的真实日线小样本实际执行一遍 compute(data)，确认能跑通且产出有效数值。
   */
  validateFactorCode: (code: string) =>
    postJson<FactorCodeValidationResult>(
      "/api/v1/factors/validate-code",
      { code },
      FACTOR_VALIDATE_TIMEOUT_MS,
    ),

  /**
   * 校验因子表达式能否运行：quant 侧先用 AKQuant ExpressionParser 编译，
   * 再用本地库的真实日线小样本在内存 DataFrame 上实际求值，确认能跑通且产出有效数值。
   * 与服务端 TS 静态白名单互补——白名单是引擎算子的镜像、会漂移且比引擎更严。
   */
  validateFactorExpression: (expression: string) =>
    postJson<FactorExpressionValidationResult>(
      "/api/v1/factors/validate-expression",
      { expression },
      FACTOR_VALIDATE_TIMEOUT_MS,
    ),
};
