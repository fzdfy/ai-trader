/**
 * 资金流向数据 hook（TanStack Query）。
 *
 * 排行接口从 fund_flow_rank 表读取最新快照并 SQL 分页：
 *   - 行业 / 概念 / 个股：/api/v1/fundflow/rank（page / page_size 分页）
 */
import { useQuery } from "@tanstack/react-query";

/** 资金流排行项（行业 / 概念 / 个股通用；板块无 price，个股无 topStockName） */
export interface FundFlowRankRow {
  [key: string]: unknown;
  rank: number;
  code: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  /** 主力净流入最大个股代码（板块） */
  topStockCode: string | null;
  /** 主力净流入最大个股名称（板块） */
  topStockName: string | null;
}

/** 资金流排行分页结果 */
export interface FundFlowRankPage {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: FundFlowRankRow[];
}

/** 资金流排行（行业 / 概念 / 个股），分页查询 */
export function useFundFlowRankQuery(
  category: "industry" | "concept" | "stock",
  page: number,
  pageSize = 50,
) {
  return useQuery({
    queryKey: ["fundflow-rank", category, page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/fundflow/rank?category=${category}&page=${page}&page_size=${pageSize}`,
      );
      const json = await res.json();
      return (json.success
        ? {
            total: json.total ?? 0,
            page: json.page ?? page,
            pageSize: json.limit ?? pageSize,
            totalPages: json.totalPages ?? 1,
            rows: (json.data ?? []) as FundFlowRankRow[],
          }
        : {
            total: 0,
            page,
            pageSize,
            totalPages: 1,
            rows: [] as FundFlowRankRow[],
          }) as FundFlowRankPage;
    },
    staleTime: 60_000,
  });
}
