/**
 * 因子迭代反馈构造器（路线 B：LLM 因子 Agent 闭环）。
 *
 * 定位：把 quant /factors/evaluate 返回的「确定性客观指标」翻译成两样东西——
 *   1) 给程序用的结构化摘要（summarizeFactorEvaluation / isFactorGoodEnough）：用于跨轮比较、提前终止；
 *   2) 给 LLM 用的自然语言反馈（renderFactorFeedback / renderInvalidFeedback）：把 IC/ICIR/分层/衰退
 *      等结果回灌给 factorGenerator，驱动下一轮表达式改进（RD-Agent 的「评价 → 反馈」环节）。
 *
 * 设计边界：本文件只做「指标 → 文本」的确定性翻译，不调用任何模型、不落库，
 * 也不重复因子生成白名单（白名单同源仍在 agent/mastra/agents/factor-generator.ts）。
 */
import type { FactorEvaluation } from "./quant";

/** 提前终止/优质判定阈值：|IC| 与 |ICIR| 同时达标即视为「可用」 */
export const FACTOR_GOOD_IC = 0.03;
export const FACTOR_GOOD_ICIR = 0.3;

/** 因子单轮检验的结构化摘要（供跨轮比较与展示） */
export interface FactorEvaluationSummary {
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  tStat: number | null;
  positiveRatio: number | null;
  longShortAnnRet: number | null;
  longShortCumRet: number;
  /** 分层单调性：层序与各层累计收益的 Spearman 相关（正=因子越大收益越高） */
  monotonicity: number | null;
  /** 衰退保留率：最长期持有期 |IC| / 最短持有期 |IC|（越小越短命） */
  retention: number | null;
  /** 计算保留率时采用的持有期（最长期） */
  retentionHorizon: number | null;
  sampleCount: number;
  symbols: number;
  /** 样本外占比（0~0.5）；null / 0 表示未做切分 */
  validRatio: number | null;
  /** 样本外起始交易日（YYYY-MM-DD）；未切分为 null */
  splitDate: string | null;
  /** 样本外 IC 均值（Pearson） */
  validIcMean: number | null;
  /** 样本外 RankIC 均值（Spearman 秩相关） */
  validRankIcMean: number | null;
  /** 样本外 ICIR */
  validIcir: number | null;
  /** 样本外分层多空年化收益 */
  validLongShortAnnRet: number | null;
  /** 样本外分层多空累计收益 */
  validLongShortCumRet: number | null;
  /** 样本外有效截面交易日数 */
  validSampleCount: number | null;
  /** 综合评分（越大越好）：以 |IC| 为主、|ICIR| 与保留率为辅，仅用于跨轮排序 */
  score: number;
}

/** 数字格式化：null / 非有限值统一显示为「—」 */
function num(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** 百分比格式化 */
function percent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** 秩相关（Spearman）：输入两组等长数值，返回 [-1, 1]；样本不足返回 null */
function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const ranks = (values: number[]): number[] => {
    const order = values
      .map((v, i) => ({ v, i }))
      .sort((x, y) => x.v - y.v)
      .map((x) => x.i);
    const out = new Array<number>(values.length);
    order.forEach((originalIndex, rank) => {
      out[originalIndex] = rank + 1;
    });
    return out;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const n = ra.length;
  const meanRank = (n + 1) / 2;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (ra[i] ?? 0) - meanRank;
    const db = (rb[i] ?? 0) - meanRank;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

/**
 * 汇总单轮检验结果：抽取用于比较与反馈的关键指标。
 * @param evaluation quant /factors/evaluate 的原始返回
 */
export function summarizeFactorEvaluation(evaluation: FactorEvaluation): FactorEvaluationSummary {
  const icMean = evaluation.ic.mean;
  const icir = evaluation.ic.icir;

  // 分层单调性：层序（1..N）与各层累计收益的 Spearman
  const ordered = [...evaluation.layers.summary].sort((a, b) => a.layer - b.layer);
  const monotonicity = spearman(
    ordered.map((s) => s.layer),
    ordered.map((s) => s.cumRet),
  );

  // 衰退保留率：以最短持有期（首个）的 |IC| 为基准，看最长期持有期的衰减程度
  const sortedDecay = [...evaluation.decay].sort((a, b) => a.horizon - b.horizon);
  const first = sortedDecay.find((p) => p.icMean != null && Math.abs(p.icMean) > 1e-6) ?? null;
  const last = [...sortedDecay].reverse().find((p) => p.icMean != null) ?? null;
  const retention =
    first && last && first.horizon !== last.horizon
      ? Math.abs(last.icMean!) / Math.abs(first.icMean!)
      : null;

  const icAbs = Math.abs(icMean ?? 0);
  const icirAbs = Math.abs(icir ?? 0);

  // 样本外(OOS)：validRatio>0 且样本充足时 quant 返回 valid 块，否则为 null（评分/展示回退全样本口径）
  const valid = evaluation.valid;
  const validIcMean = valid?.ic.mean ?? null;
  const validIcAbs = Math.abs(validIcMean ?? 0);
  const overfitGap = validIcMean === null ? 0 : Math.max(0, icAbs - validIcAbs);
  // 评分：|IC| 为主、|ICIR| 与保留率为辅；有样本外时样本外 |IC| 加分、样本内/外 IC 落差（过拟合间隙）扣分。
  // valid 为空时 OOS 两项均为 0，评分与旧口径完全一致（向后兼容）。
  const score = icAbs * 1000 + icirAbs * 10 + (retention ?? 0) + validIcAbs * 600 - overfitGap * 400;

  return {
    icMean: icMean ?? null,
    rankIcMean: evaluation.rankIc.mean ?? null,
    icir: icir ?? null,
    tStat: evaluation.ic.tStat ?? null,
    positiveRatio: evaluation.ic.positiveRatio ?? null,
    longShortAnnRet: evaluation.layers.longShort.annRet ?? null,
    longShortCumRet: evaluation.layers.longShort.cumRet,
    monotonicity,
    retention,
    retentionHorizon: last?.horizon ?? null,
    sampleCount: Math.round(evaluation.ic.count),
    symbols: Math.round(evaluation.universe.symbols),
    validRatio: evaluation.split?.validRatio ?? null,
    splitDate: evaluation.split?.splitDate ?? null,
    validIcMean,
    validRankIcMean: valid?.rankIc.mean ?? null,
    validIcir: valid?.ic.icir ?? null,
    validLongShortAnnRet: valid?.longShort.annRet ?? null,
    validLongShortCumRet: valid?.longShort.cumRet ?? null,
    validSampleCount: valid ? Math.round(valid.sampleCount) : null,
    score,
  };
}

/** 是否达到「可直接采用」的阈值（|IC| 与 |ICIR| 同时达标；有样本外时样本外也须达标） */
export function isFactorGoodEnough(summary: FactorEvaluationSummary): boolean {
  const icAbs = Math.abs(summary.icMean ?? 0);
  const icirAbs = Math.abs(summary.icir ?? 0);
  if (icAbs < FACTOR_GOOD_IC || icirAbs < FACTOR_GOOD_ICIR) return false;
  // 有样本外指标时，要求样本外同样达标，避免只在样本内「好看」的过拟合因子被提前采纳
  if (summary.validIcMean != null) {
    const validIcAbs = Math.abs(summary.validIcMean);
    const validIcirAbs = Math.abs(summary.validIcir ?? 0);
    return validIcAbs >= FACTOR_GOOD_IC && validIcirAbs >= FACTOR_GOOD_ICIR;
  }
  return true;
}

/** IC 强度的确定性诊断（按 |IC| 分档） */
function commentIc(icMean: number | null): string {
  if (icMean == null || !Number.isFinite(icMean)) return "IC 无法计算（样本不足或因子全为常量）";
  const abs = Math.abs(icMean);
  const direction = icMean >= 0 ? "正向（因子越大、未来收益越高）" : "反向（因子越大、未来收益越低）";
  const strength =
    abs >= 0.05
      ? "强"
      : abs >= 0.03
        ? "较强"
        : abs >= 0.02
          ? "中等"
          : abs >= 0.01
            ? "偏弱"
            : "接近噪声";
  return `${strength}（${direction}）`;
}

/** ICIR 稳定性的确定性诊断（按 |ICIR| 分档） */
function commentIcir(icir: number | null): string {
  if (icir == null || !Number.isFinite(icir)) return "ICIR 无法计算";
  const abs = Math.abs(icir);
  if (abs >= 0.5) return "很稳定";
  if (abs >= 0.3) return "较稳定";
  if (abs >= 0.15) return "稳定性一般";
  return "不稳定（IC 方向反复）";
}

/** 衰退保留率的确定性诊断 */
function commentRetention(retention: number | null, horizon: number | null): string {
  if (retention == null || horizon == null) return "无法判断（衰退样本不足）";
  if (retention >= 0.6) return `在 ${horizon} 日持有期仍保留多数预测力，信号耐用`;
  if (retention >= 0.3) return `在 ${horizon} 日持有期明显衰减，信号偏中短周期`;
  return `在 ${horizon} 日持有期几乎消失，属短线/短命信号`;
}

/**
 * 把单轮检验结果渲染成给 LLM 的自然语言反馈：客观指标 + 确定性诊断 + 改进目标 + 约束重申。
 *
 * @param evaluation quant /factors/evaluate 的原始返回
 * @param round 当前轮次（从 1 开始）
 * @returns 直接拼接到 factorGenerator 输入之后的反馈文本
 */
export function renderFactorFeedback(evaluation: FactorEvaluation, round: number): string {
  const summary = summarizeFactorEvaluation(evaluation);
  const u = evaluation.universe;

  const directionTarget =
    summary.icMean == null
      ? "先保证能算出有效的横截面 IC（检查是否产出常数或全 NaN）"
      : summary.icMean >= 0
        ? "保持正向预测方向，重点提升预测强度与稳定性"
        : "当前为反向信号，可考虑在表达式上取负（如 0 - <表达式>）使其转为正向";

  const stabilityTarget =
    (summary.icir ?? 0) >= 0 && Math.abs(summary.icir ?? 0) < FACTOR_GOOD_ICIR
      ? "IC 波动偏大，可加入平滑（Mean/Std 滚动）或截面处理（Rank/Standardize/Winsorize）以稳定信号"
      : "稳定性可接受，避免过度平滑导致信号钝化";

  const decayTarget =
    summary.retention != null && summary.retention < 0.4
      ? "信号衰减较快，尝试缩短滚动窗口或改用更贴近当期变化的量（如 Delta/Ref 短周期）"
      : "关注跨持有期的一致性，避免只为单一持有期过拟合";

  // 样本外稳健性诊断：有 OOS 指标时看内外落差，否则提示以样本内为准
  const oosLine =
    summary.validIcMean === null
      ? "- 样本外稳健性：本次未做样本切分（样本不足或未启用），请仅凭样本内指标谨慎判断"
      : `- 样本外稳健性（自 ${summary.splitDate ?? "—"} 起，共 ${summary.validSampleCount ?? 0} 日）：IC = ${num(summary.validIcMean)}（样本内 ${num(summary.icMean)}），RankIC = ${num(summary.validRankIcMean)}，多空年化 ${percent(summary.validLongShortAnnRet)}`;

  let overfitTarget = "关注样本内外稳定性，避免为样本内指标过拟合";
  if (summary.validIcMean != null) {
    overfitTarget =
      Math.abs(summary.validIcMean) < Math.abs(summary.icMean ?? 0) * 0.6
        ? "样本外 IC 明显低于样本内，存在过拟合迹象：请减少对特定历史区间的依赖（如去掉长周期 Ref / 极端值处理），优先保证跨区间方向一致"
        : "样本内外 IC 一致，稳健性可接受，避免为抬高样本内指标而堆叠算子";
  }

  return [
    `## 第 ${round} 轮检验反馈（客观指标，供你改进表达式）`,
    "",
    `检验口径：预测未来 ${evaluation.horizon} 日收益；样本 ${u.symbols} 只标的 / ${u.bars} 根日线（${u.startDate} ~ ${u.endDate}）`,
    "",
    "指标：",
    `- IC 均值 = ${num(summary.icMean)}（${commentIc(summary.icMean)}）`,
    `- RankIC 均值 = ${num(summary.rankIcMean)}，ICIR = ${num(summary.icir, 3)}（${commentIcir(summary.icir)}）`,
    `- t 值 = ${num(summary.tStat, 2)}，IC>0 占比 = ${percent(summary.positiveRatio)}`,
    `- 分层多空：年化 ${percent(summary.longShortAnnRet)}，累计 ${percent(summary.longShortCumRet, 2)}，分层单调性 = ${num(summary.monotonicity, 2)}`,
    `- 衰退保留率（${summary.retentionHorizon ?? "—"} 日 / 短持有期）= ${percent(summary.retention)}（${commentRetention(summary.retention, summary.retentionHorizon)}）`,
    oosLine,
    "",
    "改进目标（下一轮请针对性地修改表达式，而不是重写语义）：",
    `- 方向：${directionTarget}`,
    `- 稳定性：${stabilityTarget}`,
    `- 周期：${decayTarget}`,
    `- 过拟合：${overfitTarget}`,
    "",
    "约束重申：",
    "- 只允许使用白名单内的行情列（Close/Open/High/Low/Volume）、算子与运算符语法；",
    "- 只输出一条表达式本身，不要任何解释、注释或代码块；",
    "- 若确实无法在现有算子范围内改进，只输出：无法生成。",
    "",
    "请基于以上反馈输出改进后的新表达式。",
  ].join("\n");
}

/**
 * 生成/校验失败（语法或运行期）时给 LLM 的纠正反馈。
 *
 * @param expression 上一轮模型输出（或候选）表达式
 * @param reason 失败原因（静态白名单或 quant 运行校验给出）
 * @param round 当前轮次
 */
export function renderInvalidFeedback(expression: string, reason: string, round: number): string {
  return [
    `## 第 ${round} 轮未通过校验`,
    "",
    `你上一轮输出的表达式：${expression}`,
    `未通过原因：${reason}`,
    "",
    "请修正后重新输出一条合法表达式；只能使用白名单内的行情列、算子与运算符语法；",
    "只输出表达式本身；若无法修正，只输出：无法生成。",
  ].join("\n");
}
