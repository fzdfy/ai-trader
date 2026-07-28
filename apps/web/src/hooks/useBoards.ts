import { useQuery } from "@tanstack/react-query";

export type BoardItem = Record<string, unknown> & {
  code: string;
  type: string;
  name: string;
  rank: string;
  changePercent: string | null;
  popularity: string | null;
  updatedAt: string;
};

export function useBoardsQuery(type: "industry" | "concept") {
  return useQuery({
    queryKey: ["boards", type],
    queryFn: async () => {
      const res = await fetch(`/api/v1/boards?type=${type}`);
      const json = await res.json();
      return (json.success ? json.data : []) as BoardItem[];
    },
  });
}
