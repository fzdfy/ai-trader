"""AKQuant 回测引擎封装。"""
from typing import Any

import pandas as pd
from akquant import run_backtest, Strategy


def run(
    df: pd.DataFrame,
    strategy: type[Strategy] | Strategy,
    initial_cash: float = 100_000,
    commission_rate: float = 0.0003,
    stamp_tax_rate: float = 0.001,
    **kwargs: Any,
) -> dict[str, Any]:
    """执行回测，返回字典格式结果。"""
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

    m = result.metrics_df
    d = m.to_dict()
    val_col = list(d.keys())[0] if d else "value"

    return {
        "metrics": {
            "totalReturn": _get(d, val_col, "total_return_pct"),
            "annualReturn": round(_get(d, val_col, "annualized_return") * 100, 2),
            "maxDrawdown": _get(d, val_col, "max_drawdown_pct"),
            "sharpeRatio": _get(d, val_col, "sharpe_ratio"),
            "winRate": _get(d, val_col, "win_rate"),
            "totalTrades": int(_get(d, val_col, "closed_trade_count")),
            "avgPnlPct": _get(d, val_col, "avg_return_pct"),
        },
        "equity": _build_equity(result),
        "trades": _build_trades(result),
    }


def _get(d: dict, col: str, key: str) -> float:
    try:
        return round(float(d.get(col, {}).get(key, 0)), 2)
    except Exception:
        return 0


def _build_equity(result) -> list[dict[str, Any]]:
    try:
        eq = result.positions_df
        if eq is None or eq.empty:
            return []
        daily = eq.groupby(eq["date"].dt.date).last().reset_index()
        return [
            {"time": str(row["date"]), "value": round(float(row["equity"]), 2)}
            for _, row in daily.iterrows()
        ]
    except Exception:
        return []


def _build_trades(result) -> list[dict[str, Any]]:
    try:
        trades_df = result.trades_df
        if trades_df is None or trades_df.empty:
            return []
        return [
            {
                "entryTime": str(t.get("entry_time", ""))[:10],
                "exitTime": str(t.get("exit_time", ""))[:10],
                "entryPrice": round(float(t.get("entry_price", 0)), 2),
                "exitPrice": round(float(t.get("exit_price", 0)), 2),
                "pnlPct": round(float(t.get("return_pct", 0)), 2),
            }
            for _, t in trades_df.iterrows()
        ]
    except Exception:
        return []


def get_strategy_list() -> list[dict[str, Any]]:
    from .strategies import STRATEGIES
    return [
        {"name": s["name"], "label": s["label"], "params": s["params"]}
        for s in STRATEGIES
    ]
