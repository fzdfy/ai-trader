"""选股模块：根据策略（因子组合）对股票池打分并排名。

选股 = 对股票池中每只股票，用策略配置的因子计算综合得分，按得分降序返回 Top N。

因子得分约定（与 factors.registry 一致）：
  - 每个因子的 compute 返回归一化得分 [0, 1]：0.5 中性、>0.5 看多、<0.5 看空
  - weight 为 0-100 的相对重要度，value 为每因子信号阈值 0-100（voting 模式使用）
  - direction 为方向覆盖：-1 时反转该因子得分（1 - score）
  - combine 支持：weighted_sum / equal_weight / voting / rank / and / or

用法：
    from screener import screen
    result = screen([{"name": "ma_trend_20", "weight": 40, "value": 60}], top_n=20)
"""

import io
import os
import time
from datetime import timedelta
from typing import Any

import numpy as np
import polars as pl
import psycopg2
from psycopg2.extras import RealDictCursor

import factor_ext  # noqa: F401  运行期向 akquant 注册扩展算子，必须先于任何 parse/plan
from akquant.factor import ExpressionParser
from factor_code import latest_values, run_factor_code
from data.base import CAPABILITY_QUOTE
from data.registry import call_with_fallback
from factors import FACTOR_REGISTRY
from factors.combine import apply_direction, combine_scores, normalize_combine
from logger import get_logger

log = get_logger("screener")

# 自定义因子表达式解析器（与 AKQuant FactorEngine 一致，仅对内存 DataFrame 求值）
_CUSTOM_PARSER = ExpressionParser()

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# 因子计算所需历史窗口（覆盖最长因子周期 60，如 ma_trend_60 / macd 慢线 26+9）
HISTORY_COUNT = 61

# 自定义因子（AKQuant 表达式）历史窗口：需覆盖最长窗口算子（如 250 日均线年线）。
# Ts_Mean(Close,250) 至少需要 250 根，叠加 Delay(...,1) 后再比较需 251 根。
CUSTOM_HISTORY_COUNT = 251

# 排除项（excludes）取值：与前端多选值一一对应，默认全部启用。
EXCLUDE_SMALL_CAP = "smallCap"  # 排除总市值 < 100 亿
EXCLUDE_LOSS = "loss"           # 排除市盈亏损（PE < 0）
EXCLUDE_ST = "st"              # 排除 ST / *ST
EXCLUDE_STAR = "star"          # 排除科创板（688 / 689）
EXCLUDE_CHINEXT = "chinext"    # 排除创业板（300 / 301）

# 「排除市值小于 100 亿」阈值（总市值，单位：亿元）
MIN_MARKET_CAP_YI = 100.0

# 腾讯行情单请求代码上限：>500 触发 HTTP 414（Request-URI Too Large）
QUOTE_BATCH_SIZE = 500


def _is_star_board(symbol: str) -> bool:
    """科创板：688 / 689 开头的上交所股票。"""
    return symbol.startswith(("688", "689"))


def _is_chinext(symbol: str) -> bool:
    """创业板：300 / 301 开头的深交所股票。"""
    return symbol.startswith(("300", "301"))


def _fetch_quotes(symbols: list[str]) -> dict[str, Any]:
    """分批取实时行情（腾讯单请求上限 500 只），单个批次失败则跳过、不阻断选股。"""
    quotes: dict[str, Any] = {}
    for i in range(0, len(symbols), QUOTE_BATCH_SIZE):
        batch = symbols[i : i + QUOTE_BATCH_SIZE]
        try:
            quotes.update(call_with_fallback(CAPABILITY_QUOTE, "quote", batch))
        except Exception as exc:  # noqa: BLE001 — 行情取数失败不应中断选股
            log.warning("排除过滤行情取数失败", count=len(batch), error=str(exc))
    return quotes


def _apply_excludes(
    universe: list[dict[str, Any]], excludes: list[str] | None
) -> list[dict[str, Any]]:
    """按排除条件过滤股票池。

    ST / 科创板 / 创业板 由名称与代码前缀本地判定（零网络成本）；「市值 < 100 亿」
    与「市盈亏损」依赖腾讯批量行情（总市值 / PE）判定。行情缺失的标的无法判定，
    保守保留（不排除），避免误杀。
    """
    if not excludes:
        return universe
    wanted = set(excludes)
    need_quote = bool(wanted & {EXCLUDE_SMALL_CAP, EXCLUDE_LOSS})

    quotes: dict[str, Any] = {}
    if need_quote:
        symbols = [u["symbol"] for u in universe]
        log.info("排除过滤：批量取行情", count=len(symbols))
        quotes = _fetch_quotes(symbols)

    keep: list[dict[str, Any]] = []
    for u in universe:
        symbol = u["symbol"]
        name = (u["name"] or "").upper()

        if EXCLUDE_ST in wanted and "ST" in name:
            continue
        if EXCLUDE_STAR in wanted and _is_star_board(symbol):
            continue
        if EXCLUDE_CHINEXT in wanted and _is_chinext(symbol):
            continue

        if need_quote:
            q = quotes.get(symbol)
            if q is not None:
                if EXCLUDE_SMALL_CAP in wanted:
                    mcap = (q.extra or {}).get("mcap_yi") or 0.0
                    if 0 < mcap < MIN_MARKET_CAP_YI:
                        continue
                if EXCLUDE_LOSS in wanted and q.pe is not None and q.pe < 0:
                    continue

        keep.append(u)
    return keep


def _get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL)


def _get_universe(conn: psycopg2.extensions.connection) -> list[dict[str, Any]]:
    """获取有日线数据的股票池（symbol + 中文名）。

    直接读 instrument（5564 行，主键索引）而非对 bar1d_qfq（1600 万行）做
    DISTINCT 全表扫描——后者单次约 35s，会让选股请求超出网关超时。没有日线的
    标的会在后续按历史长度被跳过，因此结果集不变。
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT symbol, COALESCE(name, symbol) AS name
            FROM instrument
            ORDER BY symbol
            """
        )
        return cur.fetchall()


def _load_universe_bars(
    conn: psycopg2.extensions.connection,
    universe: list[dict[str, Any]],
    limit: int = HISTORY_COUNT,
) -> dict[str, dict[str, np.ndarray]]:
    """一次性加载股票池全部标的最近 limit 根日线，按标的切分为 numpy 数组。

    替代原先逐标的发起 SQL 的写法（N+1：全池 5000+ 次往返，且每行付出
    numeric→Decimal 与 RealDictCursor 字典构造开销）。性能要点与
    _load_universe_frame 一致：
      - LATERAL + (symbol, time) 索引逐标的取最近 N 根，避免全表 ROW_NUMBER 排序；
      - SQL 侧 ::float8 转换 + 普通游标（非 RealDictCursor）；
      - 排序改由 Polars 完成（比 SQL 排序更快）。

    Returns:
        {symbol: {"open"/"high"/"low"/"close"/"volume"/"amount": np.ndarray}}，
        仅包含日线数量 >= limit 的标的，数组按时间升序。
    """
    symbols = [u["symbol"] for u in universe]
    if not symbols:
        return {}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.symbol, b.time,
                   b.open::float8, b.high::float8, b.low::float8, b.close::float8,
                   b.volume::float8, b.amount::float8, b.close_raw::float8
            FROM unnest(%s::text[]) AS u(symbol)
            CROSS JOIN LATERAL (
                SELECT time, open, high, low, close, volume, amount, close_raw
                FROM bar1d_qfq
                WHERE symbol = u.symbol
                ORDER BY time DESC
                LIMIT %s
            ) AS b
            """,
            (symbols, limit),
        )
        rows = cur.fetchall()
    if not rows:
        return {}

    frame = pl.DataFrame(
        {
            "symbol": [r[0] for r in rows],
            "date": [r[1] for r in rows],
            "open": [r[2] for r in rows],
            "high": [r[3] for r in rows],
            "low": [r[4] for r in rows],
            "close": [r[5] for r in rows],
            "volume": [r[6] for r in rows],
            "amount": [r[7] for r in rows],
            "close_raw": [r[8] for r in rows],
        }
    ).sort(["symbol", "date"])

    syms = frame["symbol"].to_numpy()
    close_arr = frame["close"].to_numpy()
    close_raw_arr = frame["close_raw"].to_numpy()
    volume_arr = frame["volume"].to_numpy()
    amount_arr = frame["amount"].cast(pl.Float64).fill_null(float("nan")).to_numpy()
    # 腾讯日 K 源不返回成交额：沪深标的落库 amount 为 NULL，用「原始收盘价 × 成交量」估算补齐。
    # 必须用 close_raw（原始价）而非 close（前复权价）——成交额是当日真实换手金额，
    # 用复权价在除权日会失真。成交量单位按市场区分：沪深为「手」（×100 换股），
    # 北交所历史数据为「股」且自带成交额（故此估算路径实际只服务沪深标的）。
    amount_scale = np.where(
        np.array([str(s).endswith(".BJ") for s in frame["symbol"]]), 1.0, 100.0
    )
    derived = close_raw_arr * volume_arr * amount_scale
    derived = np.where((close_raw_arr > 0) & (volume_arr > 0), derived, float("nan"))
    amount_arr = np.where(np.isfinite(amount_arr), amount_arr, derived)

    arrays = {
        "open": frame["open"].to_numpy(),
        "high": frame["high"].to_numpy(),
        "low": frame["low"].to_numpy(),
        "close": close_arr,
        "volume": volume_arr,
        # amount 优先取实际值，缺失时用估算值；仍为空（停牌）则保持 NaN，下游转 None
        "amount": amount_arr,
    }

    # 已按 symbol 排序，相邻股票代码不相等处即为分组边界
    borders = np.flatnonzero(syms[1:] != syms[:-1]) + 1
    starts = np.concatenate(([0], borders))
    ends = np.concatenate((borders, [len(syms)]))

    result: dict[str, dict[str, np.ndarray]] = {}
    for start, end in zip(starts, ends):
        if end - start < limit:
            continue
        result[str(syms[start])] = {name: arr[start:end] for name, arr in arrays.items()}
    return result


def _load_universe_frame(
    conn: psycopg2.extensions.connection,
    universe: list[dict[str, Any]],
    limit: int = CUSTOM_HISTORY_COUNT,
    adjust: str = "qfq",
    as_of: str | None = None,
) -> pl.DataFrame:
    """一次性加载股票池全部标的最近 limit 根日线，构造 Polars DataFrame。

    列：symbol / date / open / high / low / close / volume / amount / vwap，按 symbol、date 升序。
    供自定义因子表达式（AKQuant）在横截面上求值使用。窗口取较长历史以满足
    250 日均线（年线）等长周期算子的最小样本要求。
    必须覆盖白名单里的全部行情列（含 open）：AKQuant 把列名转小写后按 pl.col 取用，
    少一列就会让引用该列的合法表达式在执行阶段抛 ColumnNotFoundError。
    amount 亦为受限 Python 代码因子（factor_code）数据契约要求的列。

    vwap 语义（成交量加权均价）：北交所取真实成交额/成交量（原始价口径），沪深无
    成交额则该列 NULL，改用典型价 (high+low+close)/3 代理。此处先按「复权前」原始价
    计算，再与价格列一起做同一仿射复权变换——仿射变换对典型价的线性组合可分配，
    故沪深分支等价于对复权后价求典型价、北交所分支等价于对真实成交价复权，二者口径一致。

    amount 语义：成交额（元），**不做复权**（复权只作用于价格）。优先取 bar1d_raw.amount，
    沪深标的该列为 NULL（腾讯日 K 源不返回成交额）时用「原始收盘价 × 成交量 × 100」
    估算（volume 单位为「手」，×100 换股；北交所 volume 为「股」，系数 1.0），
    停牌无成交则保持 null。

    Args:
        limit: 每标的取最近 N 根日线。
        adjust: 复权口径——qfq（前复权，选股打分展示用）/ hfq（后复权，因子检验等
            研究场景用；避免前复权因子含未来信息造成前视偏差）。非法值回退 qfq。
        as_of: PIT（as-of）时间戳。传值时仅采用 ``known_at <= as_of`` 的因子快照
            （等价于「站在该历史时刻」），用于可复现的历史口径回放；``None`` 时取
            每个标的的最新 known_at 快照，保持既有行为。注意 ``adj_factor`` 目前
            仅有一个快照（2026-10-01），as_of 早于该时刻时因子缺席、等价于不复权。

    性能要点：
      - 直接读分区基表 bar1d_raw：symbol=ANY(...) + time>=下界 触发分区裁剪与
        (symbol, time) 复合索引，比逐标的 LATERAL / 复权视图快一个数量级；
      - 结果集经 COPY ... TO STDOUT 以 CSV 直出，再用 pl.read_csv 解析，规避
        psycopg2 逐行构造 Python 对象（80 万行级实测由 ~20s 降到 <1s）；
      - 复权在 Polars 侧用 join_asof 完成，规避 bar1d_qfq / bar1d_hfq 视图中
        逐行的 adj_factor 关联子查询（实测 800×500 由 ~330s 降到数秒）；
      - 复权公式与视图逐字一致：qfq close = qfq_ratio*raw + qfq_offset；
        hfq close = scale*qfq_close + hfq_base（scale/hfq_base 取自 adj_factor_latest）。
    """
    symbols = [u["symbol"] for u in universe]
    empty = pl.DataFrame(
        {
            c: []
            for c in (
                "symbol",
                "date",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "amount",
                "vwap",
            )
        }
    )
    if not symbols:
        return empty
    mode = adjust if adjust in ("qfq", "hfq") else "qfq"

    with conn.cursor() as cur:
        cur.execute("SELECT max(time) FROM bar1d_raw")
        row = cur.fetchone()
        latest = row[0] if row else None

        where = "symbol = ANY(%s)"
        where_params: tuple[Any, ...] = (symbols,)
        if latest is not None:
            where += " AND time >= %s"
            where_params = (symbols, latest - timedelta(days=limit * 2 + 90))

        buf = io.BytesIO()
        cur.copy_expert(
            "COPY (SELECT symbol, time, open::float8, high::float8, low::float8, "
            "close::float8, volume::float8, amount::float8 FROM bar1d_raw WHERE "
            + cur.mogrify(where, where_params).decode()
            + ") TO STDOUT WITH (FORMAT csv)",
            buf,
        )

        # PIT：as_of 传值时只保留 known_at <= as_of 的快照，随后的 max(known_at)
        # 便落在「该历史时刻最新」的版本上；None 时即全量（等价于视图的最新快照）。
        known_clause = " AND known_at <= %s::timestamp" if as_of else ""
        af_params: list[Any] = [symbols, as_of] if as_of else [symbols]

        cur.execute(
            "SELECT symbol, date, known_at, qfq_ratio::float8, qfq_offset::float8 "
            "FROM adj_factor WHERE symbol = ANY(%s)" + known_clause,
            af_params,
        )
        af_rows = cur.fetchall()

        cur.execute(
            "SELECT symbol, date, known_at, scale::float8, hfq_base::float8 "
            "FROM adj_factor_latest WHERE symbol = ANY(%s)" + known_clause,
            af_params,
        )
        latest_rows = cur.fetchall()

    if buf.getbuffer().nbytes == 0:
        return empty
    buf.seek(0)
    bars = pl.read_csv(
        buf,
        has_header=False,
        schema={
            "column_1": pl.Utf8,
            "column_2": pl.Datetime,
            "column_3": pl.Float64,
            "column_4": pl.Float64,
            "column_5": pl.Float64,
            "column_6": pl.Float64,
            "column_7": pl.Float64,
            "column_8": pl.Float64,
        },
    ).rename(
        {
            "column_1": "symbol",
            "column_2": "date",
            "column_3": "open",
            "column_4": "high",
            "column_5": "low",
            "column_6": "close",
            "column_7": "volume",
            "column_8": "amount",
        }
    )
    bars = bars.with_columns(
        pl.col("date").rank("ordinal", descending=True).over("symbol").alias("_rk")
    )
    bars = bars.filter(pl.col("_rk") <= limit).drop("_rk")

    # amount 复权前用原始 close 估算（复权只作用于价格列，不改成交额）。
    # 沪深 volume 为「手」→ ×100 换股；北交所 volume 为「股」→ ×1。
    # 估算后仅当 (close>0 & volume>0) 才有效，停牌保持 NaN（factor_code 契约允许）。
    close_raw = bars["close"].to_numpy()
    volume = bars["volume"].to_numpy()
    amount = bars["amount"].cast(pl.Float64).fill_null(float("nan")).to_numpy()
    amount_scale = np.where(
        np.array([str(s).endswith(".BJ") for s in bars["symbol"]]), 1.0, 100.0
    )
    derived = close_raw * volume * amount_scale
    derived = np.where((close_raw > 0) & (volume > 0), derived, float("nan"))
    amount = np.where(np.isfinite(amount), amount, derived)
    bars = bars.with_columns(pl.Series("amount", amount, dtype=pl.Float64))

    # vwap：北交所用真实成交额/成交量（原始价口径），沪深用典型价 (H+L+C)/3 代理。
    # 先按复权前原始价算出，随后并入 price_cols 走同一仿射复权变换，保证与
    # open/high/low/close 处于同一复权口径（详见函数 docstring 的 vwap 语义）。
    typical = (
        bars["high"].cast(pl.Float64)
        + bars["low"].cast(pl.Float64)
        + bars["close"].cast(pl.Float64)
    ) / 3.0
    traded = pl.col("amount").cast(pl.Float64) / pl.when(pl.col("volume") > 0).then(
        pl.col("volume")
    )
    bars = bars.with_columns(
        pl.when(pl.col("symbol").str.ends_with(".BJ"))
        .then(traded)
        .otherwise(typical)
        .alias("vwap")
    )

    price_cols = ("open", "high", "low", "close", "vwap")

    if af_rows:
        af = (
            pl.DataFrame(
                {
                    "symbol": [r[0] for r in af_rows],
                    "date": [r[1] for r in af_rows],
                    "known_at": [r[2] for r in af_rows],
                    "qfq_ratio": [r[3] for r in af_rows],
                    "qfq_offset": [r[4] for r in af_rows],
                }
            )
            .with_columns(pl.col("known_at").max().over("symbol").alias("_mx"))
            .filter(pl.col("known_at") == pl.col("_mx"))
            .select(["symbol", "date", "qfq_ratio", "qfq_offset"])
            .with_columns(pl.col("date").cast(pl.Datetime))
            .sort(["symbol", "date"])
        )
        bars = bars.sort(["symbol", "date"]).join_asof(
            af, on="date", by="symbol", strategy="backward", check_sortedness=False
        )
        bars = bars.with_columns(
            pl.col("qfq_ratio").fill_null(1.0),
            pl.col("qfq_offset").fill_null(0.0),
        )
    else:
        bars = bars.with_columns(
            pl.lit(1.0).alias("qfq_ratio"), pl.lit(0.0).alias("qfq_offset")
        )

    bars = bars.with_columns(
        [(pl.col("qfq_ratio") * pl.col(c) + pl.col("qfq_offset")).alias(c) for c in price_cols]
    )

    if mode == "hfq" and latest_rows:
        lt = (
            pl.DataFrame(
                {
                    "symbol": [r[0] for r in latest_rows],
                    "known_at": [r[2] for r in latest_rows],
                    "scale": [r[3] for r in latest_rows],
                    "hfq_base": [r[4] for r in latest_rows],
                }
            )
            .with_columns(pl.col("known_at").max().over("symbol").alias("_mx"))
            .filter(pl.col("known_at") == pl.col("_mx"))
            .select(["symbol", "scale", "hfq_base"])
        )
        bars = bars.join(lt, on="symbol", how="left")
        bars = bars.with_columns(
            [
                (
                    pl.col("scale").fill_null(1.0) * pl.col(c)
                    + pl.col("hfq_base").fill_null(0.0)
                ).alias(c)
                for c in price_cols
            ]
        )

    return bars.select(
        ["symbol", "date", "open", "high", "low", "close", "volume", "amount", "vwap"]
    ).sort(["symbol", "date"])


def _eval_expression_panel(frame: pl.DataFrame, expr_str: str) -> pl.DataFrame | None:
    """在股票池日线上求自定义因子表达式，返回整段面板 DataFrame（symbol/date/factor）。

    复刻 AKQuant FactorEngine.run_on_data 的分步执行：先 plan 拆解嵌套窗口函数，
    再逐步 with_columns 物化，最后产出 symbol/date/factor 三列（每个标的每根日线
    各一行，而非仅最新一根）。供因子检验（IC / 分层回测）按截面消费。

    Returns:
        面板 DataFrame；表达式未产出 result 时返回 None。
    """
    steps = _CUSTOM_PARSER.plan(expr_str)
    current = frame
    factor_col: pl.DataFrame | None = None
    for var_name, sub_expr_str in steps:
        sub_expr = _CUSTOM_PARSER.parse(sub_expr_str)
        if var_name == "result":
            factor_col = current.with_columns(sub_expr.alias("factor")).select(
                ["symbol", "date", "factor"]
            )
        else:
            current = current.with_columns(sub_expr.alias(var_name))
    return factor_col


def _eval_expression(frame: pl.DataFrame, expr_str: str) -> dict[str, float]:
    """在股票池日线上求自定义因子表达式，返回 {symbol: 最新一根的因子原始值}。

    基于 _eval_expression_panel 得到整段面板后，取每标的最后一根（最新）的因子值。
    """
    factor_col = _eval_expression_panel(frame, expr_str)
    if factor_col is None:
        return {}

    # 已按 symbol、date 升序，保留每标的最后一行即最新值
    latest = factor_col.sort(["symbol", "date"]).unique(subset=["symbol"], keep="last")
    result: dict[str, float] = {}
    for row in latest.iter_rows(named=True):
        v = row["factor"]
        if v is not None and np.isfinite(float(v)):
            result[row["symbol"]] = float(v)
    return result


def _rank_custom_scores(raw: dict[str, float]) -> dict[str, float]:
    """将自定义因子原始值做横截面百分位排名，映射到 [0, 1]（0=最低，1=最高）。"""
    syms = list(raw.keys())
    n = len(syms)
    if n == 0:
        return {}
    if n == 1:
        return {syms[0]: 0.5}
    arr = np.asarray([raw[s] for s in syms], dtype=float)
    order = np.argsort(arr, kind="mergesort")
    ranks = np.empty(n, dtype=float)
    ranks[order] = np.arange(n, dtype=float)
    ranks /= n - 1
    return {s: float(ranks[i]) for i, s in enumerate(syms)}


def _apply_rank_score(
    results: list[dict[str, Any]], valid: list[dict[str, Any]]
) -> None:
    """按横截面百分位排名合成综合得分（rank 模式）。

    对每个因子，将股票池内的得分转换为百分位排名（0=最低，1=最高），
    再按权重加权合成，得到综合排名得分。

    Args:
        results: 参与排名的结果列表（每项含内部字段 _scores）
        valid: 有效因子配置（含 weight）
    """
    n_stocks = len(results)
    n_factors = len(valid)
    if n_stocks == 0:
        return

    mat = np.zeros((n_stocks, n_factors), dtype=float)
    for i, r in enumerate(results):
        for j in range(n_factors):
            mat[i, j] = r["_scores"][j]

    weights = np.asarray([float(v["weight"]) for v in valid], dtype=float)
    wsum = float(weights.sum())

    # 每因子独立做横截面百分位排名
    rank_mat = np.zeros_like(mat)
    for j in range(n_factors):
        col = mat[:, j]
        if n_stocks > 1:
            sorted_col = np.sort(col)
            rank_pos = np.searchsorted(sorted_col, col).astype(float)
            rank_mat[:, j] = rank_pos / (n_stocks - 1)
        else:
            rank_mat[:, j] = 0.5  # 单标的时排名无意义，取中性

    combined = (
        (rank_mat * weights).sum(axis=1) / wsum
        if wsum > 0
        else rank_mat.mean(axis=1)
    )

    for i, r in enumerate(results):
        r["score"] = round(float(combined[i]) * 100, 2)


def screen(
    factors: list[dict[str, Any]],
    top_n: int = 20,
    symbols: list[str] | None = None,
    combine: str = "weighted_sum",
    excludes: list[str] | None = None,
) -> dict[str, Any]:
    """对股票池按策略因子打分排名。

    Args:
        factors: 策略因子列表 [{name, weight, value?, direction?, kind?, expression?, code?}]
                 weight 为 0-100，value 为信号阈值 0-100（默认 50），
                 direction 为方向覆盖 1/-1（默认 1）；
                 kind 为自定义因子的定义方式：expression（AKQuant 表达式，读 expression）
                 或 python（Python 代码，读 code）；内置因子忽略这两个字段
        top_n: 返回前 N 名
        symbols: 可选，限定股票池；为 None 时使用全部有日线数据的标的
        combine: 信号合成方式（weighted_sum/equal_weight/voting/rank/and/or）
        excludes: 可选，排除条件列表（smallCap/loss/st/star/chinext），默认不排除

    Returns:
        {"items": [{symbol, name, score, close, factorScores}], "total": 参与打分标的数,
         "elapsedMs": 总耗时(ms), "fetchMs": 日线取数耗时(ms)}
    """
    combine = normalize_combine(combine)
    started = time.perf_counter()

    # 过滤出有效因子（权重 > 0）：
    #  - 内置因子：name 在 FACTOR_REGISTRY，用 numpy compute 计算
    #  - 自定义-表达式因子：kind=expression 且带 expression，用 AKQuant 表达式引擎求值
    #  - 自定义-Python 因子：kind=python 且带 code，用受限环境执行 compute(data)
    valid: list[dict[str, Any]] = []
    for f in factors:
        name = f.get("name")
        weight = float(f.get("weight", 0) or 0)
        if weight <= 0:
            continue
        direction = -1 if int(f.get("direction", 1)) < 0 else 1
        value = float(f.get("value", 50) or 50)  # 0-100
        base = {
            "name": name,
            "weight": weight,
            "value": value,
            "direction": direction,
        }
        if name in FACTOR_REGISTRY:
            valid.append({**base, "kind": "builtin", "factor": FACTOR_REGISTRY[name]})
        elif str(f.get("kind") or "") == "python" and f.get("code"):
            valid.append({**base, "kind": "python", "code": str(f["code"])})
        elif f.get("expression"):
            valid.append({**base, "kind": "custom", "expression": str(f["expression"])})

    if not valid:
        return {
            "items": [],
            "total": 0,
            "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
            "fetchMs": 0.0,
        }

    # voting 模式使用的每因子阈值（0-1）
    thresholds = [v["value"] / 100.0 for v in valid]

    conn = _get_conn()
    try:
        universe = _get_universe(conn)
        if symbols:
            wanted = set(symbols)
            universe = [u for u in universe if u["symbol"] in wanted]
        # 排除过滤：先剔除不合格标的，再做昂贵的日线加载（市值/PE 依赖实时行情）
        universe = _apply_excludes(universe, excludes)

        # 自定义因子（表达式）：一次性加载股票池日线，逐因子求值并横截面归一化得分
        custom_scores: dict[str, dict[str, float]] = {}
        if any(v["kind"] == "custom" for v in valid):
            frame = _load_universe_frame(conn, universe)
            for v in valid:
                if v["kind"] != "custom":
                    continue
                raw = _eval_expression(frame, v["expression"])
                custom_scores[v["name"]] = _rank_custom_scores(raw)

        # 内置因子所需日线：一次性批量取回全池（Python 因子窗口更长，故取 251 根）
        fetch_started = time.perf_counter()
        bars_limit = (
            CUSTOM_HISTORY_COUNT if any(v["kind"] == "python" for v in valid) else HISTORY_COUNT
        )
        universe_bars = _load_universe_bars(conn, universe, bars_limit)
        fetch_ms = round((time.perf_counter() - fetch_started) * 1000, 1)

        # Python 因子：在受限环境逐标的求值，取最新值后做横截面归一化
        for v in valid:
            if v["kind"] != "python":
                continue
            series = run_factor_code(v["code"], universe_bars)
            custom_scores[v["name"]] = _rank_custom_scores(latest_values(series))

        results: list[dict[str, Any]] = []
        for u in universe:
            data = universe_bars.get(u["symbol"])
            if data is None:
                continue

            factor_scores: dict[str, float] = {}
            scores: list[float] = []
            weights: list[float] = []
            for f in valid:
                if f["kind"] == "builtin":
                    raw = float(f["factor"].compute(data))  # [0, 1]
                else:
                    # 自定义因子（表达式 / Python）得分已横截面归一化到 [0, 1]，缺失标的取中性
                    raw = custom_scores.get(f["name"], {}).get(u["symbol"], 0.5)
                s = apply_direction(raw, f["direction"])
                factor_scores[f["name"]] = round(s * 100, 2)  # 展示为 0-100
                scores.append(s)
                weights.append(f["weight"])

            close = float(data["close"][-1])
            prev_close = float(data["close"][-2])
            change_pct = round((close - prev_close) / prev_close * 100, 2) if prev_close > 0 else None

            amount_latest = float(data["amount"][-1])
            amount = round(amount_latest, 2) if np.isfinite(amount_latest) else None

            results.append(
                {
                    "symbol": u["symbol"],
                    "name": u["name"],
                    "close": round(close, 2),
                    "changePct": change_pct,
                    "amount": amount,
                    "factorScores": factor_scores,
                    "_scores": scores,
                    "_weights": weights,
                }
            )

        # 合成综合得分（rank 模式走横截面排名，其余走点式合成）
        if combine == "rank":
            _apply_rank_score(results, valid)
        else:
            for r in results:
                r["score"] = round(
                    combine_scores(r["_scores"], r["_weights"], thresholds, combine) * 100,
                    2,
                )

        # 清理内部字段
        for r in results:
            r.pop("_scores", None)
            r.pop("_weights", None)

        results.sort(key=lambda x: x["score"], reverse=True)
        return {
            "items": results[:top_n],
            "total": len(results),
            "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
            "fetchMs": fetch_ms,
        }
    finally:
        conn.close()
