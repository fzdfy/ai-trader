# AI Trader 工程术语

项目内共享的工程与设计语言。此处只定义项目特有概念，不收录通用编程术语。

## Language

**Standard**:
长期维护、可审查的工程事实，保存在 `docs/standards/`。
_Avoid_: Convention document, wiki note

**Agent Skill**:
供 Agent 在特定阶段加载的可执行工作方法，保存在 `.agents/skills/`。
_Avoid_: Prompt, rule file

**OpenSpec Change**:
单次系统行为变更的提案、规格、设计、任务与验证记录。
_Avoid_: Feature folder, ticket

**Prototype Baseline**:
经确认后可复用的原型版本，保存在原型目录的 `initial/`。
_Avoid_: Final mockup, screenshot

**Prototype Exploration**:
从基准或参考稿复制出的独立设计尝试，不覆盖原稿。
_Avoid_: Draft, overwrite copy

**Preline Theme**:
通过语义 CSS 变量表达颜色、表面、边框和组件状态的统一视觉层。
_Avoid_: Color palette, CSS theme file

**Workbench**:
量化 AI 工作台的产品首页，连接行情、复盘、量化、任务和 AI 助手。
_Avoid_: Dashboard, homepage
