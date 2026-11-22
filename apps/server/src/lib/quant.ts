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

export interface MarketAssetQuote {
  symbol: string;
  price: number;
  pre_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change_pct: number | null;
  volume: number | null;
  amount: number | null;
  quoted_at: string;
  source: string;
  price_unit: string;
}

export interface MarketAssetBar {
  symbol: string;
  session_date: string;
  bucket_start: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  source: string;
}

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

/** 逐日 IC 一条（quant /factors/evaluate 返回；date 为 YYYY-MM-DD） */
export interface FactorIcPoint {
  date: string;
  ic: number;
  rankIc: number;
  count: number;
}

/** IC / RankIC 序列汇总指标（quant /factors/evaluate 返回） */
export interface FactorIcSummary {
  mean: number | null;
  std: number | null;
  icir: number | null;
  /** t 值 = ICIR × sqrt(交易日数) */
  tStat: number | null;
  /** IC > 0 的交易日占比 */
  positiveRatio: number | null;
  /** 年化 ICIR = ICIR × sqrt(252) */
  icirAnnual: number | null;
  count: number;
}

/** 分层回测单层汇总（quant /factors/evaluate 返回；第 1 层因子值最低） */
export interface FactorLayerSummary {
  layer: number;
  cumRet: number;
  meanRet: number;
  annRet: number | null;
  winRate: number;
  days: number;
}

/** 多空组合（最高层 - 最低层）汇总（quant /factors/evaluate 返回） */
export interface FactorLongShortSummary {
  cumRet: number;
  meanRet: number;
  annRet: number | null;
  winRate: number | null;
}

/** 分层回测结果（quant /factors/evaluate 返回；nav 键为 L1..LN 与 longShort） */
export interface FactorLayerBacktest {
  count: number;
  dates: string[];
  nav: Record<string, number[]>;
  summary: FactorLayerSummary[];
  longShort: FactorLongShortSummary;
}

/** 因子衰退曲线一点（quant /factors/evaluate 返回；不同持有期下的 IC 水平） */
export interface FactorDecayPoint {
  horizon: number;
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  count: number;
}

/** 分层换手率单层（quant /factors/evaluate 返回；第 1 层因子值最低） */
export interface FactorTurnoverLayer {
  layer: number;
  turnover: number | null;
}

/** 分位换手率（quant /factors/evaluate 返回；相邻两日同层成分股更替比例，越低越稳定、成本越低） */
export interface FactorTurnover {
  mean: number | null;
  byLayer: FactorTurnoverLayer[];
  /** 参与计算的相邻日对数 */
  count: number;
}

/** 因子秩自相关（quant /factors/evaluate 返回；相邻两日因子排名 Spearman 相关，越接近 1 越稳定） */
export interface FactorRankAutocorr {
  mean: number | null;
  std: number | null;
  count: number;
}

/** 多空组合 Alpha/Beta 回归（quant /factors/evaluate 返回；多空日收益对等权市场日收益 OLS） */
export interface FactorAlphaBeta {
  /** 日频回归截距 */
  alpha: number | null;
  /** 回归斜率（市场暴露，多空应接近 0） */
  beta: number | null;
  rSquared: number | null;
  /** 日频 alpha 按 252 交易日复利年化 */
  annualAlpha: number | null;
  count: number;
}

/** IC 正态性 QQ 采样点（quant /factors/evaluate 返回） */
export interface FactorIcQqPoint {
  theoretical: number;
  sample: number;
}

/** IC 序列正态性检验（quant /factors/evaluate 返回；偏度/峰度/Jarque-Bera + QQ 点） */
export interface FactorIcNormality {
  /** 偏度（正态为 0） */
  skew: number | null;
  /** 峰度（正态为 3） */
  kurtosis: number | null;
  jarqueBera: number | null;
  /** JB 检验 p 值（越小越拒绝正态） */
  pValue: number | null;
  count: number;
  qq: FactorIcQqPoint[];
}

/** 月度 IC（quant /factors/evaluate 返回；按自然月聚合的 IC / RankIC 均值） */
export interface FactorMonthlyIc {
  /** 自然月（YYYY-MM） */
  month: string;
  ic: number | null;
  rankIc: number | null;
  count: number;
}

/** 样本切分信息（quant /factors/evaluate 返回；validRatio>0 且样本充足时非空） */
export interface FactorEvaluationSplit {
  /** 样本外占比（0~0.5） */
  validRatio: number;
  /** 样本外起始交易日（YYYY-MM-DD）；样本内(train)全部早于该日，两段不重叠 */
  splitDate: string;
}

/** 样本外(valid)区间汇总（quant /factors/evaluate 返回；未切分或样本不足时整体为 null） */
export interface FactorValidSummary {
  ic: FactorIcSummary;
  rankIc: FactorIcSummary;
  longShort: FactorLongShortSummary;
  turnover: FactorTurnover;
  rankAutocorr: FactorRankAutocorr;
  alphaBeta: FactorAlphaBeta;
  monthlyIc: FactorMonthlyIc[];
  /** 样本外有效截面交易日数 */
  sampleCount: number;
  startDate: string;
  endDate: string;
}

/**
 * 因子检验结果（quant /factors/evaluate 返回：IC / RankIC / ICIR / 分层回测 / 衰退）。
 * ic / rankIc / layers 均在样本内(train)区间计算；validRatio>0 时另返回 split 与 valid 样本外指标。
 */
export interface FactorEvaluation {
  expression: string;
  universe: {
    symbols: number;
    bars: number;
    startDate: string;
    endDate: string;
  };
  horizon: number;
  ic: FactorIcSummary;
  rankIc: FactorIcSummary;
  icSeries: FactorIcPoint[];
  layers: FactorLayerBacktest;
  /** 分位换手率（样本内） */
  turnover: FactorTurnover;
  /** 秩自相关（样本内） */
  rankAutocorr: FactorRankAutocorr;
  /** 多空 Alpha/Beta 回归（样本内） */
  alphaBeta: FactorAlphaBeta;
  /** IC 序列正态性（样本内） */
  icNormality: FactorIcNormality;
  /** 月度 IC（样本内） */
  monthlyIc: FactorMonthlyIc[];
  decay: FactorDecayPoint[];
  /** 样本切分信息；未切分（validRatio=0 或样本不足）时为 null */
  split: FactorEvaluationSplit | null;
  /** 样本外(OOS)指标；未切分或样本外无法计算时为 null */
  valid: FactorValidSummary | null;
  elapsedMs: number;
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

/** 个股实时行情（quant /quotes 返回）。 */
export interface StockQuote {
  symbol: string;
  name: string | null;
  last: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  pre_close: number | null;
  volume: number | null;
  amount: number | null;
  change: number | null;
  change_pct: number | null;
  turnover_rate: number | null;
  pe: number | null;
  pb: number | null;
  limit_up: number | null;
  limit_down: number | null;
  is_stale: boolean;
  stale_reason: string | null;
  extra: Record<string, unknown>;
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

export interface NewsItem {
  source: string;
  title: string;
  content: string | null;
  url: string;
  published_at: string | null;
  related_symbols: string[];
}

export interface AnnouncementItem {
  source: string;
  source_id: string;
  title: string;
  announcement_type: string | null;
  published_at: string;
  url: string;
  pdf_url: string | null;
}

export interface AnalystConsensusItem {
  symbol: string;
  as_of_date: string;
  fiscal_year: number;
  eps_min: number | null;
  eps_mean: number | null;
  eps_max: number | null;
  analyst_count: number | null;
  source: string;
  raw: Record<string, unknown>;
}

export interface FinancialSnapshotItem {
  symbol: string;
  report_period: string;
  statement_type: string;
  source: string;
  metrics: Record<string, number | string | null>;
  raw: Record<string, unknown>;
}

export interface ValuationDailyItem {
  symbol: string;
  trade_date: string;
  pe_ttm: number | null;
  pe_static: number | null;
  pb: number | null;
  ps_ttm: number | null;
  pcf: number | null;
  turnover_rate: number | null;
  trade_status: string;
  is_st: boolean;
  source: string;
  raw: Record<string, unknown>;
}

export interface ResearchReportProviderItem {
  source: string;
  source_id: string;
  symbol: string;
  title: string;
  institution: string | null;
  analysts: string[];
  rating: string | null;
  industry: string | null;
  publish_date: string;
  pdf_url: string | null;
  forecasts: Array<{
    horizon: "current" | "next" | "next_two";
    eps: number | null;
    raw_value: string | number | null;
  }>;
  raw: Record<string, unknown>;
}

export interface ResearchReportExtraction {
  storage_key: string;
  sha256: string;
  file_size: number;
  extractor_version: string;
  embedding_model: string | null;
  page_count: number;
  full_text: string;
  pages: Array<{ page: number; text: string }>;
  chunks: Array<{
    chunk_index: number;
    page_from: number;
    page_to: number;
    text: string;
    embedding: number[] | null;
  }>;
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

/**
 * 因子检验（IC/分层/衰退）超时（毫秒）。quant 侧需从库中取最多 maxSymbols 只标的、
 * 约 bars 根日线组成面板，再逐因子值/分层/多持有期计算；取数走 COPY 直出已优化到秒级，
 * 但衰退曲线含多个持有期重复评估，故放宽到 2 分钟避免默认 20s 误杀。
 */
const FACTOR_EVALUATE_TIMEOUT_MS = 120_000;

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
  liveQuotes: (symbols: string[]) =>
    getJson<Record<string, StockQuote>>(
      `/api/v1/data/quotes?codes=${encodeURIComponent(symbols.join(","))}`,
    ),

  marketAssetQuotes: (symbols: string[]) =>
    getJson<Record<string, MarketAssetQuote>>(
      `/api/v1/data/market-assets/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
    ),

  marketAssetMinute: (
    symbol: string,
    tf: "1m" | "5m",
    limit = 500,
    start?: string,
    end?: string,
  ) => {
    const query = new URLSearchParams({
      symbol,
      tf,
      limit: String(limit),
    });
    if (start) query.set("start", start);
    if (end) query.set("end", end);
    return getJson<MarketAssetBar[]>(`/api/v1/data/market-assets/minute?${query}`);
  },

  marketAssetDaily: (
    symbol: string,
    limit = 500,
    start?: string,
    end?: string,
  ) => {
    const query = new URLSearchParams({ symbol, limit: String(limit) });
    if (start) query.set("start", start);
    if (end) query.set("end", end);
    return getJson<MarketAssetBar[]>(`/api/v1/data/market-assets/daily?${query}`);
  },

  stockNews: (symbol: string, pageSize = 20) =>
    getJson<NewsItem[]>(
      `/api/v1/data/stock-news?symbol=${encodeURIComponent(symbol)}&page_size=${pageSize}`,
    ),

  marketNews: (limit = 50) => getJson<NewsItem[]>(`/api/v1/data/market-news?limit=${limit}`),

  announcements: (symbol: string, sinceDays = 30, pageSize = 30) =>
    getJson<AnnouncementItem[]>(
      `/api/v1/data/announcements?symbol=${encodeURIComponent(symbol)}&since_days=${sinceDays}&page_size=${pageSize}`,
    ),

  analystConsensus: (symbol: string, asOfDate?: string) => {
    let path = `/api/v1/data/analyst-consensus?symbol=${encodeURIComponent(symbol)}`;
    if (asOfDate) path += `&as_of_date=${encodeURIComponent(asOfDate)}`;
    return getJson<AnalystConsensusItem[]>(path);
  },

  financialSnapshot: (symbol: string) =>
    getJson<FinancialSnapshotItem[]>(
      `/api/v1/data/financial-snapshot?symbol=${encodeURIComponent(symbol)}`,
    ),

  financialStatements: (symbol: string, periods = 8) =>
    getJson<FinancialSnapshotItem[]>(
      `/api/v1/data/financial-statements?symbol=${encodeURIComponent(symbol)}&periods=${periods}`,
    ),

  valuationHistory: (symbol: string, start?: string, end?: string) => {
    let path = `/api/v1/data/valuation-history?symbol=${encodeURIComponent(symbol)}`;
    if (start) path += `&start=${encodeURIComponent(start)}`;
    if (end) path += `&end=${encodeURIComponent(end)}`;
    return getJson<ValuationDailyItem[]>(path, 120_000);
  },

  researchReports: (symbol: string, page = 1, pageSize = 100, beginTime?: string) => {
    let path = `/api/v1/research/reports?symbol=${encodeURIComponent(symbol)}&page=${page}&page_size=${pageSize}`;
    if (beginTime) path += `&begin_time=${encodeURIComponent(beginTime)}`;
    return getJson<{
      symbol: string;
      page: number;
      page_size: number;
      total: number;
      items: ResearchReportProviderItem[];
    }>(path, 120_000);
  },

  extractResearchReport: (params: {
    pdf_url: string;
    source_id: string;
    publish_date: string;
    embed?: boolean;
  }) =>
    postJson<ResearchReportExtraction>(
      "/api/v1/research/extract",
      { ...params, embed: params.embed ?? true },
      15 * 60_000,
    ),

  embedResearchTexts: (texts: string[]) =>
    postJson<{ model: string; vectors: number[][] }>("/api/v1/research/embed", { texts }, 120_000),

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

  /**
   * 因子检验：在 date×symbol 面板上计算 IC / RankIC / ICIR、分层回测（多空）与因子衰退曲线。
   * 复权口径固定 hfq（后复权）——qfq 含未来分红信息会造成前视偏差。
   * expression（kind=expression）与 code（kind=python，须定义 compute(data)）二选一，code 优先；
   * horizon 为主持有期（默认 1）；layers 为分层数（默认 5）；bars 为面板回溯交易日数（默认 500）。
   */
  evaluateFactor: (params: {
    expression?: string;
    code?: string;
    horizon?: number;
    layers?: number;
    bars?: number;
    maxSymbols?: number;
    minSymbols?: number;
    horizons?: number[];
    /** 样本外占比（0~0.5）：>0 时按交易日切分样本内/样本外，另返回 split 与 valid 指标 */
    validRatio?: number;
    /**
     * PIT 复权快照时刻（ISO 日期/时间）：只采用 known_at <= asOf 的复权因子版本，
     * 等价于"站在历史某时刻"回放，消除前视偏差。缺省即使用最新快照。
     */
    asOf?: string;
  }) => postJson<FactorEvaluation>("/api/v1/factors/evaluate", params, FACTOR_EVALUATE_TIMEOUT_MS),
};
