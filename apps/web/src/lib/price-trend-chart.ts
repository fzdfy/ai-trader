export type PriceTrendViewport = "desktop" | "mobile";

export interface PriceTrendPoint {
  time: string;
  close: number;
}

export interface PriceTrendReference {
  ma20: number | null;
  ma60: number | null;
  support20: number | null;
  resistance60: number | null;
}

export interface BuildPriceTrendGeometryInput {
  points: readonly PriceTrendPoint[];
  reference: PriceTrendReference | null;
  viewport: PriceTrendViewport;
}

export interface PriceTrendGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: (index: number) => number;
  y: (value: number) => number;
  yDomain: { min: number; max: number };
  closePath: string;
  areaPath: string;
  ma20Path: string | null;
  ma60Path: string | null;
  gridValues: number[];
  tickIndexes: number[];
  supportY: number | null;
  resistanceY: number | null;
}

export interface PriceTrendSelection {
  hoverIndex: number | null;
  pinnedIndex: number | null;
  keyboardIndex: number;
}

export type PriceTrendSelectionAction =
  | { type: "pointer-move"; index: number }
  | { type: "pointer-leave" }
  | { type: "pin"; index: number }
  | { type: "focus" }
  | { type: "key"; key: "ArrowLeft" | "ArrowRight" | "Home" | "End" | "Escape" };

const VIEWPORTS = {
  desktop: { width: 760, height: 280, left: 50, right: 18, top: 20, bottom: 42 },
  mobile: { width: 420, height: 320, left: 40, right: 18, top: 20, bottom: 42 },
} as const satisfies Record<
  PriceTrendViewport,
  {
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
>;

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function clampIndex(index: number, pointCount: number): number {
  if (pointCount <= 0) return 0;
  return Math.max(0, Math.min(pointCount - 1, Math.round(index)));
}

function pathFromValues(
  values: readonly (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string | null {
  let path = "";
  let started = false;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!isFiniteNumber(value)) {
      started = false;
      continue;
    }
    path += `${started ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    started = true;
  }
  return path || null;
}

export function movingAverage(values: readonly number[], period: number): Array<number | null> {
  if (!Number.isInteger(period) || period <= 0) return values.map(() => null);

  let trailingSum = 0;
  return values.map((value, index) => {
    trailingSum += value;
    if (index >= period) trailingSum -= values[index - period]!;
    return index >= period - 1 ? trailingSum / period : null;
  });
}

export function axisTickIndexes(pointCount: number, tickCount = 5): number[] {
  if (pointCount <= 0) return [];
  const safeTickCount = Math.max(1, Math.floor(tickCount));
  if (pointCount === 1 || safeTickCount === 1) return [0];

  const lastIndex = pointCount - 1;
  return [
    ...new Set(
      Array.from({ length: safeTickCount }, (_, position) =>
        Math.round((lastIndex * position) / (safeTickCount - 1)),
      ),
    ),
  ].sort((left, right) => left - right);
}

export function buildPriceTrendGeometry({
  points,
  reference,
  viewport,
}: BuildPriceTrendGeometryInput): PriceTrendGeometry | null {
  if (points.length < 2) return null;

  const frame = VIEWPORTS[viewport];
  const closes = points.map((point) => point.close);
  const ma20Values = reference ? movingAverage(closes, 20) : [];
  const ma60Values = reference ? movingAverage(closes, 60) : [];
  const scaleValues = [
    ...closes,
    ...(reference
      ? [
          ...ma20Values.filter(isFiniteNumber),
          ...ma60Values.filter(isFiniteNumber),
          reference.ma20,
          reference.ma60,
          reference.support20,
          reference.resistance60,
        ].filter(isFiniteNumber)
      : []),
  ];
  const rawMin = Math.min(...scaleValues);
  const rawMax = Math.max(...scaleValues);
  const rawSpan = rawMax - rawMin;
  const padding = rawSpan > 0 ? rawSpan * 0.04 : 0.5;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = max - min;
  const plotWidth = frame.width - frame.left - frame.right;
  const plotHeight = frame.height - frame.top - frame.bottom;
  const x = (index: number) => frame.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => frame.top + ((max - value) / span) * plotHeight;
  const closePath = pathFromValues(closes, x, y) ?? "";
  const areaPath = `${closePath} L${x(points.length - 1).toFixed(1)},${frame.height - frame.bottom} L${frame.left},${frame.height - frame.bottom} Z`;
  const gridValues = Array.from({ length: 5 }, (_, index) => min + (span * (4 - index)) / 4);

  return {
    ...frame,
    x,
    y,
    yDomain: { min, max },
    closePath,
    areaPath,
    ma20Path: reference ? pathFromValues(ma20Values, x, y) : null,
    ma60Path: reference ? pathFromValues(ma60Values, x, y) : null,
    gridValues,
    tickIndexes: axisTickIndexes(points.length),
    supportY: isFiniteNumber(reference?.support20) ? y(reference.support20) : null,
    resistanceY: isFiniteNumber(reference?.resistance60) ? y(reference.resistance60) : null,
  };
}

export function indexFromPointerX(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  viewport: PriceTrendViewport,
  pointCount: number,
): number {
  if (pointCount <= 1 || rectWidth <= 0) return 0;

  const frame = VIEWPORTS[viewport];
  const localX = ((clientX - rectLeft) / rectWidth) * frame.width;
  const plotWidth = frame.width - frame.left - frame.right;
  const ratio = (localX - frame.left) / plotWidth;
  return clampIndex(ratio * (pointCount - 1), pointCount);
}

export function clampTooltipX(
  targetX: number,
  tooltipWidth: number,
  left: number,
  right: number,
): number {
  return Math.max(left, Math.min(right - tooltipWidth, targetX));
}

export function formatTrendAxisDate(time: string): string {
  return time.slice(5, 10);
}

export function formatTrendFullDate(time: string): string {
  return time.slice(0, 10);
}

export function initialPriceTrendSelection(pointCount: number): PriceTrendSelection {
  return {
    hoverIndex: null,
    pinnedIndex: null,
    keyboardIndex: clampIndex(pointCount - 1, pointCount),
  };
}

export function visiblePriceTrendIndex(state: PriceTrendSelection): number | null {
  return state.hoverIndex ?? state.pinnedIndex;
}

export function reducePriceTrendSelection(
  state: PriceTrendSelection,
  action: PriceTrendSelectionAction,
  pointCount: number,
): PriceTrendSelection {
  if (pointCount <= 0) {
    return { hoverIndex: null, pinnedIndex: null, keyboardIndex: 0 };
  }

  if (action.type === "pointer-move") {
    return { ...state, hoverIndex: clampIndex(action.index, pointCount) };
  }

  if (action.type === "pointer-leave") {
    return { ...state, hoverIndex: null };
  }

  if (action.type === "pin") {
    const index = clampIndex(action.index, pointCount);
    return { hoverIndex: null, pinnedIndex: index, keyboardIndex: index };
  }

  if (action.type === "focus") {
    return {
      ...state,
      hoverIndex: null,
      pinnedIndex: state.pinnedIndex ?? clampIndex(state.keyboardIndex, pointCount),
    };
  }

  if (action.key === "Escape") {
    return { ...state, hoverIndex: null, pinnedIndex: null };
  }

  const current = visiblePriceTrendIndex(state) ?? clampIndex(state.keyboardIndex, pointCount);
  const next =
    action.key === "Home"
      ? 0
      : action.key === "End"
        ? pointCount - 1
        : clampIndex(current + (action.key === "ArrowLeft" ? -1 : 1), pointCount);

  return { hoverIndex: null, pinnedIndex: next, keyboardIndex: next };
}
