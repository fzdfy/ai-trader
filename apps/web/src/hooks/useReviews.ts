/**
 * 复盘数据 hook（TanStack Query）。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------- types ----------

export type ReviewSectionType = "fundflow" | "mainline" | "stockpool" | "summary";

export interface ReviewSection {
  type: ReviewSectionType;
  title: string;
  chart: "bar" | "table" | "text";
}

export interface ReviewSkill {
  instructions: string;
  sections: ReviewSection[];
}

export interface SectorFlowItem {
  code: string;
  name: string;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  topStockName: string | null;
  topStockCode: string | null;
}

export interface MainlineItem {
  boardName: string;
  reason: string;
}

export interface ReviewStockPoolItem {
  symbol: string;
  name: string;
  source: string | null;
  score: string | null;
}

export interface Review {
  date: string;
  fundflow: SectorFlowItem[];
  mainline: MainlineItem[];
  stockPool: ReviewStockPoolItem[];
  summary: string;
  skill: ReviewSkill;
  updatedAt: string;
}

export interface ReviewListItem {
  date: string;
  summary: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ---------- hooks ----------

export function useReviewSkillQuery() {
  return useQuery({
    queryKey: ["reviews", "skill"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reviews/skill");
      const json = (await res.json()) as ApiResponse<{ content: ReviewSkill }>;
      return json.success ? json.data.content : null;
    },
  });
}

export function useUpdateReviewSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: ReviewSkill) => {
      const res = await fetch("/api/v1/reviews/skill", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json()) as ApiResponse<{ content: ReviewSkill }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data.content;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", "skill"] });
    },
  });
}

export function useGenerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date: string): Promise<Review> => {
      const res = await fetch("/api/v1/reviews/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = (await res.json()) as ApiResponse<Review>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reviews", "list"] });
      queryClient.invalidateQueries({ queryKey: ["reviews", data.date] });
    },
  });
}

export function useReviewListQuery() {
  return useQuery({
    queryKey: ["reviews", "list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reviews/list");
      const json = (await res.json()) as ApiResponse<ReviewListItem[]>;
      return json.success ? json.data : [];
    },
  });
}

export function useReviewQuery(date: string | null) {
  return useQuery({
    queryKey: ["reviews", date ?? ""],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reviews/${encodeURIComponent(date ?? "")}`);
      const json = (await res.json()) as ApiResponse<Review | null>;
      return json.success ? json.data : null;
    },
    enabled: !!date,
  });
}
