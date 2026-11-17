# Proposal

## Why

当前项目规范分散在飞书文档、`AGENTS.md`、源码和临时原型中，缺少可供 Agent 执行的统一工作流，也没有把确认过的原型、长期标准、变更规格与实施任务连接起来。与此同时，前端仍以 Astryx 为主，无法按已确认的 Preline 方向和参考原型持续演进。

## What Changes

- 将六份飞书规范固化到 `docs/standards/`，建立 Monorepo、前端、后端、数据、Agent、UI 设计规范的长期事实源。
- 安装并记录 Grill-with-docs、OpenSpec、Superpowers、Ponytail、Code Simplifier 及其必要依赖，形成从澄清到归档的可执行工作流。
- 建立 OpenSpec 的长期规格、变更、schema 与实施任务目录，后续变更以 `tasks.md` 作为唯一实施清单。
- 保留正确的 `quant-workbench-assistant.html` 原稿，在 `docs/design/prototypes/` 下建立基准快照和独立探索稿。
- 沿用原始 `quant-workbench-assistant.html` 的主题，并接入 Preline UI、Tailwind CSS、Preline Theme 与路由切换初始化。
- 将全局导航、首页工作台、认证页面和全部业务路由迁移到 Preline，并通过兼容 API 保持现有查询、表单和任务行为。
- 补充项目级 `ui-design`、`frontend`、`backend`、`database`、`code-review` skills，使规范可以被 Agent 按阶段执行。

## Capabilities

### New Capabilities

- `ai-coding-workflow`: 定义规范驱动的需求澄清、规格、方案、任务、TDD、简化、审查与归档行为。
- `preline-workbench-ui`: 定义 Preline 设计系统、主题、原型管理和工作台界面的可验证行为。

### Modified Capabilities

<!-- 当前没有既有 OpenSpec 主规格，本次建立新的长期能力。 -->

## Impact

- `AGENTS.md`
- `.agents/skills/*`
- `docs/standards/*`
- `docs/design/prototypes/*`
- `docs/adr/*`
- `openspec/config.yaml`
- `openspec/specs/*`
- `openspec/changes/establish-sdd-and-preline-workbench/*`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/src/**`，包括 `components/preline-ui/` 兼容组件层
- `/Users/dakai/Documents/Codex/2026-11-15/ai-ui/outputs/quant-workbench-assistant.html` 仅作为原稿来源，不修改
