import assert from "node:assert/strict";
import test from "node:test";
import {
  quoteCanvasChartStyles,
  type QuoteCanvasColors,
} from "./quote-canvas-theme.ts";

const COLORS: QuoteCanvasColors = {
  canvas: "#ffffff",
  surface: "#f4f6fa",
  ink: "#202a42",
  muted: "#526077",
  line: "#dde3ec",
  grid: "#e5e9f0",
  axis: "#526077",
  crosshair: "#78869c",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dde3ec",
  up: "#b42333",
  down: "#08715e",
  flat: "#778399",
  ma5: "#1a1a1a",
  ma10: "#d4a017",
  ma20: "#9a4dff",
  ma30: "#2e9e5b",
  ma60: "#2f6fe0",
  ma120: "#808080",
  ma250: "#b42333",
};

test("quote canvas styles map every chart surface to fixed white-canvas colors", () => {
  const styles = quoteCanvasChartStyles(COLORS);

  assert.equal(styles.grid?.horizontal?.color, "#e5e9f0");
  assert.equal(styles.grid?.vertical?.color, "#e5e9f0");
  assert.equal(styles.xAxis?.axisLine?.color, "#dde3ec");
  assert.equal(styles.xAxis?.tickText?.color, "#526077");
  assert.equal(styles.yAxis?.tickText?.color, "#526077");
  assert.equal(styles.crosshair?.horizontal?.line?.color, "#78869c");
  assert.equal(styles.crosshair?.vertical?.line?.color, "#78869c");
  assert.equal(styles.candle?.tooltip?.title?.color, "#202a42");
  assert.equal(styles.candle?.tooltip?.title?.show, false);
  assert.equal(styles.candle?.tooltip?.showRule, "none");
  assert.equal(styles.candle?.tooltip?.rect?.color, "#ffffff");
  assert.equal(styles.candle?.tooltip?.rect?.borderColor, "#dde3ec");
  assert.equal(styles.candle?.bar?.upColor, "#b42333");
  assert.equal(styles.candle?.bar?.downColor, "#08715e");
  assert.equal(styles.candle?.bar?.noChangeColor, "#778399");
  assert.equal(styles.indicator?.bars?.[0]?.upColor, "#b42333");
  assert.equal(styles.indicator?.bars?.[0]?.downColor, "#08715e");
  assert.equal(styles.indicator?.tooltip?.showRule, "none");
  assert.equal(styles.indicator?.tooltip?.title?.show, false);
  assert.deepEqual(
    styles.indicator?.lines?.map((line) => line.color),
    ["#1a1a1a", "#d4a017", "#9a4dff", "#2e9e5b", "#2f6fe0", "#808080", "#b42333"],
  );
  assert.equal(styles.separator?.color, "#dde3ec");
});
