# 原地分层技术判断整合稿

## 方案范围

本稿在四个既有页面副本的原有信号区内部增量加入判断，不新建独立页面，也不把判断拆成单独模块：

- 对象总判断位于原信号面板头部之后。
- 基础信号、K 线形态、高级模型判断位于各自原层级内容顶部。
- 个股微观结构判断位于微观结构层内，并明确只调整置信度，不覆盖三个主层结论。
- A 股宏观判断仍保留“行业广度”和“成长 / 防守”作为市场背景证据，不与任一单层方向投票混写。

## 探索稿

- [行情总览 + 原位置分层判断](../../live-market-signals-judgments-v1.html)
- [板块详情 + 原位置分层判断](../../live-market-board-detail-signals-judgments-v1.html)
- [个股分析 + 原位置分层判断](../../live-stock-analysis-signals-judgments-v1.html)
- [黄金详情 + 原位置分层判断](../../live-market-gold-signals-judgments-v1.html)

## 截图

浅色与深色均覆盖 `1440×900`、`390×844`：

- `light/market/`
- `light/board-detail/`
- `light/analysis/`
- `light/gold/`
- `light/market-partial/`
- `dark/market/`
- `dark/board-detail/`
- `dark/analysis/`
- `dark/gold/`
- `interactions/analysis-pattern/`：从对象总判断切换到 K 线形态层后的原地判断与 12 项计数。

## 判断规则

- 每个对象先由基础信号、K 线形态和高级模型三个主层形成对象总判断。
- 每一层独立输出判断、核心依据和方向计数；全部指标仍保留在对应层内。
- `unavailable` 与 `not-applicable` 不参与方向投票。
- `low-confidence` 作为证据质量展示，不驱动方向得分。
- 缺失数据不补零，也不转换成中性结论。
- 个股微观结构只调整置信度，不能覆盖三个主层共识。
- 该判断是确定性服务端聚合能力，不使用 Agent 生成方向。

## 检查结果

- 四个页面在浅色、深色、桌面和移动端均无控制台错误、图片加载失败或页面级横向溢出。
- 新增总判断、层级判断和计数区未触发小字、对比度或行高提示。
- 既有线上页面仍保留少量 9–10px 辅助文字、嵌套框和局部深色对比度提示；这些属于原页面基线，本稿未重写无关区域。
