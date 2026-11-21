# 个股分析价格趋势图验证报告

日期：2026-11-21  
验证分支：`codex/fix-stock-analysis-price-chart`  
验证标的：`002594.SZ`  
当前状态：实现与验证完成，等待用户验收；尚未归档。

## 1. 视觉门禁

- 用户已确认探索稿：`docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`
- 设计含 120 个交易日前复权收盘价、MA20、MA60、20 日支撑、60 日压力、五个等距 `MM-DD` 刻度。
- 桌面、移动端、浅色、深色、指针悬停、点击固定、键盘焦点、空态和部分成功态均已截图。

## 2. 自动化检查

| 检查 | 结果 |
|---|---|
| Web 全量 Node 测试 | 61/61 通过 |
| 价格趋势纯函数聚焦测试 | 15/15 通过 |
| 纯函数覆盖率 | 行/函数 100%，分支 96.39% |
| Server 定向回归测试 | 1/1 通过 |
| 全仓 TypeScript 类型检查 | web/server 2/2 通过 |
| 全仓 oxlint | 0 error，36 个既有 warning |
| Web 生产构建 | 通过；仅有既有大 chunk warning |
| OpenSpec strict validation | 通过 |
| `git diff --check` | 通过 |

关键命令：

```bash
cd apps/web && pnpm test
cd apps/web && pnpm check-types
cd apps/web && pnpm lint
cd apps/web && pnpm build
pnpm check-types
pnpm lint
pnpm exec openspec validate fix-stock-analysis-price-chart --strict
```

服务端文案回归命令：

```bash
cd apps/server
node --env-file-if-exists=../../.env.local --import @oxc-node/core/register \
  --test --test-name-pattern="stock analysis returns the aggregate pending PDF count" \
  src/api/index.test.ts
```

## 3. 自动化覆盖

已覆盖：

- MA20/MA60 尾部窗口和不足周期时的 `null`；
- 120 个交易日的五个刻度 `[0, 30, 60, 89, 119]`；
- 纵轴覆盖收盘价、均线、支撑与压力；
- 少于两个交易日返回空；
- 桌面 `760 × 280`、移动端 `420 × 320`；
- 指针索引映射、左右越界限制、提示框边界；
- 悬停、点击固定、首次聚焦、Home、End、Escape 和空序列。

## 4. 真实页面视觉证据

截图根目录：
`docs/design/prototypes/explorations/screenshots/stock-chart-v2/`

| 场景 | 证据 |
|---|---|
| 浅色桌面 | `production-light-desktop-v2/page-进入个股分析.png` |
| 深色桌面 | `production-dark-desktop/page-深色图表.png` |
| 浅色移动端 | `production-light-mobile-v2/page-移动端图表.png` |
| 深色移动端 | `production-dark-mobile/page-移动端深色图表.png` |
| 指针悬停 | `production-hover-light-desktop-v2/page-指针悬停.png` |
| 点击固定 | `production-selected-light-desktop/page-图表选中态.png` |
| 键盘 Home | `production-keyboard-light-desktop-v2/page-键盘浏览.png` |
| 历史不足 | `production-empty-state/page.png` |
| 技术指标缺失 | `production-partial-state/page.png` |

真实页面检查结果：

- 120 个交易日按交易索引等距排列；
- 五个 `MM-DD` 刻度与绘图区左右边缘对齐；
- 提示框显示完整日期、收盘价、MA20 和 MA60；
- 浅色与深色均使用语义图表 token；
- 移动端页脚日期避开 AI 助手悬浮按钮；
- 无控制台错误、横向溢出或图片加载失败。

## 5. 数据与兼容性

- 未新增 API、数据库迁移、Quant 变更、复权改动或 Provider 改动。
- `GET /api/v1/stock-analysis/:symbol` 结构保持不变。
- 服务端研究摘要标签从“K 线”改为“收盘价”，仅修正展示文案，并由定向测试锁定。
- 未新增图表库、动画库或全局状态依赖。

## 6. 环境与残余提示

- 本地依赖曾缺少 lockfile 已声明的 `@dnd-kit` 包；使用项目 pnpm 和 `--frozen-lockfile` 补齐，未修改 `package.json` 或 lockfile。
- 为真实页面截图临时允许 server 信任 `localhost:9080`，截图后已按原 `.env.public` 重建 server 恢复。
- 截图工具仍报告全页既有的 9–10px 小字、部分对比度和框组提示；本次图表轴文字已使用桌面 12px、移动端 14px，未新增可视溢出。
- 移动端输入框小于 16px 的提示来自现有页面搜索框，不属于图表模块。
- 组件交互通过真实浏览器与纯函数测试验证；仓库当前没有 React DOM 组件测试框架，因此未新增 JSX 单元测试。

## 7. 最终审查

独立 reviewer 子任务通道未能接收指定评审指令，实际退化为作者自查，未把它伪报为独立评审。

自查后已修复：

- SVG 焦点环被卡片 `overflow-hidden` 裁切；
- 组件 ARIA 名称曾硬编码“比亚迪”；
- 技术指标对象存在但全部字段为空时仍可能绘制均线；
- 研究摘要残留“K 线”文案。

仍为非阻塞小项：

- 屏幕阅读器实时读数会跟随指针悬停更新，键盘用户不受影响；
- 极窄价格区间的整数 Y 轴标签可能重复，当前 120 日 A 股样本未出现。

未发现 Must Fix 或 Should Fix 项。

## 8. OpenSpec Verification Report

### Summary

| Dimension | Status |
|---|---|
| Completeness | 19/19 tasks, 5/5 added requirements |
| Correctness | 5/5 requirements mapped; 10/10 scenarios covered |
| Coherence | Design followed; no pattern issues |

### Completeness

- `taskTrackingConfigured=true`，任务 `19/19` 完成。
- Delta spec 包含 5 个 ADDED requirements，全部存在对应实现。
- 视觉门禁、技术评审、聚焦测试、页面接入、浏览器截图和验证报告均已记录。

### Correctness

| Requirement | Evidence |
|---|---|
| Price trend identifies its adjustment and price basis | 图表标题、徽标、空态和截图 |
| Trend overlays share one visible price scale | 几何测试、真实浅/深截图 |
| Trend x-axis follows trading-day order | 刻度单测、真实桌面/移动截图 |
| Trend data is inspectable with pointer and keyboard | 指针、固定选中、键盘截图和选择状态测试 |
| Trend chart remains usable across themes and viewports | 四端截图、移动端安全区和主题 token |

10 个场景均有实现与截图或自动化测试证据。

### Coherence

- 采用纯计算模块与 SVG 组件分离，符合设计中的文件边界。
- 未引入 ECharts、klinecharts 或新依赖。
- 使用 Preline/Tailwind 语义 token，未在业务组件散落颜色。
- API 结构、数据库、复权、Quant 与 Provider 路径未变化；后端只修正展示文案。

### Issues

无 CRITICAL、WARNING 或新的 SUGGESTION。验证报告已记录两个已知非阻塞小项：屏幕阅读器读数跟随指针悬停，以及极窄价格区间的整数 Y 轴标签可能重复。

### Final Assessment

All checks passed. Ready for archive.
