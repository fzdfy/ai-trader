"""导出 PostgreSQL 日线为 qlib 可消费的 per-symbol CSV。

把本地 ``bar1d_qfq``（前复权日线视图）导出成「每标的一个 CSV」，再用 qlib 自带的
``scripts/dump_bin.py`` 转成 ``.bin`` 数据目录，供 qlib 研究侧使用（因子挖掘 /
多模型横评 / IC·分层评价）。本脚本只做导出，不依赖 qlib，也不改动任何在线服务。

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
    """取股票池（instrument 优先，避免对 1600 万行 bar1d_qfq 做 DISTINCT 全表扫描）。"""
    with conn.cursor() as cur:
        cur.execute("SELECT symbol FROM instrument ORDER BY symbol")
        symbols = [row[0] for row in cur.fetchall()]
    return symbols[:limit] if limit else symbols


def iter_bars(conn, symbols: list[str], start: str | None, end: str | None):
    """按 symbol、time 升序流式返回日线，避免一次性载入全部 1600 万行进内存。"""
    sql = [
        "SELECT symbol, time,",
        "       open::float8, high::float8, low::float8, close::float8,",
        "       volume::float8, amount::float8",
        "FROM bar1d_qfq",
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

        written = skipped = rows_total = 0
        current_symbol: str | None = None
        buffer: list[list] = []

        def flush(symbol: str, buf: list[list]) -> None:
            nonlocal written, skipped, rows_total
            if len(buf) < min_bars:
                skipped += 1
                return
            write_csv(data_path / f"{to_qlib_code(symbol)}.csv", buf)
            written += 1
            rows_total += len(buf)

        for symbol, time, o, h, low, c, v, amount in iter_bars(conn, symbols, start, end):
            if symbol != current_symbol:
                if current_symbol is not None:
                    flush(current_symbol, buffer)
                current_symbol = symbol
                buffer = []
            buffer.append([_format_date(time), o, h, low, c, v, amount])

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
    parser = argparse.ArgumentParser(description="导出 bar1d_qfq 为 qlib per-symbol CSV")
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
