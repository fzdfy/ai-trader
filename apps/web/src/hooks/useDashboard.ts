import { useQuery } from "@tanstack/react-query";

export interface DashboardFundFlowItem {
  rank: number;
  code: string;
  name: string;
  changePercent: number | null;
  mainNetInflow: number | null;
  topStockName: string | null;
}

export interface DashboardData {
  asOf: {
    market: string | null;
    boards: string | null;
    fundFlow: string | null;
    limitUp: string | null;
    stockPool: string | null;
    news: string | null;
    review: string | null;
  };
  breadth: {
    industry: { total: number; rising: number; falling: number; flat: number };
    concept: { total: number; rising: number; falling: number; flat: number };
  };
  fundFlow: {
    breadth: {
      industry: { total: number; positive: number };
      concept: { total: number; positive: number };
    };
    industry: DashboardFundFlowItem[];
    concept: DashboardFundFlowItem[];
  };
  limitUp: {
    total: number;
    maxBoard: number;
    maxSealAmount: number;
    avgTurnover: number;
    openedCount: number;
    ladder: Array<{ count: number; names: string[] }>;
    leaders: Array<{
      symbol: string;
      name: string;
      industry: string | null;
      count: number;
    }>;
  };
  stockPool: {
    date: string | null;
    total: number;
    items: Array<{
      symbol: string;
      name: string;
      source: string | null;
      score: number | null;
    }>;
  };
  news: Array<{
    id: number;
    source: string;
    title: string;
    url: string;
    publishedAt: string | null;
  }>;
  review: {
    date: string;
    summary: string;
    updatedAt: string;
  } | null;
}

export function useDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardData> => {
      const response = await fetch("/api/v1/dashboard");
      const json = (await response.json()) as {
        success: boolean;
        data?: DashboardData;
        error?: string;
      };
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "每日看板数据获取失败");
      }
      return json.data;
    },
    refetchInterval: 60_000,
  });
}
