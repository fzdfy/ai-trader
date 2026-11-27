# Tasks

Visual design: not applicable. 本变更只修改流程文档、OpenSpec 配置和术语，不修改页面、组件、可见状态、交互、响应式或明暗模式。

## 1. Design Review Gate

- [x] 1.1 对修订后的 proposal、增量规格和 design 完成最终独立设计评审，关闭全部
  Critical/Important findings 后将评审者、日期、结论和剩余风险写入
  `design.md#Review Result`；验证
  `rg -n "结论.*approved|Critical|Important" openspec/changes/optimize-l2-assurance-workflow/design.md`
  显示批准状态且无未处理阻塞项。

## 2. SDD v3 Standards

- [x] 2.1 基于现有 v2 创建 `docs/standards/sdd/v3.md`，加入 L2 `assurance` 元数据、五项 bounded 条件、档位升级硬停、bounded 实施后评审和 systemic 双评审；验证 `rg -n "assurance|bounded|systemic|changes-required" docs/standards/sdd/v3.md` 覆盖全部规定，并确认 v1/v2 文件未被改写。
- [x] 2.2 创建 `docs/standards/sdd/v2-to-v3.md`，说明变化、保留项、审查时序、存量兼容、回滚和证据位置；验证其中的本地 Markdown 链接均指向存在的文件。
- [x] 2.3 更新 `docs/standards/sdd/README.md`、`docs/standards/development-workflow.md`、`docs/README.md` 和 `AGENTS.md`，将 v3 标为当前流程并只保留短规则与链接；运行 `rg -n "SDD v2|当前.*v2|所有 L2.*实施前.*独立" AGENTS.md docs --glob '*.md'`，除明确的历史/迁移语境外无现行规则残留。

## 3. OpenSpec Rules and Language

- [x] 3.1 更新 `openspec/config.yaml`，要求 L2 声明 `assurance`，区分 bounded/systemic 评审证据，并要求评审修复后重新验证；运行 `node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('openspec/config.yaml','utf8'));"` 验证 YAML 可解析。
- [x] 3.2 在 `docs/glossary.md` 增加“L2 Assurance Level”和“bounded/systemic”的精确术语，明确它们不是风险等级；验证条目包含唯一含义与 `_Avoid_` 词，并用 `rg -n "L2 Assurance|bounded|systemic" docs/glossary.md` 检查。

## 4. Integration Verification

- [x] 4.1 运行 `node_modules/.bin/openspec validate optimize-l2-assurance-workflow --strict`、`git diff --check` 和跨文档一致性搜索，确认 v3 是唯一当前流程、五项 bounded 条件完全一致、L0/L1 不要求 assurance、五件套和视觉门禁未改变。
- [x] 4.2 在实施完成后执行独立代码与风险评审，覆盖规则矛盾、历史兼容、bounded 滥用、评审后重跑验证和回滚；修复全部 `changes-required` 后重新运行 4.1 的完整命令。

## 5. Verification Evidence

- [x] 5.1 创建 `verification.md`，将 AC-1 至 AC-8 映射到命令输出、文件证据、最终设计评审和实施后独立评审结论，记录未覆盖项；验证所有 AC 均有证据且最新完整验证发生在最后一次修改之后。

## Workflow follow-up

- 用户先验收实施与验证结果。
- 只有用户单独确认后才能归档并同步 `ai-coding-workflow` 增量规格。
