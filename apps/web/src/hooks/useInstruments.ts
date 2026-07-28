import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { authClient } from "../lib/auth-client";

const PAGE_SIZE = 50;

// ---------- types ----------

export type Instrument = Record<string, unknown> & {
  symbol: string;
  code: string;
  name: string;
  exchange: string;
  marketId: string;
  market: string;
  listDate: string | null;
  delistDate: string | null;
  status: string;
  updatedAt: string;
};

interface PaginatedResponse {
  success: boolean;
  data: Instrument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------- helpers ----------

function getUserId() {
  return authClient.useSession().data?.user.id;
}

// ---------- hooks ----------

export function useInstrumentsQuery(q: string) {
  return useInfiniteQuery({
    queryKey: ["instruments", q],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(PAGE_SIZE),
      });
      if (q) params.set("q", q);

      const res = await fetch(`/api/v1/instruments?${params}`);
      const json: PaginatedResponse = await res.json();
      return json;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page >= lastPage.totalPages) return;
      return lastPage.page + 1;
    },
    initialPageParam: 1,
  });
}

export function useWatchlistQuery() {
  const userId = getUserId();

  return useQuery({
    queryKey: ["watchlist"],
    queryFn: async () => {
      const res = await fetch("/api/v1/watchlist", {
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = await res.json();
      return (json.success ? json.data : []) as string[];
    },
    enabled: !!userId,
  });
}

export function useAddWatchlist() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (symbol: string) => {
      await fetch("/api/v1/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ symbol }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useRemoveWatchlist() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (symbol: string) => {
      await fetch(`/api/v1/watchlist/${symbol}`, {
        method: "DELETE",
        headers: { "X-User-Id": userId ?? "" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["watchlistInstruments"] });
    },
  });
}

export function useWatchlistInstrumentsQuery() {
  const userId = getUserId();

  return useQuery({
    queryKey: ["watchlistInstruments"],
    queryFn: async () => {
      const res = await fetch("/api/v1/watchlist/instruments", {
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = await res.json();
      return (json.success ? json.data : []) as Instrument[];
    },
    enabled: !!userId,
  });
}

export type KlineBar = Record<string, unknown> & {
  time: string;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount: string | null;
};

export function useKlineQuery(symbol: string | null) {
  return useQuery({
    queryKey: ["kline", symbol],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol: symbol!, tf: "1d", limit: "500" });
      const res = await fetch(`/api/v1/kline?${params}`);
      const json = await res.json();
      return (json.success ? json.data : []) as KlineBar[];
    },
    enabled: !!symbol,
  });
}
