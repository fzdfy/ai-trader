# Tasks

## 0. Visual Design Gate

- [x] 0.1 为快速行情详情创建独立的“未来一周路径预测”视觉探索，保存为
  `docs/design/prototypes/explorations/stock-five-day-forecast-v1.html`，并保留现有
  快速行情详情和 K 线基准原稿；验证探索稿存在、原始稿未修改，且覆盖历史/预测分界、
  80% 概率带、P50 中位路径、P20/P50/P80 三条样本路径、模型/基线标签和预测时间。
- [x] 0.2 使用真实浏览器分别截取 `model`、`baseline`、`quality=low`、`stale`、
  `unsupported`、`unavailable` 和 `error` 状态；覆盖桌面 `1440×900`、移动端
  `390×844`、浅色/深色、键盘焦点和 reduced motion，并把截图索引保存到
  `docs/design/prototypes/explorations/screenshots/stock-five-day-forecast-v1/`；
  验证每个状态和视口均有可打开截图，页面无裁切或横向溢出。
- [x] 0.3 按 `oil-ui` 和 `ui-design` 完成真实视觉评审，检查概率带与历史蜡烛的语义
  区分、三条路径可辨识度、低质量/陈旧/不可用表达、移动端信息层级和键盘/读屏说明；
  验证评审问题已记录，且不存在未经解释的 raw hex、不可读状态或与现有工作台视觉
  方向冲突。
- [ ] 0.4 将探索稿、截图索引和待确认问题提交用户；只有用户明确确认视觉方向后，才能
  在 `tasks.md` 创建技术设计评审、PIT 数据审计、模型/API/UI 实现任务；验证
  `design.md#Visual Design` 已链接确认后的探索稿和截图目录，并记录确认日期。

## Workflow follow-up

- 视觉确认后再根据完整设计生成按 TDD 拆分的实现任务。
- 实施完成后执行独立代码与风险评审，修复 findings 并重跑最新完整验证。
- 用户验收与归档确认必须分开。
