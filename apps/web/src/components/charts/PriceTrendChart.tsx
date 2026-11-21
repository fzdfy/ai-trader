import {
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EmptyState } from "@preline-ui/EmptyState";
import {
  buildPriceTrendGeometry,
  clampTooltipX,
  formatTrendAxisDate,
  formatTrendFullDate,
  indexFromPointerX,
  initialPriceTrendSelection,
  movingAverage,
  reducePriceTrendSelection,
  visiblePriceTrendIndex,
  type PriceTrendPoint,
  type PriceTrendReference,
  type PriceTrendSelectionAction,
  type PriceTrendViewport,
} from "../../lib/price-trend-chart";

const DESKTOP_MEDIA_QUERY = "(min-width: 641px)";

function subscribeToViewport(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(DESKTOP_MEDIA_QUERY);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getViewportSnapshot(): boolean {
  return globalThis.matchMedia?.(DESKTOP_MEDIA_QUERY).matches ?? true;
}

function getServerViewportSnapshot(): boolean {
  return true;
}

function usePriceTrendViewport(): PriceTrendViewport {
  return useSyncExternalStore(subscribeToViewport, getViewportSnapshot, getServerViewportSnapshot)
    ? "desktop"
    : "mobile";
}

function formatPrice(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function SelectedDayReadout({
  point,
  ma20,
  ma60,
}: {
  point: PriceTrendPoint | null;
  ma20: number | null;
  ma60: number | null;
}) {
  if (!point) return "使用左右方向键查看每日收盘价、MA20 和 MA60。";
  return `${formatTrendFullDate(point.time)}，收盘 ${formatPrice(point.close)}，MA20 ${formatPrice(ma20)}，MA60 ${formatPrice(ma60)}`;
}

export interface PriceTrendChartProps {
  points: readonly PriceTrendPoint[];
  reference: PriceTrendReference | null;
  subjectName?: string;
}

export function PriceTrendChart({ points, reference, subjectName = "个股" }: PriceTrendChartProps) {
  const viewport = usePriceTrendViewport();
  const gradientId = `price-trend-fill-${useId().replaceAll(":", "")}`;
  const clipId = `price-trend-clip-${useId().replaceAll(":", "")}`;
  const readoutId = `price-trend-readout-${useId().replaceAll(":", "")}`;
  const tableId = `price-trend-table-${useId().replaceAll(":", "")}`;
  const [selection, setSelection] = useState(() => initialPriceTrendSelection(points.length));
  const ma20 = reference?.ma20 ?? null;
  const ma60 = reference?.ma60 ?? null;
  const support20 = reference?.support20 ?? null;
  const resistance60 = reference?.resistance60 ?? null;
  const hasReference = [ma20, ma60, support20, resistance60].some(
    (value) => value != null && Number.isFinite(value),
  );
  const geometry = useMemo(
    () =>
      buildPriceTrendGeometry({
        points,
        reference: hasReference ? { ma20, ma60, support20, resistance60 } : null,
        viewport,
      }),
    [hasReference, ma20, ma60, points, resistance60, support20, viewport],
  );
  const movingAverages = useMemo(
    () => ({
      ma20: movingAverage(
        points.map((point) => point.close),
        20,
      ),
      ma60: movingAverage(
        points.map((point) => point.close),
        60,
      ),
    }),
    [points],
  );

  if (!geometry) {
    return (
      <EmptyState title="历史行情不足" description="至少需要两个交易日的收盘价才能绘制趋势。" />
    );
  }

  const visibleIndex = visiblePriceTrendIndex(selection);
  const selectedPoint = visibleIndex == null ? null : (points[visibleIndex] ?? null);
  const selectedMa20 = visibleIndex == null ? null : (movingAverages.ma20[visibleIndex] ?? null);
  const selectedMa60 = visibleIndex == null ? null : (movingAverages.ma60[visibleIndex] ?? null);
  const selectedX = visibleIndex == null ? null : geometry.x(visibleIndex);
  const selectedY = selectedPoint == null ? null : geometry.y(selectedPoint.close);
  const tooltipWidth = viewport === "desktop" ? 172 : 184;
  const tooltipHeight = 72;
  const tooltipX =
    selectedX == null
      ? geometry.left
      : clampTooltipX(selectedX + 10, tooltipWidth, geometry.left, geometry.width - geometry.right);
  const tooltipY = geometry.top + 6;
  const readout = SelectedDayReadout({
    point: selectedPoint,
    ma20: selectedMa20,
    ma60: selectedMa60,
  });
  const dispatchSelection = (action: PriceTrendSelectionAction) => {
    setSelection((current) => reducePriceTrendSelection(current, action, points.length));
  };

  const selectFromPointer = (event: ReactPointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return indexFromPointerX(event.clientX, rect.left, rect.width, viewport, points.length);
  };

  return (
    <div
      data-price-trend-chart
      className="rounded-lg focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary"
    >
      <svg
        className="block h-auto w-full cursor-crosshair touch-pan-y rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        tabIndex={0}
        aria-label={
          selectedPoint
            ? `${subjectName}最近 ${points.length} 个交易日前复权收盘价趋势。当前 ${readout}`
            : `${subjectName}最近 ${points.length} 个交易日前复权收盘价趋势，可使用左右方向键逐日查看`
        }
        aria-describedby={readoutId}
        aria-details={tableId}
        onPointerMove={(event) =>
          dispatchSelection({
            type: "pointer-move",
            index: selectFromPointer(event),
          })
        }
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          dispatchSelection({
            type: "pin",
            index: selectFromPointer(event),
          });
        }}
        onPointerLeave={() => dispatchSelection({ type: "pointer-leave" })}
        onFocus={() => dispatchSelection({ type: "focus" })}
        onBlur={() => dispatchSelection({ type: "pointer-leave" })}
        onKeyDown={(event) => {
          if (
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight" &&
            event.key !== "Home" &&
            event.key !== "End" &&
            event.key !== "Escape"
          ) {
            return;
          }
          event.preventDefault();
          dispatchSelection({ type: "key", key: event.key });
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-current)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--chart-current)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect
              x={geometry.left}
              y={geometry.top}
              width={geometry.width - geometry.left - geometry.right}
              height={geometry.height - geometry.top - geometry.bottom}
            />
          </clipPath>
        </defs>

        {geometry.gridValues.map((value) => (
          <g key={value}>
            <line
              x1={geometry.left}
              x2={geometry.width - geometry.right}
              y1={geometry.y(value)}
              y2={geometry.y(value)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text
              className="font-mono"
              x={geometry.left - 8}
              y={geometry.y(value) + 3}
              textAnchor="end"
              fill="var(--chart-axis-text)"
              fontSize={viewport === "desktop" ? 12 : 14}
            >
              {value.toFixed(0)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {geometry.resistanceY != null ? (
            <line
              data-series="resistance"
              x1={geometry.left}
              x2={geometry.width - geometry.right}
              y1={geometry.resistanceY}
              y2={geometry.resistanceY}
              stroke="var(--chart-up)"
              strokeWidth="1.2"
              strokeDasharray="5 4"
              opacity=".72"
            />
          ) : null}
          {geometry.supportY != null ? (
            <line
              data-series="support"
              x1={geometry.left}
              x2={geometry.width - geometry.right}
              y1={geometry.supportY}
              y2={geometry.supportY}
              stroke="var(--chart-down)"
              strokeWidth="1.2"
              strokeDasharray="5 4"
              opacity=".72"
            />
          ) : null}
          <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
          {geometry.ma20Path ? (
            <path
              data-series="ma20"
              d={geometry.ma20Path}
              fill="none"
              stroke="var(--chart-ma-20)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity=".9"
            />
          ) : null}
          {geometry.ma60Path ? (
            <path
              data-series="ma60"
              d={geometry.ma60Path}
              fill="none"
              stroke="var(--chart-ma-60)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity=".9"
            />
          ) : null}
          <path
            data-series="close"
            d={geometry.closePath}
            fill="none"
            stroke="var(--chart-current)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {selectedX != null && selectedY != null ? (
            <>
              <line
                x1={selectedX}
                x2={selectedX}
                y1={geometry.top}
                y2={geometry.height - geometry.bottom}
                stroke="var(--chart-axis-text)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={selectedX}
                cy={selectedY}
                r="4"
                fill="var(--chart-current)"
                stroke="var(--panel)"
                strokeWidth="2"
              />
            </>
          ) : null}
        </g>

        {geometry.tickIndexes.map((index, position) => {
          const x = geometry.x(index);
          return (
            <g key={points[index]?.time ?? index}>
              <line
                x1={x}
                x2={x}
                y1={geometry.height - geometry.bottom}
                y2={geometry.height - geometry.bottom + 4}
                stroke="var(--line-strong)"
              />
              <text
                className="font-mono"
                x={x}
                y={geometry.height - 12}
                textAnchor={
                  position === 0
                    ? "start"
                    : position === geometry.tickIndexes.length - 1
                      ? "end"
                      : "middle"
                }
                fill="var(--chart-axis-text)"
                fontSize={viewport === "desktop" ? 12 : 14}
              >
                {formatTrendAxisDate(points[index]!.time)}
              </text>
            </g>
          );
        })}

        {geometry.supportY != null && support20 != null ? (
          <text
            className="font-mono"
            x={geometry.width - geometry.right - 2}
            y={geometry.supportY - 4}
            textAnchor="end"
            fill="var(--chart-down)"
            fontSize={viewport === "desktop" ? 11 : 12}
          >
            {formatPrice(support20)}
          </text>
        ) : null}
        {geometry.resistanceY != null && resistance60 != null ? (
          <text
            className="font-mono"
            x={geometry.width - geometry.right - 2}
            y={geometry.resistanceY - 4}
            textAnchor="end"
            fill="var(--chart-up)"
            fontSize={viewport === "desktop" ? 11 : 12}
          >
            {formatPrice(resistance60)}
          </text>
        ) : null}

        <circle
          cx={geometry.x(points.length - 1)}
          cy={geometry.y(points.at(-1)!.close)}
          r="4"
          fill="var(--chart-current)"
          stroke="var(--panel)"
          strokeWidth="3"
        />

        {selectedPoint && selectedX != null ? (
          <g aria-hidden="true">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="6"
              fill="var(--panel)"
              stroke="var(--line-strong)"
            />
            <text
              className="font-mono"
              x={tooltipX + 10}
              y={tooltipY + 16}
              fill="var(--ink)"
              fontSize={viewport === "desktop" ? 11 : 13}
            >
              {formatTrendFullDate(selectedPoint.time)}
            </text>
            <text
              className="font-mono font-semibold"
              x={tooltipX + 10}
              y={tooltipY + 33}
              fill="var(--chart-current)"
              fontSize={viewport === "desktop" ? 12 : 14}
            >
              收盘 {formatPrice(selectedPoint.close)}
            </text>
            <text
              className="font-mono"
              x={tooltipX + 10}
              y={tooltipY + 50}
              fill="var(--chart-ma-20)"
              fontSize={viewport === "desktop" ? 11 : 13}
            >
              MA20 {formatPrice(selectedMa20)}
            </text>
            <text
              className="font-mono"
              x={tooltipX + 10}
              y={tooltipY + 67}
              fill="var(--chart-ma-60)"
              fontSize={viewport === "desktop" ? 11 : 13}
            >
              MA60 {formatPrice(selectedMa60)}
            </text>
          </g>
        ) : null}
      </svg>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[11px] text-app-muted"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-4 rounded-full bg-[var(--chart-current)]" />
          收盘价
        </span>
        {hasReference ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 rounded-full bg-[var(--chart-ma-20)]" />
              MA20
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 rounded-full bg-[var(--chart-ma-60)]" />
              MA60
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 border-t border-dashed border-chart-down" />
              20日支撑
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 border-t border-dashed border-chart-up" />
              60日压力
            </span>
          </>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-1 pr-20 text-[11px] leading-relaxed text-app-muted sm:flex-row sm:justify-between sm:pr-0">
        <span>悬停、点击或用左右方向键查看每日数据</span>
        <span>{points.at(-1) ? `${formatTrendFullDate(points.at(-1)!.time)} 收盘` : "暂无"}</span>
      </div>

      <p id={readoutId} className="sr-only" aria-live="polite">
        {readout}
      </p>
      <div id={tableId} className="sr-only">
        <table>
          <caption>前复权收盘价趋势数据摘要</caption>
          <thead>
            <tr>
              <th>日期</th>
              <th>收盘价</th>
              <th>MA20</th>
              <th>MA60</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={point.time}>
                <td>{formatTrendFullDate(point.time)}</td>
                <td>{formatPrice(point.close)}</td>
                <td>{formatPrice(movingAverages.ma20[index])}</td>
                <td>{formatPrice(movingAverages.ma60[index])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
