/**
 * 因子衰退（term structure）公共工具。
 *
 * 「衰退」指因子预测能力随持有期延长的下滑曲线，由各持有期的 IC 序列估算「信号寿命」：
 * 半衰期与末期保留率。此处与图表组件解耦，供因子详情页与跨因子对比页共用。
 */

/** summarizeDecay 的输入点：只关心持有期与 IC 均值（正负号由因子「方向」字段表达） */
export interface DecayPointLike {
  horizon: number;
  icMean: number | null;
}

export interface DecaySummary {
  /** 半衰期：|IC| 降到初值一半时的持有期（日）；始终未衰减至一半时为 null */
  halfLife: number | null;
  /** 末期 IC 保留率：|IC(末期)| ÷ |IC(首期)| */
  retention: number | null;
  /** 是否至少有一个有效点 */
  hasData: boolean;
  /** 覆盖的最大持有期 */
  maxHorizon: number | null;
}

/** 由衰退曲线估算「信号寿命」：半衰期（相邻点线性插值）与末期保留率 */
export function summarizeDecay(points: DecayPointLike[]): DecaySummary {
  const series = points
    .filter(
      (p): p is DecayPointLike & { icMean: number } =>
        p.icMean != null && Number.isFinite(p.icMean),
    )
    .map((p) => ({ horizon: p.horizon, ic: Math.abs(p.icMean) }))
    .toSorted((a, b) => a.horizon - b.horizon);
  if (series.length === 0) {
    return { halfLife: null, retention: null, hasData: false, maxHorizon: null };
  }

  const first = series[0]!;
  const last = series.at(-1)!;
  const retention = first.ic > 0 ? last.ic / first.ic : null;
  if (first.ic <= 0) {
    return { halfLife: null, retention, hasData: true, maxHorizon: last.horizon };
  }

  const target = first.ic / 2;
  let halfLife: number | null = null;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (cur.ic <= target) {
      const span = prev.ic - cur.ic;
      const ratio = span === 0 ? 0 : (prev.ic - target) / span;
      halfLife = prev.horizon + ratio * (cur.horizon - prev.horizon);
      break;
    }
  }
  return { halfLife, retention, hasData: true, maxHorizon: last.horizon };
}

/** 半衰期展示：无数据「—」、始终未衰减至一半「> N 日」、否则取一位小数 */
export function formatHalfLife(summary: DecaySummary): string {
  if (!summary.hasData) return "—";
  if (summary.halfLife == null) {
    return summary.maxHorizon == null ? "—" : `> ${summary.maxHorizon} 日`;
  }
  return `约 ${Math.round(summary.halfLife * 10) / 10} 日`;
}
