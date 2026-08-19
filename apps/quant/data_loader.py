import os
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader")


def _get_conn():
    return psycopg2.connect(DATABASE_URL)


def load_kline(symbol: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
    """从 bar1d_adj 表加载日线数据，返回 AKQuant 兼容的 DataFrame。

    列: time, open, high, low, close, volume, amount, indicators
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT time, open, high, low, close, volume, amount, indicators
                FROM bar1d_adj
                WHERE symbol = %s
            """
            params = [symbol]
            if start_date:
                query += " AND time >= %s"
                params.append(start_date)
            if end_date:
                query += " AND time <= %s"
                params.append(end_date)
            query += " ORDER BY time ASC"

            cur.execute(query, params)
            rows = cur.fetchall()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        df["time"] = pd.to_datetime(df["time"])
        df.set_index("time", inplace=True)
        # 转换 numeric 字符串为 float
        for col in ["open", "high", "low", "close", "volume", "amount"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    finally:
        conn.close()


def load_watchlist_symbols() -> list[str]:
    """获取所有自选标的 symbol 列表。"""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT symbol FROM watchlist")
            return [row[0] for row in cur.fetchall()]
    finally:
        conn.close()


def load_instrument(symbol: str) -> dict | None:
    """查询 instrument 表返回标的字典（symbol/name/status），不存在返回 None。"""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT symbol, name, status FROM instrument WHERE symbol = %s",
                (symbol,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def is_st_symbol(symbol: str) -> bool:
    """根据 instrument.name 当前名称判断标的是否为 ST/*ST。

    说明：历史 ST 状态不落库，只能用当前名称近似（可能随时间漂移），
    是低成本近似，无法还原历史精确 ST 状态。
    """
    row = load_instrument(symbol)
    if not row or not row.get("name"):
        return False
    return "ST" in str(row["name"]).upper()


def compute_market_trend(
    index_symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
    ma_window: int = 20,
) -> dict[str, bool]:
    """计算大盘指数趋势：收盘价 >= MA(window) 视为看多。

    返回 { "YYYY-MM-DD": bool }，供策略按 bar 日期对齐判断；
    均线未形成的早期区间默认看多（不拦截）。
    """
    df = load_kline(index_symbol, start_date, end_date)
    if df.empty:
        return {}
    df = df.copy()
    df["ma"] = df["close"].rolling(ma_window).mean()
    trend: dict[str, bool] = {}
    for ts, row in df.iterrows():
        ma = row["ma"]
        bullish = True if pd.isna(ma) else bool(float(row["close"]) >= float(ma))
        trend[str(ts.date())] = bullish
    return trend
