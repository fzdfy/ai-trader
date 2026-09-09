/**
 * 复盘数据 hook（TanStack Query）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------- types ----------

/** 复盘方法论（instructions，前端可编辑；模块结构固定，不再由 skill 配置） */
export interface ReviewSkill {
  instructions: string;
}

/** 自描述渲染模块：固定模块配置 + 服务端已组装的数据 data（前端据此动态渲染） */
export interface ReviewSection {
  type: string;
  title: string;
  chart: string;
  data: unknown;
}

/** 资金流排行项（行业 / 概念 / 个股共用） */
export interface FundFlowItem {
  code: string;
  name: string;
  rank: number;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  price: number | null;
  topStockName: string | null;
  topStockCode: string | null;
}

/** 资金流向模块数据：行业 / 概念 / 个股各 top5 */
export interface FundFlowData {
  industry: FundFlowItem[];
  concept: FundFlowItem[];
  stock: FundFlowItem[];
}

/** 主线项：板块 + 核心个股 + 理由 */
export interface MainlineItem {
  boardName: string;
  coreStocks: string[];
  reason: string;
}

/** 当日板块异动项 */
export interface BoardChangeItem {
  code: string;
  name: string;
  changePercent: number | null;
  delta: number | null;
}

/** 连板个股项 */
export interface LimitUpItem {
  symbol: string;
  name: string | null;
  consecutiveCount: number;
  changePercent: number | null;
  lastPrice: number | null;
}

/** 涨停池条目（limit_up_pool 原始快照，含连板梯队 / 封板 / 题材信息） */
export interface LimitUpPoolItem {
  symbol: string;
  name: string;
  limitUpCount: number;
  isLimitUp: boolean;
  limitType: string | null;
  openCount: number;
  sealAmount: number | null;
  industry: string | null;
  concepts: string | null;
  turnoverRate: number | null;
  amount: number | null;
}

/** 市场情绪温度结果（全市场单日 0~100 标量 + 各维度得分 + 原始指标） */
export interface MarketEmotionResult {
  date: string | null;
  metric: { preset: string; version: number; displayName: string; instruction: string };
  /** 0~100 情绪温度，越高越热 */
  temperature: number;
  limitUpCount: number;
  bustRate: number;
  maxConsecutive: number;
  sealStrength: number;
  /** 各维度得分（key 为 MARKET_EMOTION_DEF 维度 key） */
  dimScores: Record<string, number>;
}

export interface ReviewStockPoolItem {
  symbol: string;
  name: string;
  source: string | null;
  score: string | null;
}

/** 选股池模块数据：今日列表 + 新增 / 移除 */
export interface StockPoolData {
  today: ReviewStockPoolItem[];
  added: ReviewStockPoolItem[];
  removed: ReviewStockPoolItem[];
}

export interface Review {
  date: string;
  /** 自描述渲染模块（服务端组装，含渲染数据），前端据此动态渲染 */
  sections: ReviewSection[];
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

// ---------- 流式生成 ----------

export type ReviewStreamStatus = "idle" | "streaming" | "done" | "error";

/** 解析单个 SSE 事件块（以空行分隔），提取 event 与 data 字段 */
function parseSseEvent(block: string): { event: string; data: string } {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  return { event, data: dataLines.join("\n") };
}

/**
 * 流式生成复盘（模块就绪即推送，前端收到即渲染）。
 *
 * 服务端按 skill.sections 顺序逐个推送已就绪模块（结构化模块先行、agent 模块
 * 生成后推送、summary 压轴），不推 data=null 占位。前端按 index 填充 sections，
 * 渲染时仅展示已就绪模块（空槽跳过），无「生成中」占位卡。
 */
export function useGenerateReviewStream() {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<ReviewSection[]>([]);
  const [status, setStatus] = useState<ReviewStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (date: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSections([]);
      setStatus("streaming");
      setError(null);

      try {
        const res = await fetch("/api/v1/reviews/generate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error("流式生成失败");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const { event, data } = parseSseEvent(block);
            if (!data) continue;
            if (event === "section") {
              const { index = 0, ...section } = JSON.parse(data) as ReviewSection & { index?: number };
              setSections((prev) => {
                const next = [...prev];
                next[index] = section;
                return next;
              });
            } else if (event === "done") {
              setStatus("done");
            } else if (event === "error") {
              const err = JSON.parse(data) as { message?: string };
              setError(err.message ?? "复盘生成失败，请稍后重试。");
              setStatus("error");
            }
          }
        }

        // 流正常结束但未收到 done 事件时兜底标记完成，并刷新缓存
        setStatus((prev) => (prev === "streaming" ? "done" : prev));
        queryClient.invalidateQueries({ queryKey: ["reviews", "list"] });
        queryClient.invalidateQueries({ queryKey: ["reviews", date] });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError((err as Error)?.message ?? "复盘生成失败，请稍后重试。");
        setStatus("error");
      }
    },
    [queryClient],
  );

  // 组件卸载时中止未完成的流式请求
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { sections, status, error, start };
}
