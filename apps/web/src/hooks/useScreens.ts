import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

// ---------- types ----------

export interface ScreenItem {
  symbol: string;
  name: string;
  score: number; // 综合得分 0-100
  close: number; // 最新收盘价
  factorScores: Record<string, number>; // 因子名 → 得分 0-100
  industry?: string | null; // 所属行业（三级行业链条，/ 连接）
  sectors?: string[]; // 所属概念板块（全部，按热度排序；列表展示前 3 个，hover 展示全部）
  sectorTotal?: number; // 所属概念板块总数
}

export interface ScreenResult {
  items: ScreenItem[];
  total: number; // 参与打分的标的数
  strategy: { id: number; name: string };
}

// ---------- 指标缩略图类型（对齐 quant indicators.py 契约） ----------

export interface SeriesSpec {
  name: string;
  kind: "line" | "bar" | "area";
  values: (number | null)[];
}

export interface BandSpec {
  name: string;
  upper: (number | null)[];
  lower: (number | null)[];
}

export interface PaneSpec {
  title: string;
  series: SeriesSpec[];
  bands: BandSpec[];
  refs: number[];
}

export interface FactorViz {
  name: string;
  label: string;
  panes: PaneSpec[];
}

export interface SymbolIndicators {
  symbol: string;
  factors: FactorViz[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface RunScreenInput {
  strategyId: number;
  topN: number;
  /** 股票池范围：全部 / 行业 / 板块 / 前端结果集合 / 涨幅榜 / 成交额榜 / 百日涨停榜 */
  scope?: "all" | "industry" | "concept" | "resultSet" | "gain3" | "amount1b" | "limitUp2";
  /** scope=industry|concept 时，选中的板块代码（多选） */
  boardCodes?: string[];
  /** scope=resultSet 时，前端结果集合中的完整 symbol 列表 */
  symbols?: string[];
}

// ---------- hooks ----------

/** 执行选股：请求成功后把结果写入 useQuery 缓存（queryKey 由调用方的 search 参数派生） */
export function useRunScreen(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RunScreenInput): Promise<ScreenResult> => {
      const res = await fetch("/api/v1/screens/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

/** 拉取选股结果的指标缩略图序列（按策略因子 + 结果股票池） */
export function useScreenIndicators(strategyId: number, symbols: string[]) {
  return useQuery({
    queryKey: ["screen-indicators", strategyId, symbols],
    queryFn: async (): Promise<SymbolIndicators[]> => {
      const res = await fetch("/api/v1/screens/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId, symbols }),
      });
      const json = (await res.json()) as ApiResponse<{ items: SymbolIndicators[] }>;
      if (!json.success) throw new Error(json.error ?? "指标序列获取失败");
      return json.data.items;
    },
    enabled: strategyId > 0 && symbols.length > 0,
    staleTime: 60_000,
  });
}
