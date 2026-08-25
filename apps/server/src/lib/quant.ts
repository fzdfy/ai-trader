/**
 * quant 数据服务 HTTP 客户端。
 *
 * server 端行情/板块/资金流数据统一改由 apps/quant（FastAPI 数据服务）提供，
 * 替代原先直接调用 stock-sdk。quant 服务内部已内置东财防封限流与数据源降级链，
 * 返回 snake_case 字段（对齐 DB 表结构），此处只做 HTTP 转发与类型声明。
 */
import { createLogger } from "./logger";

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

/** quant 请求超时（毫秒）。上游（东财/腾讯等）网络抖动可能 hang，必须限时避免卡死同步管道 */
const QUANT_TIMEOUT_MS = 20_000;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${QUANT_URL}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(QUANT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error({ status: res.status, path }, "quant 请求失败");
    throw new Error(`quant ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const quant = {
  /** 个股资金流（日级，最近 120 个交易日） */
  fundFlow120d: (symbol: string) =>
    getJson<FundFlowDay[]>(`/api/v1/data/fund-flow-120d?symbol=${encodeURIComponent(symbol)}`),

  /** 板块列表（行业/概念） */
  boardList: (boardType: "industry" | "concept") =>
    getJson<BoardList>(`/api/v1/data/board-list?board_type=${boardType}`),

  /** 板块成分股 */
  boardConstituents: (boardCode: string) =>
    getJson<BoardConstituentItem[]>(
      `/api/v1/data/board-constituents?board_code=${encodeURIComponent(boardCode)}`,
    ),

  /** 板块指数日 K 线（不传 limit 则返回全量历史） */
  boardKline: (boardCode: string, limit?: number) => {
    let path = `/api/v1/data/board-kline?board_code=${encodeURIComponent(boardCode)}`;
    if (limit != null) path += `&limit=${limit}`;
    return getJson<BoardKlineBar[]>(path);
  },

  /** 板块资金流向（行业/概念/地域 × 今日/5日/10日；不传 topN 则返回全量板块） */
  boardFundFlow: (boardType: string, period = "today", topN?: number) => {
    let path = `/api/v1/data/board-fund-flow?board_type=${boardType}&period=${period}`;
    if (topN != null) path += `&top_n=${topN}`;
    return getJson<BoardFundFlow>(path);
  },

  /** 全市场个股资金流排行（按主力净流入降序；不传 topN 则返回全量个股） */
  fundFlowRank: (topN?: number) => {
    let path = `/api/v1/data/fund-flow-rank`;
    if (topN != null) path += `?top_n=${topN}`;
    return getJson<FundFlowRankItem[]>(path);
  },

  /** 个股日 K 线（腾讯主源，adjust 复权口径 qfq/hfq/none；失败降级 mootdx/百度不复权；不再走东财） */
  stockKline: (
    symbol: string,
    limit = 500,
    start?: string,
    end?: string,
    adjust: "qfq" | "hfq" | "none" = "qfq",
  ) => {
    let path = `/api/v1/data/kline?symbol=${encodeURIComponent(symbol)}&tf=1d&limit=${limit}&adjust=${adjust}`;
    if (start) path += `&start=${encodeURIComponent(start)}`;
    if (end) path += `&end=${encodeURIComponent(end)}`;
    return getJson<StockKlineBar[]>(path);
  },
};
