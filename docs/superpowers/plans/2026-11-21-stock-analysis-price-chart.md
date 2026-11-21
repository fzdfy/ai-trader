# 个股分析价格趋势图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把个股分析页的伪 K 线修正为可交互、可访问的前复权收盘价趋势图，并展示 MA20、MA60、支撑压力和五个交易日横轴刻度。

**Architecture:** 用一个无依赖的纯函数模块负责均线、坐标、刻度、指针映射和选择状态，用独立 React SVG 组件负责渲染与事件绑定，`StockAnalysisDetail` 只负责页面文案、技术指标状态和组件挂载。现有 API、数据库、复权和数据源链路保持不变。

**Tech Stack:** React 19、TypeScript、SVG、Tailwind CSS、Preline 语义 token、Node test runner、Vite。

**Spec:** `docs/superpowers/specs/2026-11-21-stock-analysis-price-chart-design.md`

## Global Constraints

- 图表只表达“前复权收盘价趋势”，不得标注为 K 线。
- 展示现有 `prices.data` 的最近 120 个交易日；少于两个交易日显示“历史行情不足”。
- MA20/MA60 从当前展示窗口的收盘价计算；技术指标为空时保留收盘价，隐藏 MA 和支撑压力。
- 横轴按交易日索引等距排列，使用五个约等距的 `MM-DD` 刻度；120 个点时为索引 `[0, 30, 60, 89, 119]`。
- 桌面 viewBox 为 `760 × 280`，移动端为 `420 × 320`；数值来自确认视觉稿。
- 响应式断点与确认稿一致：`640px` 及以下使用移动端 viewBox。
- 鼠标、触控、键盘和屏幕阅读器必须共用同一可见交易日选择模型。
- 只使用 `--chart-current`、`--chart-ma-20`、`--chart-ma-60`、`--chart-up`、`--chart-down`、`--chart-grid`、`--chart-axis-text` 等语义颜色，不新增 raw hex。
- 不新增图表库、动画库、API、数据库迁移或全局状态。
- 生产代码必须等独立技术评审在 `openspec/changes/fix-stock-analysis-price-chart/design.md#Review Result` 标记 `approved` 后才能修改。
- 每个行为先写失败测试并取得预期 RED，再写最小实现并取得 GREEN。
- 工作区已有未提交改动；每个任务只暂存自己的文件，禁止 `git add -A`。
- 视觉设计已于 2026-11-21 确认，原型为 `docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`。

## Review Focus

- 数据少于均线周期时仍绘制看似有效的 MA60 → 测试不足 60 个点时 MA60 返回 `null`，组件断点处不连线。
- 提示框靠近左右边缘时被裁切 → 测试桌面与移动端边界都限制在绘图区内。
- 技术指标为空时误画支撑压力或残留均线 → 测试 `reference=null` 的几何输出不包含技术叠加。
- 点击固定选中后被 pointerleave 或焦点移动意外清除 → 测试可见索引从悬停回退到固定选择，只有 Escape 清除。
- 移动端横轴、提示框或页脚被裁切和 AI 助手按钮遮挡 → 生产验收覆盖 390px 宽浅色/深色并检查全部横轴标签与页脚。

---

### Task 1: 图表几何与选择状态契约

**Files:**

- Create: `apps/web/src/lib/price-trend-chart.ts`
- Test: `apps/web/src/lib/price-trend-chart.test.ts`

**Interfaces:**

- Produces: `type PriceTrendViewport = "desktop" | "mobile"`
- Produces: `interface PriceTrendPoint { time: string; close: number }`
- Produces: `interface PriceTrendReference { ma20: number | null; ma60: number | null; support20: number | null; resistance60: number | null }`
- Produces: `interface BuildPriceTrendGeometryInput { points: readonly PriceTrendPoint[]; reference: PriceTrendReference | null; viewport: PriceTrendViewport }`
- Produces: `interface PriceTrendGeometry { width: number; height: number; left: number; right: number; top: number; bottom: number; x(index: number): number; y(value: number): number; yDomain: { min: number; max: number }; closePath: string; areaPath: string; ma20Path: string | null; ma60Path: string | null; gridValues: number[]; tickIndexes: number[]; supportY: number | null; resistanceY: number | null }`
- Produces: `interface PriceTrendSelection { hoverIndex: number | null; pinnedIndex: number | null; keyboardIndex: number }`
- Produces: `type PriceTrendSelectionAction = { type: "pointer-move"; index: number } | { type: "pointer-leave" } | { type: "pin"; index: number } | { type: "focus" } | { type: "key"; key: "ArrowLeft" | "ArrowRight" | "Home" | "End" | "Escape" }`
- Produces: `movingAverage(values: readonly number[], period: number): Array<number | null>`
- Produces: `axisTickIndexes(pointCount: number, tickCount?: number): number[]`
- Produces: `buildPriceTrendGeometry(input: BuildPriceTrendGeometryInput): PriceTrendGeometry | null`
- Produces: `indexFromPointerX(clientX: number, rectLeft: number, rectWidth: number, viewport: PriceTrendViewport, pointCount: number): number`
- Produces: `clampTooltipX(targetX: number, tooltipWidth: number, left: number, right: number): number`
- Produces: `formatTrendAxisDate(time: string): string`
- Produces: `formatTrendFullDate(time: string): string`
- Produces: `initialPriceTrendSelection(pointCount: number): PriceTrendSelection`
- Produces: `reducePriceTrendSelection(state: PriceTrendSelection, action: PriceTrendSelectionAction, pointCount: number): PriceTrendSelection`
- Produces: `visiblePriceTrendIndex(state: PriceTrendSelection): number | null`

- [ ] **Step 1: 先写失败的纯函数测试**

创建 `price-trend-chart.test.ts`，至少包含以下断言：

```ts
test("moving averages align trailing windows and preserve unavailable heads", () => {
  assert.deepEqual(movingAverage([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(movingAverage([1, 2, 3], 4), [null, null, null]);
});

test("120 trading days produce five plotting-aligned tick indexes", () => {
  assert.deepEqual(axisTickIndexes(120), [0, 30, 60, 89, 119]);
});

test("technical references extend the scale and can be omitted", () => {
  const points = Array.from({ length: 60 }, (_, index) => ({
    time: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
    close: 80 + index / 10,
  }));
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

test("tooltips stay inside the plot at both horizontal edges", () => {
  assert.equal(clampTooltipX(50, 172, 50, 742), 50);
  assert.equal(clampTooltipX(741, 172, 50, 742), 570);
});

test("dates format from the API string without timezone shifts", () => {
  assert.equal(formatTrendAxisDate("2026-11-21T00:00:00.000Z"), "11-21");
  assert.equal(formatTrendFullDate("2026-11-21T00:00:00.000Z"), "2026-11-21");
});

test("pointer x maps linearly to trading-day indexes", () => {
  assert.equal(indexFromPointerX(50, 0, 760, "desktop", 120), 0);
  assert.equal(indexFromPointerX(742, 0, 760, "desktop", 120), 119);
  assert.equal(indexFromPointerX(-10, 0, 760, "desktop", 120), 0);
  assert.equal(indexFromPointerX(900, 0, 760, "desktop", 120), 119);
});

test("pointer clicks pin a day and keyboard navigation follows trading-day order", () => {
  let state = initialPriceTrendSelection(10);
  state = reducePriceTrendSelection(state, { type: "pin", index: 4 }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);
  state = reducePriceTrendSelection(state, { type: "pointer-leave" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 4);
  state = reducePriceTrendSelection(state, { type: "key", key: "ArrowRight" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 5);
  state = reducePriceTrendSelection(state, { type: "key", key: "End" }, 10);
  assert.equal(visiblePriceTrendIndex(state), 9);
  state = reducePriceTrendSelection(state, { type: "key", key: "Escape" }, 10);
  assert.equal(visiblePriceTrendIndex(state), null);
});
```

还要覆盖：

- `buildPriceTrendGeometry` 在点数小于 2 时返回 `null`。
- `indexFromPointerX` 把越界输入限制到首尾索引。
- `axisTickIndexes(1)` 返回 `[0]`，`axisTickIndexes(0)` 返回 `[]`。
- 移动端几何使用 `420 × 320`、`left=40`、`right=18`、`top=20`、`bottom=42`。
- 完整 60 点数据产生 `ma60Path`，59 点数据不产生。

- [ ] **Step 2: 运行测试并确认 RED**

运行：

```bash
cd apps/web
node --test --experimental-strip-types src/lib/price-trend-chart.test.ts
```

预期：FAIL，因为 `price-trend-chart.ts` 尚不存在。

- [ ] **Step 3: 实现纯函数契约**

使用确认稿中的几何参数：

```ts
const VIEWPORTS = {
  desktop: { width: 760, height: 280, left: 50, right: 18, top: 20, bottom: 42 },
  mobile: { width: 420, height: 320, left: 40, right: 18, top: 20, bottom: 42 },
} as const;
```

实现规则：

- 点数小于 2 时，`buildPriceTrendGeometry` 返回 `null`。
- `axisTickIndexes` 使用 `Math.round((count - 1) * position / (tickCount - 1))`，去重并保持顺序。
- 日期只截取 API 字符串前 10 位的年月日，不使用 `new Date()` 做时区转换。
- Y 轴范围覆盖收盘价、可见均线和支撑压力，再增加跨度的 4% 上下留白；跨度为零时扩展为 `±0.5`。
- MA 路径从第一个有效值开始，不得跨越 `null` 连接。
- `visiblePriceTrendIndex` 返回 `hoverIndex ?? pinnedIndex`。
- 初始键盘索引为最后一个交易日，初始固定索引为 `null`。
- `focus` 只在没有固定索引时固定当前键盘索引，使首次聚焦即显示最后一个交易日读数。
- 方向键从当前可见索引或键盘索引移动，Home/End 跳到首尾，Escape 清除悬停和固定状态。
- 所有索引和指针投影都必须限制在可用交易日范围内。

- [ ] **Step 4: 运行测试并确认 GREEN**

运行：

```bash
cd apps/web
node --test --experimental-strip-types src/lib/price-trend-chart.test.ts
pnpm check-types
```

预期：全部 PASS。

- [ ] **Step 5: 提交 Task 1**

```bash
git add apps/web/src/lib/price-trend-chart.ts \
  apps/web/src/lib/price-trend-chart.test.ts
git commit -m "feat: add price trend chart contracts"
```

### Task 2: 可访问 SVG 图表组件

**Files:**

- Create: `apps/web/src/components/charts/PriceTrendChart.tsx`
- Modify: `apps/web/src/styles/themes/preline/ai-trader.css`

**Interfaces:**

- Consumes: Task 1 的全部纯函数契约。
- Produces: `PriceTrendChart({ points, reference }: PriceTrendChartProps): JSX.Element`
- Produces: `interface PriceTrendChartProps { points: readonly PriceTrendPoint[]; reference: PriceTrendReference | null }`

- [ ] **Step 1: 实现响应式 viewport 订阅**

使用 `useSyncExternalStore` 订阅 `matchMedia("(min-width: 641px)")`：

- 服务端快照返回 `"desktop"`。
- 浏览器在 `"desktop"` 与 `"mobile"` 间更新。
- 取消订阅时移除 media-query listener。
- viewport 改变时保留当前选中的交易日索引。

- [ ] **Step 2: 渲染确认稿的 SVG 结构**

按以下顺序渲染：

1. 横向 Y 网格线和右对齐数值；
2. 五个纵向 X 刻度和 `MM-DD` 标签；
3. 收盘价面积渐变；
4. MA20、MA60 路径；
5. 虚线支撑和压力及其右缘数值；
6. 收盘价折线和最后一点标记；
7. 选中日元十字线和点标记；
8. 限制在绘图区内的提示框，显示完整日期、收盘价、MA20 和 MA60。

实现要求：

- 用 `useId()` 生成渐变 id，避免同页多个图表冲突。
- SVG 使用 `role="img"`、`tabIndex={0}`，可访问名称包含“前复权收盘价”和方向键提示。
- 使用 `focus-visible:outline-2` 等项目语义样式提供可见焦点。
- 指针坐标通过 SVG 边界映射到 Task 1 的 `indexFromPointerX`。
- `pointermove` 更新悬停，`pointerleave` 清除悬停，`pointerdown` 或 click 固定选中并聚焦 SVG。
- `onKeyDown` 委托给 Task 1 reducer；只对已处理按键调用 `preventDefault()`。
- 增加 `aria-live="polite"` 读数和包含日期、收盘价、MA20、MA60 的 `sr-only` 数据表。
- 在对应 SVG 序列上写 `data-series="close" | "ma20" | "ma60" | "support" | "resistance"`。
- 支撑使用绿色 `--chart-down`，压力使用红色 `--chart-up`，符合 A 股红涨绿跌语义。
- 在 Preline 主题根节点补充浅色 MA20 `#9a4dff` / MA60 `#2f6fe0`，在 `.dark` 补充深色 MA20 `#e040fb` / MA60 `#4c8dff`；组件只引用 `var(--chart-ma-20)` / `var(--chart-ma-60)`。
- 不可用指标显示 `—`，不得用零或相邻点代替。
- 少于两个交易日时使用项目语义 `EmptyState`，标题为 `历史行情不足`，描述为 `至少需要两个交易日的收盘价才能绘制趋势。`

- [ ] **Step 3: 验证类型和构建**

运行：

```bash
cd apps/web
pnpm check-types
pnpm build
```

预期：类型检查与 Vite 构建通过且无未解析符号；完整、部分成功和空状态由后续生产页面验收覆盖。

- [ ] **Step 4: 提交 Task 2**

```bash
git add apps/web/src/components/charts/PriceTrendChart.tsx \
  apps/web/src/styles/themes/preline/ai-trader.css
git commit -m "feat: add accessible price trend chart"
```

### Task 3: 接入个股分析页

**Files:**

- Modify: `apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx`

**Interfaces:**

- Consumes: `apps/web/src/components/charts/PriceTrendChart.tsx`。
- Consumes: `StockAnalysisResponse["prices"]["data"]` 和 `TechnicalSnapshot | null`。
- Produces: 确认稿要求的页面文案和状态选择。
- Produces: 页面中不再保留本地图表几何实现。

- [ ] **Step 1: 替换本地图表和重复页脚**

删除 `StockAnalysisDetail.tsx` 内现有的本地 `PriceTrendChart`，导入新组件并接入：

```tsx
<PriceTrendChart
  points={data.prices.data}
  reference={
    technical
      ? {
          ma20: technical.ma20,
          ma60: technical.ma60,
          support20: technical.support20,
          resistance60: technical.resistance60,
        }
      : null
  }
/>
```

删除 SVG 下方现有的首尾日期页脚。新 SVG 已包含五个日期刻度；保留旧页脚会重复日期并重新制造移动端 AI 助手按钮遮挡。

- [ ] **Step 2: 修正文案与部分成功状态**

使用以下精确可见文案：

- 副标题：`前复权收盘价 · 最近 ${data.prices.data.length} 个交易日`
- 徽标：`收盘价 · ${formatDate(data.prices.asOf)}`
- 指标：现有 `MA20`、`MA60`、`RSI14`、`20日支撑`、`60日压力`
- 技术指标为空：`技术指标待生成`
- 历史数据不足：`至少需要两个交易日的收盘价才能绘制趋势。`

不得改变 API 来源、质量徽标 variant 或服务端技术快照值。

- [ ] **Step 3: 验证错误 K 线文案已消失**

运行：

```bash
rg -n 'K 线|收盘价 K 线|最近 120 个交易日收盘价走势' \
  apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx \
  apps/web/src/components/charts/PriceTrendChart.tsx \
  apps/web/src/lib/price-trend-chart.ts
```

预期：无输出。

再运行：

```bash
cd apps/web
pnpm check-types
pnpm build
```

预期：PASS。

- [ ] **Step 4: 提交 Task 3**

```bash
git add apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx \
  apps/web/src/components/charts/PriceTrendChart.tsx
git commit -m "fix: show accurate stock price trend"
```

### Task 4: 完整验证与视觉验收

**Files:**

- Create: `openspec/changes/fix-stock-analysis-price-chart/verification.md`
- Screenshot evidence: `docs/design/prototypes/explorations/screenshots/stock-chart-production-v1/`

- [ ] **Step 1: 运行自动化检查**

运行：

```bash
cd apps/web
node --test --experimental-strip-types src/lib/price-trend-chart.test.ts
pnpm test
pnpm check-types
pnpm lint
pnpm build

cd ../..
pnpm lint
pnpm check-types
```

预期：全部命令退出码为 0，并把实际命令和结果写入 `verification.md`。

- [ ] **Step 2: 截取生产页面状态**

本地应用运行在 `http://localhost:9080` 且浏览器已登录时，打开：

```text
http://localhost:9080/home/market/analysis/002594.SZ
```

截图并检查：

- 桌面浅色和深色；
- 390px 移动端浅色和深色；
- 鼠标悬停十字线与提示框；
- 点击固定选中态；
- 键盘 `ArrowLeft`、`ArrowRight`、`Home`、`End`、`Escape`。

预期：

- 五个 `MM-DD` 刻度与绘图区对齐；
- 提示框显示完整 `YYYY-MM-DD`、收盘价、MA20 和 MA60；
- 图表文字、提示框、图例和日期没有被 AI 助手按钮遮挡；
- 浅色和深色均可读，页面没有横向溢出；
- 没有控制台错误或图片加载失败。

- [ ] **Step 3: 验证空态和部分成功**

使用少于两个价格点或 `technical=null` 的标的/模拟响应检查。

预期：

- 少于两个价格点显示 `历史行情不足`；
- `technical=null` 仍显示收盘价趋势和 `技术指标待生成`；
- 不渲染 MA、支撑或压力路径。

- [ ] **Step 4: 写验证报告**

在 `verification.md` 记录：

- 自动化命令结果；
- 截图路径；
- 人工指针和键盘结果；
- 空态与部分成功结果；
- 跳过项和环境限制；
- 原型全局遗留的非阻塞 lint 提示。

- [ ] **Step 5: 请求最终审查并停止**

不得自动归档。汇报验证证据并请求用户验收；只有收到单独的归档确认后，才能进入归档流程。

## Workflow Follow-up

- Task 1 开始前必须完成独立技术评审；当前 `design.md` 仍为 `Pending independent technical review`。
- 用户验收通过后，使用项目归档流程并同步 capability spec。
