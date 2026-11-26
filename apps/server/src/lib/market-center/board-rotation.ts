import type { RotationSeries } from "../market-rotation/compute";

interface BoardIdentity {
  code: string;
  type: string;
  name: string;
}

interface BoardKlinePoint {
  code: string;
  date: string;
  close: string | null;
}

export function buildBoardRotationSeries(
  type: "industry" | "concept",
  boards: BoardIdentity[],
  bars: BoardKlinePoint[],
): RotationSeries[] {
  const identities = new Map(
    boards
      .filter((board) => board.type === type)
      .map((board) => [board.code, board.name]),
  );
  const grouped = new Map<string, RotationSeries["points"]>();

  for (const bar of bars) {
    if (!identities.has(bar.code)) continue;
    const close = Number(bar.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    const points = grouped.get(bar.code) ?? [];
    points.push({ date: bar.date, value: close });
    grouped.set(bar.code, points);
  }

  return [...identities.entries()].map(([code, name]) => ({
    code,
    name,
    points: (grouped.get(code) ?? []).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  }));
}
