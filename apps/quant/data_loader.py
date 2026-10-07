import os
from typing import Any

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader")


def _get_conn():
    return psycopg2.connect(DATABASE_URL)


_ADJUST_VIEWS = {"hfq": "bar1d_hfq", "qfq": "bar1d_qfq"}
# 同口径的 as-of 表函数（PIT）：按 known_at <= p_as_of 选取历史快照，而非最新快照。
_ADJUST_AT_FUNCS = {"hfq": "bar1d_hfq_at", "qfq": "bar1d_qfq_at"}


def load_kline(
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
    adjust: str = "hfq",
    as_of: str | None = None,
) -> pd.DataFrame:
    """从复权日线视图加载数据，返回 AKQuant 兼容的 DataFrame。

    列: time, open, high, low, close, volume, amount, indicators

    复权口径（PIT 铁律）：默认 ``adjust="hfq"``（后复权）。后复权锚定上市首日，除权
    只在除权日之后引入新因子、不改写历史价位，历史序列不随未来事件变化，故回测与
    因子不存在前视偏差。``adjust="qfq"``（前复权）锚定最新交易日，历史段会被新分红
    反复重锚（同一历史日不同时刻读出不同价位），仅供展示，禁止用于回测。

    PIT（as-of）读取：``as_of`` 传时间戳字符串时，改走 ``bar1d_*_at(symbol, as_of)``
    表函数，按 ``known_at <= as_of`` 选取「站在该历史时刻」的复权因子快照；``None``
    时读视图（取每个 symbol 的最新 known_at 快照），保持既有行为。注意 ``adj_factor``
    是 append-only，当前仅有一个快照（2026-10-01），故 ``as_of`` 早于该时刻时无历史
    版本可选、等价于不复权——需待每日 adj-factor 同步累积出多个版本后 as-of 才有区分度。
    """
    view = _ADJUST_VIEWS.get(adjust)
    if view is None:
        raise ValueError(f"unknown adjust: {adjust!r} (expect 'hfq' or 'qfq')")
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if as_of:
                # 表函数内部已按 symbol 过滤，故不再加 symbol 条件
                source = f"{_ADJUST_AT_FUNCS[adjust]}(%s, %s::timestamp)"
                params: list[Any] = [symbol, as_of]
                conditions: list[str] = []
            else:
                source = view
                params = [symbol]
                conditions = ["symbol = %s"]

            if start_date:
                conditions.append("time >= %s")
                params.append(start_date)
            if end_date:
                conditions.append("time <= %s")
                params.append(end_date)
            where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

            query = (
                "SELECT time, open, high, low, close, volume, amount, indicators "
                f"FROM {source}{where} ORDER BY time ASC"
            )

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


def load_raw_close(
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.Series:
    """从原始价基表 ``bar1d_raw`` 加载区间内的原始收盘价序列（按日，升序）。

    仅供涨跌停判定使用：涨跌停价必须基于**原始价**前收计算，不能用后复权价近似
    （``hfq/raw`` 比例随复权因子漂移）。返回以自然日为索引的 ``pd.Series``，缺数据
    返回空 Series。
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            conditions = ["symbol = %s"]
            params: list[Any] = [symbol]
            if start_date:
                conditions.append("time >= %s")
                params.append(start_date)
            if end_date:
                conditions.append("time <= %s")
                params.append(end_date)
            where = " WHERE " + " AND ".join(conditions)
            cur.execute(
                f"SELECT time, close FROM bar1d_raw{where} ORDER BY time ASC",
                params,
            )
            rows = cur.fetchall()
        if not rows:
            return pd.Series(dtype="float64")
        index = pd.to_datetime([row[0] for row in rows])
        values = pd.to_numeric([row[1] for row in rows], errors="coerce")
        return pd.Series(values, index=index, dtype="float64")
    finally:
        conn.close()


def load_trade_day_index(
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, int]:
    """返回交易日历上「自然交易日」的序号映射：``YYYY-MM-DD`` -> 0 基序号。

    仅供策略做「按交易日计数」的持有期校正：停牌日无 K 线会被引擎跳过，若策略只
    数 bar 个数会把持有时间压短（停牌越久偏差越大）。序号在区间内自 0 递增，区间
    外/非交易日不在映射中。依赖 ``trading_calendar.is_trading_day``（缺行按非交易日）。
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            conditions = ["is_trading_day = true"]
            params: list[Any] = []
            if start_date:
                conditions.append("trade_date >= %s")
                params.append(start_date)
            if end_date:
                conditions.append("trade_date <= %s")
                params.append(end_date)
            where = " WHERE " + " AND ".join(conditions)
            cur.execute(
                f"SELECT trade_date FROM trading_calendar{where} ORDER BY trade_date ASC",
                params,
            )
            return {str(row[0]): i for i, row in enumerate(cur.fetchall())}
    finally:
        conn.close()


def load_suspension_days(
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[str]:
    """返回标的在区间内的「停牌交易日」列表（``YYYY-MM-DD``，升序）。

    判定口径：``trading_calendar`` 上 ``is_trading_day = true`` 的交易日中，``bar1d_raw``
    无该标的当日 K 线的日期即为停牌日（K 线源停牌日无行）。这是「停牌」在数据层的
    显式输出。停牌日无 bar，故引擎不会触发该标的 ``on_bar``、天然不会在停牌日成交；
    真正的可信度缺口只剩「涨跌停日能否成交」（缺口③）。
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            conditions = ["tc.is_trading_day = true"]
            params: list[Any] = []
            if start_date:
                conditions.append("tc.trade_date >= %s")
                params.append(start_date)
            if end_date:
                conditions.append("tc.trade_date <= %s")
                params.append(end_date)
            where = " WHERE " + " AND ".join(conditions)
            params.append(symbol)
            cur.execute(
                "SELECT tc.trade_date FROM trading_calendar tc"
                f"{where}"
                " AND NOT EXISTS (SELECT 1 FROM bar1d_raw b"
                " WHERE b.symbol = %s AND b.time::date = tc.trade_date)"
                " ORDER BY tc.trade_date ASC",
                params,
            )
            return [str(row[0]) for row in cur.fetchall()]
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
    as_of: str | None = None,
) -> dict[str, bool]:
    """计算大盘指数趋势：收盘价 >= MA(window) 视为看多。

    返回 { "YYYY-MM-DD": bool }，供策略按 bar 日期对齐判断；
    均线未形成的早期区间默认看多（不拦截）。

    ``as_of`` 透传给 ``load_kline`` 做 PIT 复权（指数无复权因子，实际等价于原始价），
    仅为与回测主序列保持同一复权基准，确保整条回测链的复权口径一致。
    """
    df = load_kline(index_symbol, start_date, end_date, as_of=as_of)
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
