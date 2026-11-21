import assert from "node:assert/strict";
import test from "node:test";
import {
  axisTickIndexes,
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
} from "./price-trend-chart.ts";

function createPoints(count: number, start = 80): PriceTrendPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    time: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    close: start + index / 10,
  }));
}

test("moving averages align trailing windows and preserve unavailable heads", () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(movingAverage([1, 2, 3], 4), [null, null, null]);
  assert.deepEqual(movingAverage([1, 2], 0), [null, null]);
});

test("120 trading days produce five plotting-aligned tick indexes", () => {
  assert.deepEqual(axisTickIndexes(120), [0, 30, 60, 89, 119]);
  assert.deepEqual(axisTickIndexes(2), [0, 1]);
  assert.deepEqual(axisTickIndexes(1), [0]);
  assert.deepEqual(axisTickIndexes(0), []);
});

test("technical references extend the visible scale and can be omitted", () => {
  const points = createPoints(60);
  const withReference = buildPriceTrendGeometry({
    points,
    reference: { ma20: 86, ma60: 84, support20: 78.09, resistance60: 93.23 },
    viewport: "desktop",
  });
  const withoutReference = buildPriceTrendGeometry({
    points,
    reference: null,
    viewport: "desktop",
  });

  assert.ok(withReference);
  assert.ok(withoutReference);
  assert.ok(withReference.yDomain.min <= 78.09);
  assert.ok(withReference.yDomain.max >= 93.23);
  assert.equal(withoutReference.supportY, null);
  assert.equal(withoutReference.resistanceY, null);
  assert.equal(withoutReference.ma20Path, null);
  assert.equal(withoutReference.ma60Path, null);
});

test("moving-average paths stop using unavailable leading windows", () => {
  const sixtyPoints = createPoints(60);
  const fiftyNinePoints = createPoints(59);
  const sixtyDayGeometry = buildPriceTrendGeometry({
    points: sixtyPoints,
    reference: { ma20: 86, ma60: 84, support20: 78.09, resistance60: 93.23 },
    viewport: "desktop",
  });
  const fiftyNineDayGeometry = buildPriceTrendGeometry({
    points: fiftyNinePoints,
    reference: { ma20: 86, ma60: 84, support20: 78.09, resistance60: 93.23 },
    viewport: "desktop",
  });

  assert.ok(sixtyDayGeometry?.ma20Path);
  assert.ok(sixtyDayGeometry?.ma60Path);
  assert.ok(fiftyNineDayGeometry?.ma20Path);
  assert.equal(fiftyNineDayGeometry?.ma60Path, null);
});

test("fewer than two prices do not create misleading geometry", () => {
  assert.equal(
    buildPriceTrendGeometry({
      points: createPoints(1),
      reference: null,
      viewport: "desktop",
    }),
    null,
  );
});

test("x coordinates use trading-day spacing and reach both plot edges", () => {
  const points = [
    { time: "2026-09-25", close: 10 },
    { time: "2026-09-28", close: 11 },
    { time: "2026-10-09", close: 12 },
  ];
  const geometry = buildPriceTrendGeometry({ points, reference: null, viewport: "desktop" });

  assert.ok(geometry);
  assert.equal(geometry.x(0), 50);
  assert.equal(geometry.x(2), 742);
  assert.equal(geometry.x(1) - geometry.x(0), geometry.x(2) - geometry.x(1));
});

test("mobile geometry uses the approved viewBox and plot bounds", () => {
  const geometry = buildPriceTrendGeometry({
    points: createPoints(20),
    reference: null,
    viewport: "mobile",
  });

  assert.ok(geometry);
  assert.deepEqual(
    [geometry.width, geometry.height, geometry.left, geometry.right, geometry.top, geometry.bottom],
    [420, 320, 40, 18, 20, 42],
  );
});

test("tooltips stay inside the plot at both horizontal edges", () => {
  assert.equal(clampTooltipX(50, 172, 50, 742), 50);
  assert.equal(clampTooltipX(741, 172, 50, 742), 570);
});

test("dates format directly from API strings without timezone shifts", () => {
  assert.equal(formatTrendAxisDate("2026-11-21T00:00:00.000Z"), "11-21");
  assert.equal(formatTrendFullDate("2026-11-21T00:00:00.000Z"), "2026-11-21");
});

test("pointer x maps linearly to trading-day indexes and clamps overflow", () => {
  assert.equal(indexFromPointerX(50, 0, 760, "desktop", 120), 0);
  assert.equal(indexFromPointerX(742, 0, 760, "desktop", 120), 119);
  assert.equal(indexFromPointerX(-10, 0, 760, "desktop", 120), 0);
  assert.equal(indexFromPointerX(900, 0, 760, "desktop", 120), 119);
  assert.equal(indexFromPointerX(40, 0, 420, "mobile", 20), 0);
  assert.equal(indexFromPointerX(402, 0, 420, "mobile", 20), 19);
});

test("pointer clicks pin a day and hover never clears the pinned selection", () => {
  let state = initialPriceTrendSelection(10);

  assert.equal(state.keyboardIndex, 9);
  assert.equal(visiblePriceTrendIndex(state), null);

  state = reducePriceTrendSelection(state, { type: "pointer-move", index: 4 }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);

  state = reducePriceTrendSelection(state, { type: "pin", index: 4 }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);

  state = reducePriceTrendSelection(state, { type: "pointer-move", index: 6 }, 10);
  assert.equal(visiblePriceTrendIndex(state), 6);

  state = reducePriceTrendSelection(state, { type: "pointer-leave" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);
});

test("focus reveals the latest day and keeps it pinned when the pointer leaves", () => {
  let state = reducePriceTrendSelection(initialPriceTrendSelection(10), { type: "focus" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 9);

  state = reducePriceTrendSelection(state, { type: "pointer-move", index: 4 }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);

  state = reducePriceTrendSelection(state, { type: "pointer-leave" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 9);
});

test("keyboard navigation follows trading-day order and Escape clears selection", () => {
  let state = initialPriceTrendSelection(10);

  state = reducePriceTrendSelection(state, { type: "key", key: "ArrowLeft" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 8);

  state = reducePriceTrendSelection(state, { type: "key", key: "Home" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 0);

  state = reducePriceTrendSelection(state, { type: "key", key: "ArrowRight" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 1);

  state = reducePriceTrendSelection(state, { type: "key", key: "End" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 9);

  state = reducePriceTrendSelection(state, { type: "key", key: "Escape" }, 10);
  assert.equal(visiblePriceTrendIndex(state), null);
});

test("selection indexes are clamped to available trading days", () => {
  let state = initialPriceTrendSelection(5);
  state = reducePriceTrendSelection(state, { type: "pin", index: 50 }, 5);
  assert.equal(visiblePriceTrendIndex(state), 4);

  state = reducePriceTrendSelection(state, { type: "pointer-move", index: -3 }, 5);
  assert.equal(visiblePriceTrendIndex(state), 0);

  state = reducePriceTrendSelection(state, { type: "key", key: "ArrowLeft" }, 5);
  assert.equal(visiblePriceTrendIndex(state), 0);
});

test("empty price windows produce a neutral selection", () => {
  const state = reducePriceTrendSelection(
    initialPriceTrendSelection(0),
    { type: "key", key: "ArrowRight" },
    0,
  );

  assert.deepEqual(state, {
    hoverIndex: null,
    pinnedIndex: null,
    keyboardIndex: 0,
  });
  assert.equal(visiblePriceTrendIndex(state), null);
});
