"""导出 PostgreSQL 日线为 qlib 可消费的 per-symbol CSV。

把本地前复权日线导出成「每标的一个 CSV」，再用 qlib 自带的 ``scripts/dump_bin.py``
转成 ``.bin`` 数据目录，供 qlib 研究侧使用（因子挖掘 / 多模型横评 / IC·分层评价）。
本脚本只做导出，不依赖 qlib，也不改动任何在线服务。

**因子应用层化（批量路径专用）**：本脚本不再查询 ``bar1d_qfq`` 视图——该视图用
``LEFT JOIN LATERAL ... date <= b.time ORDER BY date DESC LIMIT 1`` 逐行反向探测
``adj_factor``，跨标的批量扫描时命中率极低（Memoize 0 hit），并伴随 numeric 任意精度
运算开销。改为直接扫 ``bar1d_raw``，一次性把体量极小（约 5 万行 / 12MB，分段常数）的
``adj_factor`` 读进内存，在应用层用向量化 as-of merge（``np.searchsorted(side="right")-1``
取 date <= time 的最近段，缺省 ratio=1 / offset=0）复刻视图口径：

    qfq_t = ratio_t * raw_t + offset_t      （ratio_t / offset_t 取 date <= t 的最近段）

语义与 ``verify_adjust.py`` 的 ``_reconstruct`` 完全一致（最新段 ratio=1 / offset=0，
故最新交易日 qfq.close == raw.close）。单标的热路径（``data_loader.load_kline`` 等）仍走
视图，本改造仅针对批量导出/研究路径。

⚠️ 复权口径：``bar1d_qfq`` 为前复权（qfq），存在前视偏差。qlib 的 Alpha158 等
因子全靠价格重算，直接使用会让 IC 系统性虚高；研究结论是否可信，取决于复权
PIT 化（详见 AGENTS.md「A 股回测可信度缺口」）。

⚠️ 成交单位：沪深成交量为「手」（约 ×100 股），北交所（.BJ）为「股」且自带
成交额；``amount`` 列沪深多为 NULL，做横截面因子前需自行归一化。

用法（在 apps/quant 目录下执行）：

    # 全量导出到 research/qlib_csv/
    python research/export_to_qlib.py --data-path research/qlib_csv

    # 冒烟测试：只导 30 只、2020 年至今
    python research/export_to_qlib.py --data-path research/qlib_csv \\
        --start 2020-01-01 --limit 30

导出后转 .bin（需在装有 qlib 的独立环境执行；不要装进 apps/quant 的 venv）：

    python scripts/dump_bin.py dump_all \\
        --data_path research/qlib_csv \\
        --qlib_dir ~/.qlib/qlib_data/cn_data \\
        --date_field_name date \\
        --include_fields open,high,low,close,volume,amount
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

FIELDS = ["date", "open", "high", "low", "close", "volume", "amount"]

SERVER_CURSOR_NAME = "qlib_export"
FETCH_SIZE = 100_000


def to_qlib_code(symbol: str) -> str:
    """把本项目 symbol（如 600519.SH）转成 qlib 惯例代码（SH600519）。

    qlib 的 dump_bin 会从文件名反推代码（``fname_to_code``），features 目录再按
    ``code_to_fname(code).lower()`` 落盘。用「交易所前缀 + 代码」的无点格式，
    与官方 cn_data 一致，可避免文件名里的 ``.`` 与扩展名混淆。
    """
    code, _, exch = symbol.partition(".")
    return f"{exch.upper()}{code}" if exch else symbol.upper()


def _format_date(value) -> str:
    """把 DB 的 date/timestamp 统一格式化为 YYYY-MM-DD。"""
    return value.strftime("%Y-%m-%d") if hasattr(value, "strftime") else str(value)[:10]


def fetch_symbols(conn, limit: int | None) -> list[str]:
    """取股票池（instrument 优先，避免对 1600 万行 bar1d_raw 做 DISTINCT 全表扫描）。"""
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM instrument ORDER BY symbol")
        symbols = [row[0] for row in cur.fetchall()]
    return symbols[:limit] if limit else symbols


def fetch_factors(conn) -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """一次性读入全部复权因子（分段仿射）。

    ``adj_factor`` 仅约 5 万行且是「分段常数」（每标的平均约 9 段），整表读入内存的
    代价可忽略，却能把视图里逐行的反向 B-tree 探测降为应用层一次 as-of merge。
    返回 ``{symbol: (dates[datetime64[D]], qfq_ratio[float64], qfq_offset[float64])}``，
    各数组按 date 升序，直接喂给 ``np.searchsorted``。
    """
    factors: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    with conn.cursor() as cur:
        cur.execute(
            "SELECT symbol, date, qfq_ratio::float8, qfq_offset::float8 "
            "FROM adj_factor ORDER BY symbol, date"
        )
        cur_symbol: str | None = None
        dates: list = []
        ratios: list[float] = []
        offsets: list[float] = []

        def seal(symbol: str) -> None:
            factors[symbol] = (
                np.array(dates, dtype="datetime64[D]"),
                np.array(ratios, dtype="float64"),
                np.array(offsets, dtype="float64"),
            )

        for symbol, date, ratio, offset in cur:
            if symbol != cur_symbol:
                if cur_symbol is not None:
                    seal(cur_symbol)
                cur_symbol, dates, ratios, offsets = symbol, [], [], []
            dates.append(date)
            ratios.append(ratio)
            offsets.append(offset)
        if cur_symbol is not None:
            seal(cur_symbol)
    return factors


def iter_bars(conn, symbols: list[str], start: str | None, end: str | None):
    """按 symbol、time 升序流式返回**不复权**日线，避免全量载入内存。

    扫 ``bar1d_raw``（走 ``bar1d_raw_symbol_time_idx``），复权在应用层由 ``flush``
    完成；``time::date`` 与因子的 ``date`` 同型，保证 as-of 比较口径与视图一致。
    """
    sql = [
        "SELECT symbol, time::date,",
        "       open::float8, high::float8, low::float8, close::float8,",
        "       volume::float8, amount::float8",
        "FROM bar1d_raw",
        "WHERE symbol = ANY(%s)",
    ]
    params: list = [symbols]
    if start:
        sql.append("AND time >= %s")
        params.append(start)
    if end:
        sql.append("AND time <= %s")
        params.append(end)
    sql.append("ORDER BY symbol, time")

    # 服务端游标：逐批从 DB 拉取，内存占用与结果集大小无关
    with conn.cursor(name=SERVER_CURSOR_NAME) as cur:
        cur.itersize = FETCH_SIZE
        cur.execute("\n".join(sql), params)
        for row in cur:
            yield row


def apply_adjust(
    symbol: str,
    buf: list[tuple],
    factors: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]],
) -> list[list]:
    """对一个标的的 raw 日线做向量化 as-of merge 应用前复权，返回 CSV 行。

    ``buf`` 为按 time 升序的 ``(date, open, high, low, close, volume, amount)`` 元组。
    复刻视图语义：每根 bar 取 ``date <= time`` 的最近段 (ratio, offset)；无因子
    （如指数 / ETF）或早于首个因子段时缺省 ratio=1 / offset=0，此时输出等于 raw。
    volume / amount 不参与复权，原样透传。
    """
    bar_dates = np.array([row[0] for row in buf], dtype="datetime64[D]")
    raw = np.array([[row[1], row[2], row[3], row[4]] for row in buf], dtype="float64")

    entry = factors.get(symbol)
    if entry is None:
        adj = raw
    else:
        f_dates, f_ratio, f_offset = entry
        idx = np.searchsorted(f_dates, bar_dates, side="right") - 1
        hit = idx >= 0
        safe = np.where(hit, idx, 0)
        ratio = np.where(hit, f_ratio[safe], 1.0)
        offset = np.where(hit, f_offset[safe], 0.0)
        adj = raw * ratio[:, None] + offset[:, None]

    return [
        [
            _format_date(row[0]),
            adj[i, 0], adj[i, 1], adj[i, 2], adj[i, 3],
            row[5], row[6],
        ]
        for i, row in enumerate(buf)
    ]


def write_csv(path: Path, rows: list[list]) -> None:
    """写单个标的的 CSV（含表头 date,open,...）。"""
    with path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow(FIELDS)
        writer.writerows(rows)


def export(
    data_path: Path,
    start: str | None,
    end: str | None,
    limit: int | None,
    min_bars: int,
) -> dict:
    """导出股票池日线为 per-symbol CSV，返回统计信息。"""
    data_path.mkdir(parents=True, exist_ok=True)
    conn = psycopg2.connect(DATABASE_URL)
    try:
        symbols = fetch_symbols(conn, limit)
        if not symbols:
            return {"symbols": 0, "written": 0, "skipped": 0, "rows": 0}
        factors = fetch_factors(conn)

        written = skipped = rows_total = 0
        current_symbol: str | None = None
        buffer: list[tuple] = []

        def flush(symbol: str, buf: list[tuple]) -> None:
            nonlocal written, skipped, rows_total
            if len(buf) < min_bars:
                skipped += 1
                return
            write_csv(
                data_path / f"{to_qlib_code(symbol)}.csv",
                apply_adjust(symbol, buf, factors),
            )
            written += 1
            rows_total += len(buf)

        for symbol, time, o, h, low, c, v, amount in iter_bars(
            conn, symbols, start, end
        ):
            if symbol != current_symbol:
                if current_symbol is not None:
                    flush(current_symbol, buffer)
                current_symbol = symbol
                buffer = []
            buffer.append((time, o, h, low, c, v, amount))

        if current_symbol is not None:
            flush(current_symbol, buffer)

        return {
            "symbols": len(symbols),
            "written": written,
            "skipped": skipped,
            "rows": rows_total,
        }
    finally:
        conn.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出前复权日线为 qlib per-symbol CSV")
    parser.add_argument(
        "--data-path",
        default="research/qlib_csv",
        help="CSV 输出目录（默认 research/qlib_csv）",
    )
    parser.add_argument("--start", default=None, help="起始日期 YYYY-MM-DD（含）")
    parser.add_argument("--end", default=None, help="结束日期 YYYY-MM-DD（含）")
    parser.add_argument("--limit", type=int, default=None, help="只导出前 N 只（冒烟测试用）")
    parser.add_argument(
        "--min-bars", type=int, default=1, help="日线少于该数量的标的跳过（默认 1）"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    data_path = Path(args.data_path).expanduser()
    stats = export(
        data_path=data_path,
        start=args.start,
        end=args.end,
        limit=args.limit,
        min_bars=args.min_bars,
    )
    print(
        f"[export_to_qlib] 标的 {stats['symbols']}，写出 {stats['written']}，"
        f"跳过 {stats['skipped']}，总行数 {stats['rows']} → {data_path.resolve()}"
    )
    if stats["written"] == 0:
        print("[export_to_qlib] 未写出任何文件，请检查 DATABASE_URL 与日期范围", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
