import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";
import {
  STOCK_LIST_PAGE_SIZE,
  watchlistPageQueryKey,
} from "../lib/stock-list-state";

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

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------- helpers ----------

function useUserId() {
  return authClient.useSession().data?.user.id;
}

function useWatchlistUserId() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) {
      queryClient.removeQueries({ queryKey: ["watchlist"] });
      queryClient.removeQueries({ queryKey: ["watchlistInstruments"] });
    }
    previousUserId.current = userId;
  }, [queryClient, userId]);

  return userId;
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
      const json: PaginatedResponse<Instrument> = await res.json();
      return json;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page >= lastPage.totalPages) return;
      return lastPage.page + 1;
    },
    initialPageParam: 1,
  });
}

export function useInstrumentPageQuery(
  q: string,
  page: number,
  limit = STOCK_LIST_PAGE_SIZE,
) {
  return useQuery({
    queryKey: ["instrument-page", q, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/v1/instruments?${params}`);
      if (!res.ok) throw new Error(`instrument page failed: ${res.status}`);
      return (await res.json()) as PaginatedResponse<Instrument>;
    },
  });
}

export function useWatchlistQuery() {
  const userId = useWatchlistUserId();

  return useQuery({
    queryKey: ["watchlist", userId],
    queryFn: async () => {
      const res = await fetch("/api/v1/watchlist");
      if (!res.ok) throw new Error(`watchlist failed: ${res.status}`);
      const json = await res.json();
      return (json.success ? json.data : []) as string[];
    },
    enabled: !!userId,
  });
}

export function useAddWatchlist() {
  const queryClient = useQueryClient();
  const userId = useWatchlistUserId();

  return useMutation({
    mutationFn: async (symbol: string) => {
      if (!userId) throw new Error("Unauthorized");
      const res = await fetch("/api/v1/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error(`add watchlist failed: ${res.status}`);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: ["watchlist", userId] });
      queryClient.invalidateQueries({ queryKey: ["watchlistInstruments", userId] });
    },
  });
}

export function useRemoveWatchlist() {
  const queryClient = useQueryClient();
  const userId = useWatchlistUserId();

  return useMutation({
    mutationFn: async (symbol: string) => {
      if (!userId) throw new Error("Unauthorized");
      const res = await fetch(`/api/v1/watchlist/${symbol}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`remove watchlist failed: ${res.status}`);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: ["watchlist", userId] });
      queryClient.invalidateQueries({ queryKey: ["watchlistInstruments", userId] });
    },
  });
}

export function useWatchlistInstrumentsQuery() {
  const userId = useWatchlistUserId();

  return useQuery({
    queryKey: ["watchlistInstruments", userId],
    queryFn: async () => {
      const res = await fetch("/api/v1/watchlist/instruments");
      if (!res.ok) throw new Error(`watchlist instruments failed: ${res.status}`);
      const json = await res.json();
      return (json.success ? json.data : []) as Instrument[];
    },
    enabled: !!userId,
  });
}

export function useWatchlistInstrumentPageQuery(
  q: string,
  page: number,
  limit = STOCK_LIST_PAGE_SIZE,
) {
  const userId = useWatchlistUserId();
  return useQuery({
    queryKey: watchlistPageQueryKey(userId ?? "anonymous", q, page, limit),
    queryFn: async () => {
      if (!userId) throw new Error("Unauthorized");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/v1/watchlist/instruments?${params}`);
      if (!res.ok) throw new Error(`watchlist page failed: ${res.status}`);
      return (await res.json()) as PaginatedResponse<Instrument>;
    },
    enabled: !!userId,
  });
}

/** 支持的 K 线周期：1m / 1d / 5d / 1w / 1mo */
export type KlineTf = "1m" | "1d" | "5d" | "1w" | "1mo";

