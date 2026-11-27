# Design

## Context

现有 [UI 设计标准](../../../docs/standards/design.md) 已定义 Atlas 是视觉原型的唯一全量入口，也写明“确认并落地后先提升 `initial/` 基准，再回写 Atlas”。但归档 Skill 只检查 OpenSpec 产物、任务和规格同步，没有检查视觉资产生命周期，因此该规则没有形成可执行的归档门禁。

本设计只改变流程和归档行为，不修改页面、Atlas 当前内容或生产代码。

## Goals / Non-Goals

**Goals:**

- 让最终验收版本进入 Atlas，而不是只留下探索稿。
- 在归档前验证 Atlas 条目可打开、最终基准和截图链接可用。
- 在 `verification.md` 留下可审计的视觉同步证据。
- 保持原探索稿和历史视觉稿不变。

**Non-Goals:**

- 不自动回填此前遗漏的 Atlas 条目。
- 不在视觉确认时提前污染 `initial/` 或 Atlas；实现和验收后的版本才可成为最终基准。
- 不改变现有 Atlas 的视觉设计。
- 不对 `visual: not-applicable` 的文档、后端或数据变更提出 Atlas 要求。

## Decisions

### 1. 在归档阶段执行，而不是视觉确认阶段

视觉确认发生在生产实现之前，最终页面仍可能因实现约束、评审 findings 或真实数据调整。Atlas 记录的是用户最终验收的已落地设计，因此在归档前同步。

替代方案是在视觉确认后立即提升 Atlas：会把尚未实现或后来被修改的稿误标为当前设计，不采用。

### 2. 归档门禁同时检查资产和可访问性

有视觉影响的变更必须满足：

1. 最终确认稿已进入 `docs/design/prototypes/initial/`；
2. Atlas 对应页面已新增或更新；
3. Atlas 条目关联 change、最终稿和关键截图/截图索引；
4. 从 Atlas 单入口打开对应条目成功，链接无损坏；
5. `verification.md` 记录以上路径和浏览器验证结果。

只更新 HTML 文件但没有可访问性验证，不算完成。

### 3. 归档 Skill 在移动 change 前硬停

`openspec-archive-change` 读取 proposal 的 `visual` 字段：

- `regression` 或 `new-design`：执行 Atlas 检查；缺失证据时停止，不移动 change；
- `not-applicable`：确认 proposal 有具体无可见 UI 影响理由后继续。

用户确认归档只授权执行归档，不能自动补齐或豁免 Atlas 证据。

### 4. 同一事实写入长期标准和执行入口

- SDD v3 定义归档阶段和完成条件；
- `design.md` 定义视觉资产与 Atlas 生命周期；
- `development-workflow.md` 提供短入口；
- `AGENTS.md` 保留常驻硬约束；
- `openspec/config.yaml` 把规则提供给 OpenSpec 的 apply/archive 运行时指导；
- `openspec-archive-change` 执行实际检查；
- OpenSpec 能力增量定义可验证行为。

不新增第二份平行清单。

## Risks / Trade-offs

- **归档步骤增多** → 只对有视觉影响的变更执行，纯后端和文档变更继续跳过。
- **最终稿与实现截图不一致** → Atlas 必须关联最终验收实现截图，不能只链接探索稿。
- **旧条目持续缺失** → 本变更不回填；另开视觉资产回填任务，避免混入流程治理。
- **用户确认归档但资产未同步** → 归档 Skill 硬停，避免确认被误当成同步授权。

## Migration Plan

1. 更新长期流程和 UI 标准。
2. 更新归档 Skill 的检查步骤和输出摘要。
3. 更新 `openspec/config.yaml` 的视觉归档上下文和 archive guidance。
4. 更新两个能力的增量规格。
5. 验证文档引用、关键词和 OpenSpec 结构。
6. 新规则在变更归档并同步主规格后成为正式流程；已归档变更不重写。

回滚：

- 删除 Atlas 归档门禁段落和对应 Skill 检查；
- 保留 Atlas 与视觉资产变更，不回滚已经确认的最终设计；
- 恢复此前“归档只同步增量规格”的流程描述。

## Open Questions

无。
