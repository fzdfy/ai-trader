# AI Trader 业务与设计术语

项目内共享的业务与设计语言。此处只定义项目特有概念，不收录通用编程术语。

架构、平台和实现细节见 [technical-glossary.md](./technical-glossary.md)；返回 [docs 导航](./README.md)。

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

**PRD-lite**:
写在变更 proposal 中的精简产品需求，明确目标用户、场景、成功指标、非目标和验收标准。
_Avoid_: Technical design, Implementation plan

**Product Requirements Document**:
面向跨团队或多阶段产品需求的完整需求文档，是目标、范围、用户价值和验收口径的产品事实源。
_Avoid_: PRD-lite, Technical design

**Technical Design Review**:
对技术方案的接口、数据、安全、性能、可测试性、回滚和替代方案进行批准或退回的评审门禁。
_Avoid_: Visual review, Code review

**Test Plan**:
编码前定义的测试范围、失败测试、验证命令和预期结果。
_Avoid_: Test report, Manual checklist

**Test Report**:
实施完成后记录通过、失败、跳过、未覆盖项和环境阻塞的验证证据。
_Avoid_: Test plan, Completion claim

**Prototype Baseline**:
经确认后可复用的原型版本，保存在原型目录的 `initial/`。
_Avoid_: Final mockup, screenshot

**Prototype Exploration**:
从基准或参考稿复制出的独立设计尝试，不覆盖原稿。
_Avoid_: Draft, overwrite copy

**Preline Theme**:
通过语义 CSS 变量表达颜色、表面、边框和组件状态的统一视觉层。
_Avoid_: Color palette, CSS theme file

**Oil UI**:
项目统一使用的 UI/UX 设计方法与视觉评审流程，负责确定视觉方向、检查设计冲突并依据真实浏览器截图打磨界面。
_Avoid_: generic UI prompt

**Super Administrator**:
拥有数据基础设施查看和受控同步操作权限的最高应用角色；普通用户不具备数据管理权限。
_Avoid_: Data Owner, System User

**Data Management**:
工作台内的超级管理员区域，统一组织数据源、数据表、数据同步、数据质量和操作审计。
_Avoid_: Data Admin App, Sync Menu

**Data Source Registry**:
以代码和环境变量维护的 Provider、能力、接口、限流和降级配置，是数据源配置的事实源。
_Avoid_: Editable Provider Table, Discovery Cache

**Data Quality**:
数据完整性、新鲜度、覆盖率、缺口和同步失败状态的集合，用于判断数据是否可信。
_Avoid_: Sync Status, Market Sentiment

**Data Governance**:
围绕数据责任、关键等级、契约、质量、血缘、安全和生命周期的持续治理机制。
_Avoid_: Data Management, Data Cleanup

**Data Domain**:
由共同业务语义和责任边界组织的一组数据资产，例如参考数据、市场原始数据或研究派生数据。
_Avoid_: Table Group, Database Schema

**Data Owner**:
对某个数据域的最终可信度和使用边界负责的逻辑角色。
_Avoid_: Super Administrator, Application Owner

**Data Steward**:
维护数据定义、契约、质量规则和变更影响的逻辑角色。
_Avoid_: Data Operator, Developer

**Data Operator**:
执行同步、重试、事故处置等运行操作的逻辑角色。
_Avoid_: Data Owner, Data Steward

**Data Tier**:
表达数据资产故障对业务影响程度的分级；Tier 0 是不可信时阻断研究运行的关键数据。
_Avoid_: Priority, Importance

**Data Contract**:
数据资产对来源、粒度、主键、时间口径、字段、质量、SLA 和消费边界的稳定约定。
_Avoid_: Schema, Description

**Data Quality Rule**:
对完整性、唯一性、有效性、一致性、新鲜度、覆盖率或时点正确性的可执行检查。
_Avoid_: Quality Dashboard, Manual Check

**Data Quality Result**:
一次数据质量规则执行产生的通过、失败、指标值和上下文证据。
_Avoid_: Data Quality, Job Status

**Data Incident**:
数据不可用、失真、断档、口径变化或质量门禁失败所形成的受追踪事件。
_Avoid_: Application Error, Work Task

**Data Lineage**:
数据从来源经过同步和派生过程流向表、字段及消费方的可追溯关系。
_Avoid_: Source List, Sync Dependency

**Source Standard**:
规定外部数据入口、字段、风险控制和降级规则的版本文档，例如 `a-stock-data`。
_Avoid_: Runtime Provider, API Client

**Source Standard Version**:
被仓库固定并审计的外部来源标准版本、校验标识和兼容范围。
_Avoid_: Latest Skill, Floating Version

**Source Standard Watch**:
由系统定时检查来源标准新版本并生成人工审阅任务的治理机制。
_Avoid_: Workflow, Data Sync Job

**Administrative Action Audit**:
对超级管理员触发的同步、重试等受控操作记录操作者、范围、参数、任务和结果。
_Avoid_: Application Log, Job Run

**Workbench**:
登录后的量化 AI 工作台外壳，承载侧栏、页面级导航、业务页面和助手入口。
_Avoid_: Dashboard, homepage

**Dashboard**:
工作台默认页面 `/home`，用户界面名称为“每日看板”，集中展示数据可信度、市场变化、今日工作流和研究动作。
_Avoid_: Workbench, homepage

**Data Freshness**:
某个数据域最近一次可信快照的日期与同步状态；不得用当前日历日期替代实际行情日期。
_Avoid_: 今日数据, 实时行情

**Market Temperature**:
由涨停数量、最高连板、封单和换手等现有涨停池指标表达的市场投机强弱，不代表指数涨跌预测。
_Avoid_: 市场情绪结论, 买卖信号

**Market Mainline**:
当前资金净流入、板块涨幅和代表个股共同指向的交易方向。
_Avoid_: 热门推荐, 必涨方向

**Stock Analysis Workbench**:
面向单只股票的研究页面，把行情、技术、研报、机构预测、财务、资金、新闻公告和风险证据组织为可追溯的分析链路。
_Avoid_: 个股详情, 买卖建议页

**Research Report**:
券商或研究机构发布的个股或行业研究报告，具有机构、分析师、评级、发布日期和原文来源。
_Avoid_: 新闻, 快讯, AI 观点

**Stock News**:
通过明确标的关系关联到至少一只股票的新闻文章；未建立股票关联的全市场快讯不属于个股新闻。
_Avoid_: 全市场快讯, 关键词命中

**Company Announcement**:
上市公司依法披露的公告，具有标的、公告类型、发布时间、来源标识和原文或 PDF 地址。
_Avoid_: 新闻, 研报

**Forecast Scenario**:
在明确时间窗口、历史样本和模型版本下给出的概率化价格情景，不是确定性目标价。
_Avoid_: 股价保证, 单一预测价

**Risk Reference Range**:
由技术支撑、历史估值分位和历史情景分布组合得到的风险位置区间，不承诺本金安全。
_Avoid_: 安全价格, 保本价格

**Research Report Chunk**:
从研报原文按章节或页拆分出的可引用文本块，用于全文检索和语义检索。
_Avoid_: 新闻片段, 模型摘要

**Workbench Sidebar**:
承载品牌、业务导航、数据状态和账户入口的常驻侧栏。
_Avoid_: 顶部导航, 菜单栏

**Page Header**:
页面内容区内的标题和主要操作区域，不属于应用外壳。
_Avoid_: 全局顶栏, 工作区顶栏

**Page Navigation**:
主内容区顶部持续显示可点击面包屑、数据状态和搜索入口的页面级导航条，不替代工作台侧栏或 Page Header。
_Avoid_: 同级标签页, 全局品牌顶栏

**Page Back Target**:
构造子页面面包屑父级时使用的确定性上级页面，不作为独立返回按钮。
_Avoid_: 浏览器上一页, 默认工作台

**Assistant FAB**:
打开 AI 助手的右下角悬浮按钮；没有真实未读状态时不显示通知点。
_Avoid_: 问股菜单, 顶部入口

**Assistant Drawer**:
覆盖在当前页面右侧、带当前页面上下文条并可收起返回原页面的 AI 助手会话区域。
_Avoid_: 助手页面, 新标签页

**Assistant Workspace**:
提供完整会话历史和管理能力的独立 AI 会话页面。
_Avoid_: 助手抽屉, 悬浮助手

**Workflow**:
可复用的预设或自定义流程，定义触发器以及股票池、选股、回测、复盘或 AI 因子迭代步骤。
_Avoid_: Work Task, Workflow Run, 今日工作流

**Preset Workflow**:
由系统提供的可复用 Workflow 模板，用户可直接运行或复制后定制。
_Avoid_: 系统任务, 固定任务

**Custom Workflow**:
用户创建并维护的 Workflow，可自由组合受支持的触发器和动作节点。
_Avoid_: Work Task, 每日任务

**Work Task**:
用户在某个交易日需要完成的人工作业或待办事项，不是自动执行的 Workflow。
_Avoid_: Workflow, 自动任务

**Workflow Version**:
一次发布生成的不可变工作流图快照；修改草稿不会改变当前版本。
_Avoid_: 草稿, 当前工作流

**Workflow Trigger**:
启动 Workflow Run 的事件，只能是手动、交易日定时或指定同步模块成功完成。
_Avoid_: 条件节点, 任意事件

**Workflow Run**:
某个 Workflow Version 的一次执行记录，包含触发来源、整体状态、当前步骤和耗时。
_Avoid_: Workflow, 工作流配置

**Node Run**:
Workflow Run 中单个节点的执行记录，保存状态、摘要、业务引用、错误和耗时。
_Avoid_: 节点配置, Workflow Run

**Daily Review**:
研究成果复盘的统一入口，界面名称为“每日复盘”，默认展示最近交易日复盘，并通过页面按钮进入历史归档。
_Avoid_: Review Attribution, Review Center, 今日复盘菜单, 历史复盘菜单

**Development Placeholder**:
确认导航中尚无业务实现的页面，使用真实路由展示标题、“正在开发中”和说明，不填充伪造业务数据。
_Avoid_: Fake dashboard, empty route

**System Navigation**:
固定在工作台侧栏底部、以图标按钮形式提供同步中心、数据中心和主题设置的系统入口。
_Avoid_: 系统弹层, 底部齿轮
