/**
 * echarts 按需注册 — 避免全量打包（bundle-barrel-imports）。
 *
 * 只注册本项目用到的图表/组件/渲染器，统一从这里取 echarts 实例。
 * 类型（如 TooltipComponentFormatterCallbackParams）仍需从 "echarts" 主包以
 * `import type` 导入（类型导入不产生运行时开销）。
 */
import * as echarts from "echarts/core";
import { graphic } from "echarts/core";
import { BarChart, LineChart, TreemapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  TreemapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  SVGRenderer,
  CanvasRenderer,
]);

export { echarts, graphic };
