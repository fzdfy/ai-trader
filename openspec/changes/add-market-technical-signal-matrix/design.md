# Design

## Context

See [proposal.md](./proposal.md) for motivation and the four delta specs for observable behavior. Current constraints:

- Quant 已有 Python 因子注册表和 OHLCV 计算能力，Server 已有行情中心、个股分析、资金、财务、估值和研报聚合。
- 个股技术快照目前由 TypeScript 计算；新增信号引擎若再计算同名指标，会产生不可接受的同名不同值。
- 伦敦金有日线但无可信成交量；黄金宏观数据未接入。
- 个股逐笔只有最近交易日的聚合分笔，`quote_snapshot` 尚无生产写入。
- 完整 L2 技术方案见 [2026-11-26-market-technical-signal-design.md](../../../docs/superpowers/specs/2026-11-26-market-technical-signal-design.md)。

## Goals / Non-Goals

**Goals:**

- 以版本化目录提供 140 个稳定信号和可编码的证据契约。
- Quant 负责 OHLCV、形态和可用微观原语；Server 负责对象适配、跨域高级模型、质量和快照。
- 行情中心只用摘要下钻，个股分析承载完整 44 项个股矩阵。
- 用单一 `unavailable / not-applicable` 契约表达真实数据缺口。

**Non-Goals:**

- 不新增宏观、CFTC、黄金 ETF、黄金期权或 Level 2 数据供应商。
- 不新增实时盘口写入器和全市场盘口轮询。
- 不生成未经验证的胜率、目标价或交易指令。
- 不改变现有行情、复权、PIT、回测和资金原始口径。

## Decisions

### 1. 共享信号目录

`packages/signal-catalog` 中的 JSON 是 140 个信号定义、参数和版本的事实源；TypeScript 与 Quant 加载同一文件。目录服务返回定义并在发布测试中校验数量、ID 唯一性和对象配额。

替代方案是各层自行维护代码注册表，但会让 Quant、Server 和 Web 的同名信号漂移。

### 2. Quant 与 Server 混合分层

Quant 接收标准 OHLCV 或微观事实批次，返回基础指标、形态候选和微结构原语；Server 读取对象数据、调用 Quant、应用资产级确认并组合高级模型。

替代方案 A 把全部逻辑放 Quant，会污染业务边界；方案 B 全部放 Server，会复制 Python 计算并阻碍回测复用。两种均未采用。

### 3. 技术快照迁移到单一来源

本变更将现有个股 `TechnicalSnapshot` 字段迁入 Quant 统一计算；Server 保持既有响应形状，TypeScript 不再维护共享 RSI、ATR、MA 公式。使用现有 fixture 和 API 契约测试保护迁移前后结果。

替代方案是短期双实现加 parity，但独立评审认为这会形成两条迁移路径，因此不采用。

### 4. 对象身份

- 大盘：`object_type=market`，技术基础/形态使用上证指数，市场宽度由 Server 提供。
- 板块：`object_type=sector`，`object_subtype` 固定为 `industry | concept`。
- 个股：`object_type=stock`，计算使用 hfq，展示遵循现有 qfq 语义。
- 黄金：`object_type=gold`，资产固定 `XAUUSD`，报价 USD/oz。

板块主键和 API 必须包含 subtype，不能只依赖 `BK` 代码。

### 5. 快照结构

- `technical_signal_snapshot`：对象、subtype、代码、as-of、目录版本和完整 JSON 结果。
- `technical_signal_trigger`：可触发的索引行，用于列表筛选和摘要。
- `technical_signal_validation`：独立验证证据，本次不生成未经验证的记录。

全部为新增表；`input_hash`、`definition_hash` 和双时间字段保证重试幂等与历史复现。

### 6. V1 数据能力

- 四对象 10 个基础信号和 12 个形态进入计算；黄金量能项为 `not-applicable`。
- 高级模型按设计中的 V1 Active Scope 区分真实计算、低置信和不可用。
- 微观结构 V1 启用 Amihud 和可从最近交易日聚合分笔得到的近似信号；不新增盘口写入器。
- 任何代理值必须返回 `proxy=true`、来源和 TTL，并在历史条件不足时拒绝生成。

### 7. 页面职责

- 总览将成长/红利低波、A 股宏观状态和高级模型合并为一个模块；成长/红利低波只作为风格轮动证据。
- 板块列表在既有排行表增加一列技术摘要，详情用一个分层诊断卡展示 32 项。
- 个股列表在既有行情表增加一列技术摘要，快速详情展示标签，个股分析用一个分层诊断卡展示 44 项。
- 每个诊断卡共享筛选器、表格和层签，不堆叠多个同构面板；共享组件统一状态、筛选、展开、键盘和响应式行为。
- 板块概览吸收阶段与排名变化；个股分析合并情景预测与风险参考区间，并只在异常时使用模块级状态徽标。

### 8. 验证与胜率分离

实时信号状态与 Signal Validation 分开。没有验证证据时展示“待验证”；验证表只接受统一 hfq、交易成本、非重叠样本和样本外结果。

## Data Flow

```text
PostgreSQL 日线/板块/资金/财务/估值
          ↓ 对象适配与质量门禁
        Server
          ↓ 标准化 OHLCV/微观事实
         Quant
          ↓ 基础原语/形态候选
        Server
          ↓ 资产确认/高级模型/质量
  signal snapshot + trigger index
          ↓
 行情中心摘要 / 个股分析完整矩阵
```

## Failure Modes

| 失败 | 行为 |
|---|---|
| Quant 批次失败 | 该批对象 `unavailable`，其他批次和页面模块继续 |
| 单个信号计算异常 | 单信号错误状态，不取消其他 139 项 |
| 目录版本不匹配 | 拒绝混用，返回目录版本错误 |
| 输入哈希冲突或重复任务 | 幂等返回既有快照 |
| 黄金量能缺失 | `not-applicable` |
| 历史不足 | `low-confidence/unavailable` 并保留样本数 |
| 代理数据不可回放 | 只允许当前详情展示，不生成历史胜率 |
| 页面部分请求失败 | 局部错误、独立重试，其他内容保留 |

## Compatibility

- 新增 API 和表，不删除既有路由。
- `/home/market/gold` 为新增深链接；旧行情、板块和个股链接保持可用。
- `technical` 响应字段保持原名称和类型，数值切换为 Quant 单一来源。
- 特性开关 `technicalSignalMatrix` 控制新页面能力；关闭时恢复现有页面，不删除快照。
- 不改变 `load_kline`、`bar1d_qfq/hfq`、PIT 和回测源。

## Migration Plan

1. 发布共享目录、契约测试和新增数据库表。
2. 发布 Quant 计算端点，并以现有技术 fixture 验证兼容字段。
3. 发布 Server 目录、快照、查询与聚合，Worker 先只写市场、板块和测试股票。
4. 切换个股分析 `technical` 到 Quant 单一来源，运行现有回归。
5. 启用每日全市场股票快照和列表摘要查询。
6. 通过特性开关逐个启用行情中心、板块详情、个股分析和黄金页。
7. 回滚时关闭特性开关并停止技术信号 Worker；新增表保留，既有业务不受影响。

## Visual Design

Visual design: required.

技术设计评审通过后，从现有行情中心和个股分析基准复制探索稿，不得覆盖历史原稿。目标路径：

- `docs/design/prototypes/explorations/live-market-signals-v1.html`
- `docs/design/prototypes/explorations/live-stock-analysis-signals-v1.html`
- `docs/design/prototypes/explorations/screenshots/live-latest-signal-integration-v1/`

覆盖行情总览、板块列表/详情、个股列表/快速详情、个股分析 44 项矩阵、黄金 32 项、加载/空/错误/部分成功/成功、1440×900 与 390×844、浅色与深色、键盘和 reduced motion。用户确认前，`tasks.md` 只能包含视觉设计门禁。

探索稿和截图证据：

- [线上行情中心快照](../../../docs/design/prototypes/explorations/live-market-signals-v1.html)
- [线上板块快照](../../../docs/design/prototypes/explorations/live-market-boards-signals-v1.html)
- [线上板块详情快照](../../../docs/design/prototypes/explorations/live-market-board-detail-signals-v1.html)
- [线上个股列表快照](../../../docs/design/prototypes/explorations/live-market-stocks-signals-v1.html)
- [线上快速行情快照](../../../docs/design/prototypes/explorations/live-market-stock-detail-signals-v1.html)
- [线上个股分析快照](../../../docs/design/prototypes/explorations/live-stock-analysis-signals-v1.html)
- [线上黄金详情快照](../../../docs/design/prototypes/explorations/live-market-gold-signals-v1.html)
- [截图索引](../../../docs/design/prototypes/explorations/screenshots/live-latest-signal-integration-v1/README.md)

状态：用户已于 2026-11-26 确认线上最新视觉、增量信号层级和合并后的模块结构。

## Risks / Trade-offs

- **140 项信息过载** → 摘要优先，详情分组、筛选和渐进展开。
- **全市场日算成本** → Quant 分批、Server 快照、列表只读摘要、详情按需。
- **技术快照迁移回归** → 使用现有 fixture、API 契约和风险区间回归；不以第二套 TS 公式兜底。
- **数据缺口被误读** → 强制区分状态，所有代理值标注来源和限制。
- **黄金宏观能力空壳** → 目录完整但明确显示数据要求，不用价格代理冒充宏观驱动。
- **历史规则漂移** → 快照绑定目录版本和哈希。

## Open Questions

无。

## Review Result

- 日期：2026-11-26
- 评审者：独立技术评审子代理
- 首轮结论：`changes-required`
- 阻断项：TypeScript 技术快照与 Quant 新指标形成双实现/单实现表述冲突。
- 处理：采用评审建议，设计明确将现有技术快照字段迁入 Quant，Server 仅保持 API 形状；TypeScript 不保留共享 RSI/ATR/MA 第二实现。
- 已闭环非阻断项：V1 可运行模型清单、微观数据范围、1.0.0 参数、板块 subtype、版本化 JSON 契约、多因子首版权重、代理 TTL。
