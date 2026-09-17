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

export type BoardType = "industry" | "concept";

/** 拉取板块列表（hook 与 Route loader 共用） */
export async function fetchBoards(type: BoardType): Promise<BoardItem[]> {
  const res = await fetch(`/api/v1/boards?type=${type}`);
  const json = await res.json();
  return (json.success ? json.data : []) as BoardItem[];
}

export function useBoardsQuery(type: BoardType) {
  return useQuery({
    queryKey: ["boards", type],
    queryFn: () => fetchBoards(type),
  });
}
