import { useQuery } from "@tanstack/react-query";
import type { SystemFeatures } from "../lib/market-brief";

type ApiPayload<T> = { success: boolean; data?: T; error?: string };

export function useSystemFeaturesQuery() {
  return useQuery({
    queryKey: ["system", "features"],
    queryFn: async ({ signal }): Promise<SystemFeatures> => {
      const response = await fetch("/api/v1/system/features", { signal });
      const payload = (await response.json()) as ApiPayload<SystemFeatures>;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "系统功能状态读取失败");
      }
      return payload.data;
    },
    staleTime: 60_000,
  });
}
