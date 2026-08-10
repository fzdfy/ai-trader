import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

export type NewsArticle = {
  id: number;
  source: string;
  title: string;
  content: string | null;
  url: string;
  publishedAt: string | null;
  summary: string | null;
  sentiment: string | null;
  ingestedAt: string;
};

type NewsResponse = {
  success: boolean;
  data: NewsArticle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** 新闻来源中文标签映射 */
export const SOURCE_LABELS: Record<string, string> = {
  cls: "财联社",
  eastmoney_global: "东财全球",
  eastmoney_stock: "东财个股",
};

export function useNewsInfinite(symbol?: string) {
  return useInfiniteQuery<NewsResponse>({
    queryKey: ["news", symbol ?? "all"],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(PAGE_SIZE) });
      if (symbol) params.set("symbol", symbol);
      const res = await fetch(`/api/v1/news?${params}`);
      if (!res.ok) throw new Error(`新闻加载失败: ${res.status}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page >= lastPage.totalPages) return undefined;
      return lastPage.page + 1;
    },
    initialPageParam: 1,
    staleTime: 60_000,
  });
}
