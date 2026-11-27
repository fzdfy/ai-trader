import type { DeepPartial, Styles } from "klinecharts";
import { cssVar } from "./theme.ts";

export interface QuoteCanvasColors {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  grid: string;
  axis: string;
  crosshair: string;
  tooltipBg: string;
  tooltipBorder: string;
  up: string;
  down: string;
  flat: string;
  ma5: string;
  ma10: string;
  ma20: string;
  ma30: string;
  ma60: string;
  ma120: string;
  ma250: string;
  forecast: string;
  forecastBand: string;
}

export function readQuoteCanvasColors(): QuoteCanvasColors {
  return {
    canvas: cssVar("--quote-canvas", "#ffffff"),
    surface: cssVar("--quote-canvas-surface", "#f4f6fa"),
    ink: cssVar("--quote-canvas-ink", "#202a42"),
    muted: cssVar("--quote-canvas-muted", "#526077"),
    line: cssVar("--quote-canvas-line", "#dde3ec"),
    grid: cssVar("--quote-canvas-grid", "#e5e9f0"),
    axis: cssVar("--quote-canvas-axis", "#526077"),
    crosshair: cssVar("--quote-canvas-crosshair", "#78869c"),
    tooltipBg: cssVar("--quote-canvas-tooltip-bg", "#ffffff"),
    tooltipBorder: cssVar("--quote-canvas-tooltip-border", "#dde3ec"),
    up: cssVar("--quote-canvas-up", "#b42333"),
    down: cssVar("--quote-canvas-down", "#08715e"),
    flat: cssVar("--quote-canvas-flat", "#778399"),
    ma5: cssVar("--quote-canvas-ma-5", "#1a1a1a"),
    ma10: cssVar("--quote-canvas-ma-10", "#d4a017"),
    ma20: cssVar("--quote-canvas-ma-20", "#9a4dff"),
    ma30: cssVar("--quote-canvas-ma-30", "#2e9e5b"),
    ma60: cssVar("--quote-canvas-ma-60", "#2f6fe0"),
    ma120: cssVar("--quote-canvas-ma-120", "#808080"),
    ma250: cssVar("--quote-canvas-ma-250", "#b42333"),
    forecast: cssVar("--quote-canvas-forecast", "#3157e8"),
    forecastBand: cssVar("--quote-canvas-forecast-band", "rgba(49, 87, 232, 0.16)"),
  };
}

export function quoteCanvasChartStyles(colors: QuoteCanvasColors): DeepPartial<Styles> {
  const maColors = [
    colors.ma5,
    colors.ma10,
    colors.ma20,
    colors.ma30,
    colors.ma60,
    colors.ma120,
    colors.ma250,
  ];

  return {
    grid: {
      show: true,
      horizontal: { color: colors.grid },
      vertical: { color: colors.grid },
    },
    candle: {
      bar: {
        upColor: colors.up,
        downColor: colors.down,
        noChangeColor: colors.flat,
        upBorderColor: colors.up,
        downBorderColor: colors.down,
        noChangeBorderColor: colors.flat,
        upWickColor: colors.up,
        downWickColor: colors.down,
        noChangeWickColor: colors.flat,
      },
      area: {
        lineColor: colors.up,
        backgroundColor: colors.canvas,
      },
      priceMark: {
        high: { color: colors.muted },
        low: { color: colors.muted },
        last: {
          upColor: colors.up,
          downColor: colors.down,
          noChangeColor: colors.flat,
          text: { color: colors.ink },
        },
      },
      tooltip: {
        showRule: "none",
        title: { color: colors.ink, show: false },
        rect: {
          color: colors.tooltipBg,
          borderColor: colors.tooltipBorder,
        },
      },
    },
    indicator: {
      bars: [
        {
          upColor: colors.up,
          downColor: colors.down,
          noChangeColor: colors.flat,
        },
      ],
      lines: maColors.map((color) => ({ color })),
      tooltip: {
        showRule: "none",
        title: { color: colors.ink, show: false },
      },
    },
    xAxis: {
      axisLine: { color: colors.line },
      tickLine: { color: colors.line },
      tickText: { color: colors.axis },
    },
    yAxis: {
      axisLine: { color: colors.line },
      tickLine: { color: colors.line },
      tickText: { color: colors.axis },
    },
    separator: {
      color: colors.line,
      activeBackgroundColor: colors.surface,
    },
    crosshair: {
      horizontal: {
        line: { color: colors.crosshair },
        text: { color: colors.ink, backgroundColor: colors.surface },
      },
      vertical: {
        line: { color: colors.crosshair },
        text: { color: colors.ink, backgroundColor: colors.surface },
      },
    },
  };
}
