# 工程标准

本目录是项目长期技术规范的仓库内事实源。飞书文档作为评审与分享入口，进入实施前必须同步到这里。

| 标准 | 文档 | 飞书来源 |
|---|---|---|
| Monorepo 与架构 | [architecture.md](./architecture.md) | [Monorepo 项目规范](https://my.feishu.cn/wiki/QSrwwjtEuiFEWyk8dXIca7QbnHg) |
| 前端 | [frontend.md](./frontend.md) | [前端工程规范](https://my.feishu.cn/wiki/PRF3wXNwJiDULOkaNLLcMF3GnQh) |
| 后端 | [backend.md](./backend.md) | [后端工程规范](https://my.feishu.cn/wiki/VGpDw2xHJiyh5wkX81fcD1nanFf) |
| 数据 | [database.md](./database.md) | [数据工程规范](https://my.feishu.cn/wiki/KdOSwEq5gi7X48kOBDUcA7vznXc) |
| Agent | [agent.md](./agent.md) | [Agent 工程规范](https://my.feishu.cn/wiki/PiLYwVocViMFwTkJwMlcnlWonLc) |
| RAG | [rag.md](./rag.md) | — |
| UI 设计 | [design.md](./design.md) | [UI 设计规范](https://my.feishu.cn/wiki/Y2UtwvOAjiO0r6kZ0ULcFqsnnOf) |
| 产品工作流 | [workflow.md](./workflow.md) | — |
| SDD 当前版本 | [sdd/v2.md](./sdd/v2.md) | — |
| SDD 版本索引 | [sdd/README.md](./sdd/README.md) | — |
| AI 开发工作流短入口 | [development-workflow.md](./development-workflow.md) | — |

## 关系

- `AGENTS.md`：工作入口、常驻约束和工具路由。
- `docs/standards/`：长期维护的完整标准。
- `docs/standards/sdd/`：v2 当前流程、v1 历史快照和迁移记录。
- `docs/standards/development-workflow.md`：v2 的短入口和风险路由。
- `.agents/skills/`：可执行的专业工作方法。
- `openspec/specs/`：长期系统行为规格。
- `openspec/changes/`：单次变更的提案、设计、任务与增量规格。
- `docs/superpowers/specs/`：L2 补充设计或历史技术方案。
- `docs/superpowers/plans/`：L2 长任务补充计划或历史计划。
- `docs/design/prototypes/`：视觉原型基准、探索和历史资产。

## 维护规则

1. 既有事实变化时先更新对应标准，再修改 OpenSpec 能力规格。
2. 同一规则只在长期标准中定义一次；skill 只引用并说明何时读取。
3. 已完成的变更经过验证后归档，增量规格同步到 `openspec/specs/`。
4. 新变更先按 SDD v2 判断类型、风险和基线；需求不确定时再使用适用的澄清 Skill。
