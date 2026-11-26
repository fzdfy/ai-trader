import type { BoardItem } from "../../../../hooks/useBoards";
import {
  heatmapColorLevel,
  heatmapGridSpan,
  MARKET_CAP_HEATMAP_LIMIT,
  selectMarketCapHeatmapRows,
  type HeatmapColorLevel,
} from "../../../../lib/market-center";

function formatValue(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}万亿`;
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(0)}万`;
  return String(Math.round(value));
}

function levelStyle(level: HeatmapColorLevel): {
  background: string;
  color: string;
} {
  if (level === 0) {
    return {
      background: "color-mix(in srgb, var(--surface-strong) 60%, var(--panel))",
      color: "var(--ink)",
    };
  }
  if (level !== "missing") {
    const magnitude = Math.abs(level);
    const intensity = magnitude * 25;
    const foreground =
      magnitude === 4
        ? "var(--color-text-on-color)"
        : magnitude >= 2
          ? "var(--ink)"
          : level > 0
            ? "var(--chart-up-text)"
            : "var(--chart-down-text)";
    return level > 0
      ? {
          background:
            intensity === 100
              ? "var(--chart-up)"
              : `color-mix(in srgb, var(--chart-up) ${intensity}%, var(--panel))`,
          color: foreground,
        }
      : {
          background:
            intensity === 100
              ? "var(--chart-down)"
              : `color-mix(in srgb, var(--chart-down) ${intensity}%, var(--panel))`,
          color: foreground,
        };
  }
  return {
    background: "color-mix(in srgb, var(--primary) 14%, var(--panel))",
    color: "var(--primary)",
  };
}

function tileStyle(changePercent: number | null) {
  return levelStyle(heatmapColorLevel(changePercent));
}

export function BoardHeatmap({
  items,
  onOpen,
}: {
  items: BoardItem[];
  onOpen: (code: string) => void;
}) {
  const rows = selectMarketCapHeatmapRows(
    items.map((item) => ({
      code: item.code,
      name: item.name,
      marketCap: Number(item.totalMarketCap),
      changePercent:
        item.changePercent == null ? null : Number(item.changePercent),
    })),
    MARKET_CAP_HEATMAP_LIMIT,
  );
  const legendRanges = [
    { level: -4, label: "≤-3%" },
    { level: -3, label: "-3–-2%" },
    { level: -2, label: "-2–-1%" },
    { level: -1, label: "-1–0%" },
    { level: 0, label: "0%" },
    { level: 1, label: "0–1%" },
    { level: 2, label: "1–2%" },
    { level: 3, label: "2–3%" },
    { level: 4, label: "≥3%" },
  ] as const;

  return (
    <div className="flex min-h-[460px] flex-1 flex-col">
      <div
        className="grid grid-cols-5 items-center gap-x-1 gap-y-1.5 border-b border-app-line px-2.5 py-2 text-[9px]"
        aria-label="热力图涨跌幅颜色标尺"
      >
        {legendRanges.map(({ level, label }) => {
          const style = levelStyle(level);
          return (
            <span
              key={level}
              className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap text-app-ink-secondary"
            >
              <span
                className="size-2 shrink-0 rounded-full ring-1 ring-app-line"
                style={{ backgroundColor: style.background }}
                aria-hidden="true"
              />
              <span className="font-mono font-semibold">{label}</span>
            </span>
          );
        })}
      </div>
      <div className="grid min-h-[390px] flex-1 auto-rows-[92px] grid-flow-dense grid-cols-3 gap-2.5 p-2.5 xl:auto-rows-fr xl:grid-cols-4 xl:grid-rows-7">
        {rows.map((item, index) => {
          const style = tileStyle(item.changePercent);
          const span = heatmapGridSpan(index);
          const showCap = span.columns * span.rows >= 2;
          return (
            <button
              key={item.code}
              type="button"
              className="focus-ring flex min-h-0 min-w-0 flex-col justify-end gap-1 overflow-hidden rounded-lg px-3 py-2.5 text-left transition hover:brightness-[0.97]"
              style={{
                ...style,
                gridColumn: `span ${span.columns} / span ${span.columns}`,
                gridRow: `span ${span.rows} / span ${span.rows}`,
              }}
              aria-label={`查看 ${item.name} 板块详情`}
              title={`${item.name} ${item.changePercent == null ? "—" : `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`} · 市值 ${formatValue(item.marketCap)}`}
              onClick={() => onOpen(item.code)}
            >
              <strong className="truncate text-[10px] leading-4">{item.name}</strong>
              <span className="font-mono text-[10px] font-semibold leading-3.5 opacity-90">
                {item.changePercent == null
                  ? "—"
                  : `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`}
              </span>
              {showCap ? (
                <span className="truncate font-mono text-[8px] leading-2.5 opacity-75">
                  {formatValue(item.marketCap)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
