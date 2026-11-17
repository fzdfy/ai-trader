# Design

## Context

当前前端使用 React 19、Vite 和 TanStack Router。迁移前，根导航、布局、认证页和业务页曾深度依赖旧组件 API；为降低认证、数据查询、图表和交互生命周期同时变化的风险，本次采用兼容 API 的 Preline 基础组件层完成整体替换。

正确原型 `quant-workbench-assistant.html` 是一份 3527 行的完整 PULSE 工作台，包含顶部全局导航、左侧业务导航、行情与每日工作模块、工作流以及可展开的 AI 研究会话，必须保留为可追溯原稿。参考图只用于理解信息密度和页面构成；主题必须沿用原稿的暖白画布、蓝灰导航、原始蓝主操作、黄色状态强调、A 股红涨绿跌和 SF Pro / PingFang 字体。

项目当前没有 OpenSpec 根、长期标准目录或项目级工作流 skills。相关 Feishu 文档已经存在，但还不是仓库事实源。

## Goals / Non-Goals

**Goals:**

- 让项目规范、Agent 工作流、OpenSpec 规格和原型资产在仓库中可发现、可执行、可验证。
- 在不破坏现有业务路由的前提下，接入 Preline/Tailwind，并完成全局壳层与工作台首页迁移。
- 把原始 PULSE 原稿的主题映射为项目可执行的 Preline token，而不是沿用参考图的暖橙主题。
- 保存原稿，并生成可独立浏览的 Preline 探索原型。
- 通过兼容 API 的 Preline 组件层完成全部业务路由迁移，并移除旧运行时和依赖。

**Non-Goals:**

- 不改后端 API、数据模型、认证协议或量化计算逻辑。
- 不引入 Reference Map、数据库变更或新的外部 UI 依赖。
- 不实现 Preline MCP 的 Token 配置；只保留文档和接入说明。

## Decisions

### Decision 1: 使用仓库标准 + 可执行 skills 的双层治理

`docs/standards/` 保存长期事实，`.agents/skills/` 保存可执行步骤。`AGENTS.md` 只保留导航、常驻约束和工作流路由。

替代方案：

- 全部塞进 `AGENTS.md`：上下文过大且无法按阶段执行。
- 只保留 skills：缺少可审查、长期稳定的项目事实。

采用双层结构，并用 OpenSpec 规格描述跨工具行为。

### Decision 2: 工作流按阶段路由，而非每个任务加载全部 skills

- 模糊需求：`grill-with-docs` → `grilling` + `domain-modeling`
- 规格和任务：`openspec-propose` / `openspec-continue-change`
- 方案发散：`brainstorming`
- 实施前复杂度检查：`ponytail`
- 实施：`test-driven-development`
- 实施后：`code-simplifier` → `requesting-code-review` → `ponytail-review`
- 验证归档：`verification-before-completion` → `openspec-verify-change` → `openspec-archive-change`

替代方案是始终加载全部 skills，会互相争夺流程控制权。按阶段路由责任更清晰。

### Decision 3: Preline 兼容组件层整体替换

新增 Tailwind CSS v4、Preline 和 Preline 主题，并在 `components/preline-ui/` 提供与旧业务代码参数兼容的 Stack、Table、Form、Dialog、Markdown 等基础组件。业务页只替换组件入口，查询、缓存、图表和任务状态逻辑保持不变。

替代方案：

- 一次性逐页重写 JSX：虽然视觉自由度更高，但会同时改变稳定业务行为，回归面过大。
- 新开独立应用：会分裂认证、路由与数据层，违背保留原产品的要求。

### Decision 4: 主题以原始 PULSE 原型为唯一来源

核心 token：

| Token | 值 | 用途 |
|---|---|---|
| `--background` | `#f6f5f1` | 原稿应用画布 |
| `--surface` | `#eef1f7` | 左侧导航和低层面板 |
| `--panel` | `#ffffff` | 主要工作区 |
| `--foreground` | `#202a42` | 主文本和深色按钮 |
| `--muted-foreground` | `#727f98` | 次级说明 |
| `--primary` | `#3157e8` | 品牌强调、活跃指标、主操作 |
| `--primary-soft` | `#ebefff` | 选中背景、柔和趋势区 |
| `--highlight` | `#ffd951` | 原稿黄色状态强调 |
| `--success` | `#0b967a` | 正常、完成和下跌语义 |
| `--destructive` | `#e7525b` | 错误和上涨语义 |

字体沿用原稿：`SF Pro Display`, `SF Pro Text`, `PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei`，不新增字体依赖。数字使用等宽数字特性。

布局采用三区：

```text
┌──────────┬──────────────────────────────┬──────────────┐
│ 业务导航 │ 搜索 + 页面标题 + KPI         │ AI 助手       │
│ 240px    │ 图表 + 任务表 + 复盘          │ 360px        │
└──────────┴──────────────────────────────┴──────────────┘
```

主内容左对齐；KPI 是紧凑带状指标而不是四张大型营销卡。只保留一层外框和必要分隔线，避免 SaaS 卡片堆叠。

### Decision 5: 原型按“原稿、基准、探索”分层

- 外部 `quant-workbench-assistant.html` 原稿保留不动。
- `docs/design/prototypes/initial/quant-workbench-assistant.html` 是 checksum 一致的校验快照。
- `docs/design/prototypes/explorations/quant-workbench-preline.html` 是独立的新设计探索。
- 参考图保存到 `docs/design/prototypes/assets/reference-workspace.png`，仅作构成参考，不作为主题色来源。

### Decision 6: Preline 仅接管需要 DOM 行为的交互

采用 `preline/non-auto`，在根布局路由变化后初始化。静态布局优先纯 Tailwind markup；下拉、弹窗和主题切换使用 Preline 插件。组件卸载时销毁实例。

### Decision 7: `/home` 成为真实工作台入口

原 `/home` 直接跳转到板块行情，无法承载工作台。新设计把 `/home` 改为内容首页，保留 `/home/market/boards` 和所有原业务路由。

## Risks / Trade-offs

- **工作台数据接口不完整** → 首版使用真实同步状态和现有领域数据，缺失模块提供明确空状态，不伪造业务结论。
- **路由初始化重复或泄漏** → 全局初始化器处理页面级 Preline，组件级插件使用 ref + destroy。
- **兼容层行为缺口** → 为表格排序、选择、Markdown 清理、表单值和移动抽屉补充测试与浏览器回归。
- **误用参考图主题** → 以原始 PULSE 原稿的色板、字体和状态语义为准，参考图只约束信息密度与构成。
- **动态主题首屏闪烁** → 在应用挂载前读取 localStorage，并设置 `html.dark` 与 `data-theme`。

## Migration Plan

1. 固化规范、skills、OpenSpec 规格和原型资产。
2. 安装 Tailwind/Preline，建立主题和路由初始化。
3. 迁移根导航与认证页。
4. 新建 `/home` Preline 工作台并保留全部旧路由。
5. 运行类型检查、lint 和构建，浏览器截图检查浅色、深色和移动端。
6. 通过 `components/preline-ui/` 覆盖全部业务页，移除旧运行时、CSS 和依赖，并完成浏览器回归。

回滚策略：

- 壳层迁移代码集中在少数入口文件，可恢复旧入口。
- 旧业务路由不删除，Preline 路由失败时仍可访问原页面。
- 主题使用独立 CSS 文件，可单独禁用。

## Open Questions

无阻塞实施的开放问题。Preline MCP Token 与剩余业务页迁移时间可后续决定，不影响当前规格和基础实施。
