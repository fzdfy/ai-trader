import { useQuery } from "@tanstack/react-query";
import type {
  ObjectSubtype,
  SignalResult,
  SignalStatus,
} from "@ai-trader/signal-catalog/contracts";
import type { SignalScope } from "@ai-trader/signal-catalog";

export interface StoredTechnicalSignalSnapshot {
  objectType: SignalScope;
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
  asOf: string;
  catalogVersion: string;
  computedAt: string;
  definitionHash: string;
  inputHash: string;
  quality: "available" | "low" | "missing";
  dataSources: string[];
  signals: SignalResult[];
  summary: Record<string, unknown>;
}

export interface StockSignalSummary {
  symbol: string;
  asOf: string;
  catalogVersion: string;
  quality: "available" | "low" | "missing";
  counts: Record<SignalStatus, number>;
  keySignals: string[];
  error?: string;
}

async function fetchData<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || !payload.success || payload.data == null) {
    throw new Error(payload.error ?? "技术信号读取失败");
  }
  return payload.data;
}

export function useTechnicalSignalSnapshot(
  scope: SignalScope,
  code: string,
  subtype?: ObjectSubtype | null,
  asOf?: string | null,
) {
  const query = new URLSearchParams();
  if (subtype) query.set("subtype", subtype);
  if (asOf) query.set("asOf", asOf);
  return useQuery({
    queryKey: ["technical-signals", scope, subtype ?? "", code, asOf ?? ""],
    queryFn: ({ signal }) =>
      fetchData<StoredTechnicalSignalSnapshot>(
        `/api/v1/technical-signals/${scope}/${encodeURIComponent(code)}${query.size ? `?${query}` : ""}`,
        signal,
      ),
    staleTime: 60_000,
    enabled: Boolean(code),
  });
}

export function useStockTechnicalSummaries(symbols: readonly string[]) {
  const normalized = [...new Set(symbols.filter(Boolean))].slice(0, 10);
  return useQuery({
    queryKey: ["technical-signals", "stocks", normalized],
    queryFn: ({ signal }) =>
      fetchData<StockSignalSummary[]>(
        `/api/v1/technical-signals/stocks?symbols=${encodeURIComponent(normalized.join(","))}`,
        signal,
      ),
    staleTime: 60_000,
    enabled: normalized.length > 0,
  });
}

export function useSectorTechnicalSummaries(codes: readonly string[], subtype: ObjectSubtype) {
  const normalized = [...new Set(codes.filter(Boolean))].slice(0, 50);
  return useQuery({
    queryKey: ["technical-signals", "boards", subtype, normalized],
    queryFn: ({ signal }) =>
      fetchData<StockSignalSummary[]>(
        `/api/v1/technical-signals/boards?subtype=${subtype}&codes=${encodeURIComponent(normalized.join(","))}`,
        signal,
      ),
    staleTime: 60_000,
    enabled: normalized.length > 0,
  });
}
