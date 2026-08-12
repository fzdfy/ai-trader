"""AKQuant 回测引擎封装。

将 AKQuant 原生 run_backtest 的返回值转换为与 AKQuant 报告一致的 JSON 格式，
前端可直接按 AKQuant Report 结构渲染。
"""

from typing import Any

import pandas as pd
from akquant import run_backtest, Strategy

from logger import get_logger

log = get_logger("engine")

INITIAL_CASH = 100_000


def run(
    df: pd.DataFrame,
    strategy: type[Strategy] | Strategy,
    initial_cash: float = INITIAL_CASH,
    commission_rate: float = 0.0003,
    stamp_tax_rate: float = 0.001,
    **kwargs: Any,
) -> dict[str, Any]:
    """执行回测，返回 AKQuant 原生风格的字典格式结果。

    返回结构：
      {
        "report": { symbol, strategy, startDate, endDate, durationDays, initialCapital, finalEquity },
        "metrics": { totalReturn, cagr, ... },
        "equity": [{ time, equity, drawdown }],
        "trades": [{ entryTime, exitTime, entryPrice, exitPrice, pnl, pnlPct }]
      }
    """
    result = run_backtest(
        data=df,
        strategy=strategy,
        initial_cash=initial_cash,
        commission_rate=commission_rate,
        stamp_tax_rate=stamp_tax_rate,
        t_plus_one=True,
        history_depth=100,
        **kwargs,
    )

    equity = _build_equity(result, initial_cash)

    return {
        "report": _build_report(df, initial_cash, equity),
        "metrics": _build_metrics(result),
        "equity": equity,
        "trades": _build_trades(result),
    }


# ==============================
# _build_report — 回测概览
# ==============================


def _build_report(df: pd.DataFrame, initial_cash: float, equity: list[dict[str, Any]]) -> dict[str, Any]:
    """构建 report 概览块，包含回测区间、时长、初始资金、最终权益。"""
    first = equity[0] if equity else None
    last = equity[-1] if equity else None

    start_date = first["time"] if first else (str(df.index[0])[:10] if len(df) > 0 else "")
    end_date = last["time"] if last else (str(df.index[-1])[:10] if len(df) > 0 else "")

    duration_days = 0
    if first and last:
        try:
            duration_days = (pd.Timestamp(end_date) - pd.Timestamp(start_date)).days
        except Exception:
            duration_days = len(equity)

    final_equity = last["equity"] if last else initial_cash

    return {
        "startDate": start_date,
        "endDate": end_date,
        "durationDays": duration_days,
        "initialCapital": round(float(initial_cash), 2),
        "finalEquity": round(float(final_equity), 2),
    }


# ==============================
# _build_metrics — 核心指标
# ==============================


def _build_metrics(result) -> dict[str, Any]:
    """从 AKQuant BacktestResult.metrics_df 提取所有核心指标。

    metrics_df 结构：
      - index: 指标名称字符串 (如 "sharpe_ratio", "total_return_pct")
      - columns: ["value"]
    """
    df = result.metrics_df

    def v(name: str) -> float:
        """从 metrics_df 中按 index 名称取值。"""
        try:
            val = df.loc[name, "value"]
            return round(float(val), 4)
        except (KeyError, TypeError, ValueError):
            return 0.0

    def v_opt(name: str) -> float | None:
        """取值，不存在时返回 None。"""
        try:
            return round(float(df.loc[name, "value"]), 4)
        except (KeyError, TypeError, ValueError):
            return None

    return {
        "totalReturn": v("total_return_pct"),
        "cagr": round(v("annualized_return") * 100, 2),
        "avgPnl": v("avg_return_pct"),
        "sharpeRatio": v("sharpe_ratio"),
        "sortinoRatio": v_opt("sortino_ratio"),
        "calmarRatio": v_opt("calmar_ratio"),
        "maxDrawdown": v("max_drawdown_pct"),
        "volatility": round(v("volatility") * 100, 2),
        "winRate": v("win_rate"),
        "profitFactor": v_opt("profit_factor"),
        "kelly": v_opt("kelly_criterion"),
        "totalTrades": int(v("closed_trade_count")),
    }


# ==============================
# _build_equity — 权益曲线
# ==============================


def _build_equity(result, initial_cash: float) -> list[dict[str, Any]]:
    """构建 equity 曲线数组，每点包含 time / equity / drawdown。

    直接使用 AKQuant 原生 equity_curve (pd.Series, DatetimeIndex)，
    比手动解析 positions_df 更准确可靠。
    """
    try:
        eq_curve = result.equity_curve  # pd.Series, index=DatetimeIndex, values=equity
        if eq_curve.empty:
            return _empty_equity(initial_cash)

        # 按日取最后一条
        daily = eq_curve.resample("D").last().dropna()
        if daily.empty:
            daily = eq_curve

        points: list[dict[str, Any]] = []
        peak = 0.0
        for ts, nav in daily.items():
            val = float(nav)
            if val > peak:
                peak = val
            dd = round(-((peak - val) / peak) * 100, 2) if peak > 0 else 0.0
            points.append({
                "time": str(ts.date()),
                "equity": round(val, 2),
                "drawdown": dd,
            })
        return points
    except Exception as e:
        log.error("构建权益曲线失败", exc_info=True)
        return _empty_equity(initial_cash)


def _empty_equity(initial_cash: float) -> list[dict[str, Any]]:
    return [{"time": "", "equity": round(float(initial_cash), 2), "drawdown": 0.0}]


# ==============================
# _build_trades — 交易明细
# ==============================


def _build_trades(result) -> list[dict[str, Any]]:
    """构建 trades 交易明细数组，直接使用 AKQuant 原生 trades_df。

    trades_df 列名：
      symbol, entry_time, exit_time, entry_price, exit_price,
      quantity, side, pnl, net_pnl, return_pct, commission, ...
    """
    try:
        trades_df = result.trades_df  # type: ignore[attr-defined]
        if trades_df is None or trades_df.empty:
            return []
        return [
            {
                "entryTime": str(t.get("entry_time", ""))[:10],
                "exitTime": str(t.get("exit_time", ""))[:10],
                "entryPrice": _safe_float(t.get("entry_price")),
                "exitPrice": _safe_float(t.get("exit_price")),
                "pnl": _safe_float(t.get("pnl")),
                "pnlPct": _safe_float(t.get("return_pct")),
            }
            for _, t in trades_df.iterrows()
        ]
    except Exception as e:
        log.error("构建交易明细失败", exc_info=True)
        return []


def _safe_float(val: Any) -> float:
    try:
        return round(float(val), 2)
    except Exception:
        return 0.0


# ==============================
# get_strategy_list
# ==============================


def get_strategy_list() -> list[dict[str, Any]]:
    from .strategies import STRATEGIES

    return [{"name": s["name"], "label": s["label"], "params": s["params"]} for s in STRATEGIES]
