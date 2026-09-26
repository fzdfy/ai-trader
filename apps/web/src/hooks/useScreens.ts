import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface ScreenItem {
  symbol: string;
  name: string;
  score: number; // 综合得分 0-100
  close: number; // 最新收盘价
  changePct?: number | null; // 最新涨跌幅(%)，红涨绿跌
  amount?: number | null; // 最新交易日成交额(元)
  mainNetInflow?: number | null; // 主力资金净流入(元)，未命中资金流榜为 null
  factorScores: Record<string, number>; // 因子名 → 得分 0-100
  industry?: string | null; // 所属行业（三级行业链条，/ 连接）
  sectors?: string[]; // 所属概念板块（全部，按热度排序；列表展示前 3 个，hover 展示全部）
  sectorTotal?: number; // 所属概念板块总数
}

export interface ScreenResult {
  items: ScreenItem[];
  total: number; // 参与打分的标的数
  strategy: { id: number; name: string };
  /** quant 侧选股总耗时(ms) */
  elapsedMs?: number;
  /** quant 侧日线取数耗时(ms) */
  fetchMs?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/** 排除条件：市值 < 100 亿 / 市盈亏损 / ST / 科创板 / 创业板 */
export type ScreenExclude = "smallCap" | "loss" | "st" | "star" | "chinext";

export interface RunScreenInput {
  strategyId: number;
  topN: number;
  /** 股票池范围：全部 / 行业 / 板块 / 前端结果集合 / 涨幅榜 / 成交额榜 / 百日涨停榜 */
  scope?: "all" | "industry" | "concept" | "resultSet" | "gain3" | "amount1b" | "limitUp1";
  /** scope=industry|concept 时，选中的板块代码（多选） */
  boardCodes?: string[];
  /** scope=resultSet 时，前端结果集合中的完整 symbol 列表 */
  symbols?: string[];
  /** 排除条件（多选），默认全部排除 */
  excludes?: ScreenExclude[];
}

// ---------- hooks ----------

/** 执行选股：请求成功后把结果写入 useQuery 缓存（queryKey 由调用方的 search 参数派生） */
export function useRunScreen(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  // 在 hook 顶层读取会话，通过 X-User-Id 让后端识别本人创建的私有因子
  const userId = authClient.useSession().data?.user.id;
  return useMutation({
    mutationFn: async (input: RunScreenInput): Promise<ScreenResult> => {
      const res = await fetch("/api/v1/screens/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<ScreenResult>;
      if (!json.success) throw new Error(json.error ?? "选股失败");
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}

/** 只读缓存查询：按 queryKey 读取上次选股结果，不发起请求（结果由 useRunScreen 写入） */
export function useScreenResult(queryKey: QueryKey) {
  return useQuery<ScreenResult | undefined, Error, ScreenResult | undefined, QueryKey>({
    queryKey,
    enabled: false,
    staleTime: Infinity,
  });
}
