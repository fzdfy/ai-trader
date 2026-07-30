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
