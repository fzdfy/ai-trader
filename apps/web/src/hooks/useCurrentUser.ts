import { useQuery } from "@tanstack/react-query";
import type { AppRole } from "../lib/data-management-access";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

export function useCurrentUser() {
  return useQuery({
    queryKey: ["system", "me"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/v1/system/me", { signal });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        success?: boolean;
        data?: CurrentUser;
      };
      return payload.success ? (payload.data ?? null) : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
