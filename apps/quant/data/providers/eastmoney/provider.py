"""东方财富（EastMoney）数据源 provider。

能力：信号层（概念归属 / 个股资金流分钟 / 龙虎榜 / 解禁 / 行业排名 / 板块资金流 /
全市场龙虎榜）+ 资金面 / 筹码层（融资融券 / 大宗 / 股东户数 / 分红 / 个股资金流120日 /
筹码分布本地推演）。

东财系接口有风控（>5次/秒、并发≥10、1分钟≥200 会临时封 IP），所有 eastmoney.com
请求一律走模块级 `_em_get()`：串行限流（最小间隔 + 随机抖动）+ 统一 UA。筹码分布
「本地推演」需 OHLC（mootdx）+ 流通市值（腾讯，用于估算换手率），因此是跨源编排，
并非东财独有端点，但归入本层统一暴露。

字段口径：金额单位统一为「元」（分钟/日资金流、融资融券、大宗），龙虎榜净买额为
「万元」。返回 snake_case，对齐 server 端 DB 表字段。

⚠️ K 线政策：个股日 K 线（kline）已从本源移除——K 线不属于东财「独有」数据，
按 skill 优先级改走腾讯（主，日线前/后复权）/ mootdx（备，多周期不复权）/ 百度（备）
等不封 IP 源。本源仅保留板块 BK 指数 K 线（board_kline，东财独有）。
"""
from __future__ import annotations

import json
import random
import threading
import time
import urllib.parse
import urllib.request
from datetime import date as _date
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from ...base import MarketProvider
from ...common import UA, get_prefix, norm_ticker, tdx_client
from ...schemas import (
    BlockTradeItem,
    BoardConstituentItem,
    BoardFundFlow,
    BoardFundFlowItem,
    BoardList,
    BoardListItem,
    ChipDistribution,
    ConceptBlock,
    ConceptBlocks,
    DailyDragonTiger,
    DailyDragonTigerStock,
    DividendItem,
    DragonTigerBoard,
    DragonTigerInstitution,
    DragonTigerRecord,
    DragonTigerSeat,
    DragonTigerSeats,
    FundFlowDay,
    FundFlowPoint,
    FundFlowRankItem,
    HolderNumItem,
    IndustryComparison,
    IndustryRankItem,
    KlineBar,
    LockupExpiry,
    LockupExpiryItem,
    MarginTradingItem,
)

DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"

# 东财防封：两次请求最小间隔（秒），批量场景可调大到 1.5~2
_EM_MIN_INTERVAL = 1.0
_em_last_call = 0.0
_em_lock = threading.Lock()


def _f(v):
    """宽松转 float：None / 空串 / '-' → None。"""
    if v is None or v == "" or v == "-":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _f0(v) -> float:
    """宽松转 float：无法解析 → 0.0。"""
    return _f(v) or 0.0


def _i(v) -> int:
    r = _f(v)
    return int(r) if r is not None else 0


def _em_get(url: str, params: dict | None = None, headers: dict | None = None, timeout: int = 15):
    """东财统一请求入口：串行限流 + 统一 UA，返回解析后的 JSON。

    所有 eastmoney.com 接口都应通过它请求，避免高频被封 IP。持锁请求保证
    「串行限流」语义（同一时刻只发一个东财请求）。
    """
    global _em_last_call
    with _em_lock:
        wait = _EM_MIN_INTERVAL - (time.time() - _em_last_call)
        if wait > 0:
            time.sleep(wait + random.uniform(0.1, 0.5))
        try:
            if params:
                url = f"{url}?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        finally:
            _em_last_call = time.time()


def _eastmoney_datacenter(
    report_name: str,
    columns: str = "ALL",
    filter_str: str = "",
    page_size: int = 50,
    sort_columns: str = "",
    sort_types: str = "-1",
) -> list[dict]:
    """东财数据中心统一查询（龙虎榜/解禁/融资融券/大宗/股东户数/分红共用）。"""
    params = {
        "reportName": report_name,
        "columns": columns,
        "filter": filter_str,
        "pageNumber": "1",
        "pageSize": str(page_size),
        "sortColumns": sort_columns,
        "sortTypes": sort_types,
        "source": "WEB",
        "client": "WEB",
    }
    d = _em_get(DATACENTER_URL, params=params, timeout=15)
    if d.get("result") and d["result"].get("data"):
        return d["result"]["data"]
    return []


def _em_market_code(code: str) -> int:
    """东财 secid 市场号：沪=1，深/北=0。"""
    return 1 if get_prefix(code) == "sh" else 0


def _em_secid(code: str) -> str:
    """东财 push2/push2his 的 secid，如 1.600519 / 0.300750。"""
    return f"{_em_market_code(code)}.{norm_ticker(code)}"


def _lockup_item(row: dict) -> LockupExpiryItem:
    """解禁记录行 → 模型（shares/able_shares 单位：万股）。"""
    return LockupExpiryItem(
        date=str(row.get("FREE_DATE", ""))[:10],
        type=row.get("FREE_SHARES_TYPE", "") or "",
        shares=_f0(row.get("FREE_SHARES")),
        able_shares=_f0(row.get("ABLE_FREE_SHARES")),
        ratio=_f0(row.get("FREE_RATIO")),
    )


# ── 筹码分布（本地推演，V3.7.0）───────────────────────────────────────────


def _triangular_weights(grid: np.ndarray, low: float, high: float, avg: float) -> np.ndarray:
    """当日筹码在价格网格上的三角分布权重（峰值在均价，面积归一）。"""
    w = np.zeros_like(grid)
    if not np.isfinite([low, high, avg]).all() or high < low:
        return w
    if high - low < 1e-9:  # 一字板：全部堆在一个价位
        w[np.argmin(np.abs(grid - low))] = 1.0
        return w
    avg = min(max(avg, low), high)
    left = (grid >= low) & (grid <= avg)
    right = (grid > avg) & (grid <= high)
    if avg - low > 1e-9:
        w[left] = (grid[left] - low) / (avg - low)
    else:
        w[left] = 1.0
    if high - avg > 1e-9:
        w[right] = (high - grid[right]) / (high - avg)
    else:
        w[right] = 1.0
    total = w.sum()
    if total > 0:
        return w / total
    # 兜底：当日振幅窄于网格步长时，可能一个网格点都没落进 [low, high]，映射到最近网格点
    w[np.argmin(np.abs(grid - avg))] = 1.0
    return w


def _chip_distribution(df: pd.DataFrame, grid_size: int = 300, decay: float = 1.0) -> ChipDistribution:
    """筹码分布推演 — df 需含 date/high/low/close/turn（turn 为百分数）。"""
    need = {"date", "high", "low", "close", "turn"}
    missing = need - set(df.columns)
    if missing:
        raise ValueError(f"chip_distribution 缺少列: {sorted(missing)}")
    d = df.dropna(subset=["high", "low", "close", "turn"]).copy()
    d = d[d["high"] > 0]
    if d.empty:
        raise ValueError("chip_distribution: 有效行数为 0（检查是否全是停牌日，或字段类型不对）")
    d = d.sort_values("date").reset_index(drop=True)

    lo, hi = float(d["low"].min()), float(d["high"].max())
    pad = (hi - lo) * 0.02 or max(lo * 0.02, 0.01)
    grid = np.linspace(lo - pad, hi + pad, grid_size)

    # 初始筹码播种成「首日全部流通盘」，不从全零开始（否则窗口前存量持仓被一笔勾销）
    chips = None
    for row in d.itertuples(index=False):
        t = float(row.turn) / 100.0 * decay
        t = min(max(t, 0.0), 1.0)
        avg = (float(row.high) + float(row.low) + float(row.close)) / 3.0
        w = _triangular_weights(grid, float(row.low), float(row.high), avg)
        if w.sum() <= 0:
            continue
        if chips is None:
            chips = w.copy()
            continue
        chips = chips * (1.0 - t) + w * t
    if chips is None:
        raise RuntimeError("chip_distribution: 所有交易日的价格区间都无效，无法构建分布")

    total = chips.sum()
    if total <= 0:
        raise RuntimeError("chip_distribution: 筹码总量为 0，无法计算指标")
    chips = chips / total

    price = float(d["close"].iloc[-1])
    cum = np.cumsum(chips)

    def price_at(q: float) -> float:
        return float(np.interp(q, cum, grid))

    p05, p15, p85, p95 = (price_at(q) for q in (0.05, 0.15, 0.85, 0.95))
    peak_i = int(np.argmax(chips))
    return ChipDistribution(
        price=price,
        profit_ratio=float(chips[grid <= price].sum()),
        avg_cost=float((grid * chips).sum()),
        cost_90=(p05, p95),
        cost_70=(p15, p85),
        concentration_90=float((p95 - p05) / (p95 + p05)) if p95 + p05 else None,
        concentration_70=float((p85 - p15) / (p85 + p15)) if p85 + p15 else None,
        peak_price=float(grid[peak_i]),
        histogram=[(float(pp), float(cc)) for pp, cc in zip(grid, chips) if cc > 1e-6],
    )


class EastmoneyProvider(MarketProvider):
    name = "eastmoney"
    capabilities = frozenset({
        "concept_blocks",
        "fund_flow_minute",
        "dragon_tiger",
        "lockup_expiry",
        "industry_comparison",
        "board_fund_flow",
        "daily_dragon_tiger",
        "board_list",
        "board_constituents",
        "board_kline",
        "fund_flow_rank",
        "margin_trading",
        "block_trade",
        "holder_num",
        "dividend_history",
        "fund_flow_120d",
        "chip_distribution",
    })

    # ── 3.3 概念板块归属 ────────────────────────────────────────────

    def concept_blocks(self, code: str) -> ConceptBlocks:
        secid = _em_secid(code)
        params = {
            "fltt": "2", "invt": "2", "secid": secid,
            "spt": "3", "pi": "0", "pz": "200", "po": "1",
            "fields": "f12,f14,f3,f128",
        }
        d = _em_get(
            "https://push2.eastmoney.com/api/qt/slist/get",
            params=params, headers={"Referer": "https://quote.eastmoney.com/"}, timeout=15,
        )
        diff = (d.get("data") or {}).get("diff") or {}
        items = diff.values() if isinstance(diff, dict) else diff
        boards = [
            ConceptBlock(
                name=it.get("f14", "") or "",
                code=it.get("f12", "") or "",
                change_pct=_f(it.get("f3")),
                lead_stock=it.get("f128", "") or "",
            )
            for it in items
        ]
        return ConceptBlocks(
            total=len(boards),
            boards=boards,
            concept_tags=[b.name for b in boards],
        )

    # ── 3.4 个股资金流（分钟级）────────────────────────────────────

    def fund_flow_minute(self, code: str) -> list[FundFlowPoint]:
        secid = _em_secid(code)
        params = {
            "secid": secid, "klt": 1,
            "fields1": "f1,f2,f3,f7",
            "fields2": "f51,f52,f53,f54,f55,f56,f57",
        }
        d = _em_get(
            "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get",
            params=params,
            headers={"Referer": "https://quote.eastmoney.com/", "Origin": "https://quote.eastmoney.com"},
            timeout=10,
        )
        rows: list[FundFlowPoint] = []
        for line in (d.get("data") or {}).get("klines") or []:
            parts = line.split(",")
            if len(parts) >= 6:
                rows.append(
                    FundFlowPoint(
                        time=parts[0],
                        main_net=_f0(parts[1]),
                        small_net=_f0(parts[2]),
                        mid_net=_f0(parts[3]),
                        large_net=_f0(parts[4]),
                        super_net=_f0(parts[5]),
                    )
                )
        return rows

    # ── 3.5 龙虎榜席位 ─────────────────────────────────────────────

    def dragon_tiger(
        self, code: str, trade_date: str | None = None, look_back: int = 30
    ) -> DragonTigerBoard:
        if trade_date is None:
            trade_date = _date.today().strftime("%Y-%m-%d")
        digits = norm_ticker(code)
        start = datetime.strptime(trade_date, "%Y-%m-%d") - timedelta(days=look_back)
        start_str = start.strftime("%Y-%m-%d")

        records: list[DragonTigerRecord] = []
        data = _eastmoney_datacenter(
            "RPT_DAILYBILLBOARD_DETAILSNEW",
            filter_str=f"(TRADE_DATE>='{start_str}')(TRADE_DATE<='{trade_date}')(SECURITY_CODE=\"{digits}\")",
            page_size=50, sort_columns="TRADE_DATE", sort_types="-1",
        )
        for row in data:
            records.append(
                DragonTigerRecord(
                    date=str(row.get("TRADE_DATE", ""))[:10],
                    reason=row.get("EXPLANATION", "") or "",
                    net_buy=round(_f0(row.get("BILLBOARD_NET_AMT")) / 10000, 1),
                    turnover=round(_f0(row.get("TURNOVERRATE")), 2),
                )
            )

        seats = DragonTigerSeats()
        # 空窗口（大市值/低换手标的常态）时不查席位、也不崩溃
        buy_data: list[dict] = []
        sell_data: list[dict] = []
        if records:
            latest_date = records[0].date
            buy_data = _eastmoney_datacenter(
                "RPT_BILLBOARD_DAILYDETAILSBUY",
                filter_str=f"(TRADE_DATE='{latest_date}')(SECURITY_CODE=\"{digits}\")",
                page_size=10, sort_columns="BUY", sort_types="-1",
            )
            for row in buy_data[:5]:
                seats.buy.append(
                    DragonTigerSeat(
                        name=row.get("OPERATEDEPT_NAME", "") or "",
                        buy_amt=round(_f0(row.get("BUY")) / 10000, 1),
                        sell_amt=round(_f0(row.get("SELL")) / 10000, 1),
                        net=round(_f0(row.get("NET")) / 10000, 1),
                    )
                )
            sell_data = _eastmoney_datacenter(
                "RPT_BILLBOARD_DAILYDETAILSSELL",
                filter_str=f"(TRADE_DATE='{latest_date}')(SECURITY_CODE=\"{digits}\")",
                page_size=10, sort_columns="SELL", sort_types="-1",
            )
            for row in sell_data[:5]:
                seats.sell.append(
                    DragonTigerSeat(
                        name=row.get("OPERATEDEPT_NAME", "") or "",
                        buy_amt=round(_f0(row.get("BUY")) / 10000, 1),
                        sell_amt=round(_f0(row.get("SELL")) / 10000, 1),
                        net=round(_f0(row.get("NET")) / 10000, 1),
                    )
                )

        institution = DragonTigerInstitution()
        for detail_data, side in [(buy_data, "buy"), (sell_data, "sell")]:
            for row in detail_data:
                if str(row.get("OPERATEDEPT_CODE", "")) == "0":
                    amt = _f0(row.get("BUY")) if side == "buy" else _f0(row.get("SELL"))
                    if side == "buy":
                        institution.buy_amt += amt
                    else:
                        institution.sell_amt += amt
        institution.buy_amt = round(institution.buy_amt / 10000, 1)
        institution.sell_amt = round(institution.sell_amt / 10000, 1)
        institution.net_amt = round(institution.buy_amt - institution.sell_amt, 1)

        return DragonTigerBoard(records=records, seats=seats, institution=institution)

    # ── 3.6 限售解禁日历 ───────────────────────────────────────────

    def lockup_expiry(
        self, code: str, trade_date: str | None = None, forward_days: int = 90
    ) -> LockupExpiry:
        if trade_date is None:
            trade_date = _date.today().strftime("%Y-%m-%d")
        digits = norm_ticker(code)
        history_data = _eastmoney_datacenter(
            "RPT_LIFT_STAGE",
            filter_str=f'(SECURITY_CODE="{digits}")',
            page_size=15, sort_columns="FREE_DATE", sort_types="-1",
        )
        history = [_lockup_item(row) for row in history_data]

        end_date = datetime.strptime(trade_date, "%Y-%m-%d") + timedelta(days=forward_days)
        end_str = end_date.strftime("%Y-%m-%d")
        upcoming_data = _eastmoney_datacenter(
            "RPT_LIFT_STAGE",
            filter_str=f'(SECURITY_CODE="{digits}")(FREE_DATE>=\'{trade_date}\')(FREE_DATE<=\'{end_str}\')',
            page_size=20, sort_columns="FREE_DATE", sort_types="1",
        )
        upcoming = [_lockup_item(row) for row in upcoming_data]
        return LockupExpiry(history=history, upcoming=upcoming)

    # ── 3.7 行业板块排名 ───────────────────────────────────────────

    def industry_comparison(self, top_n: int = 20) -> IndustryComparison:
        params = {
            "pn": "1", "pz": "100", "po": "1", "np": "1",
            "fltt": "2", "invt": "2", "fid": "f3",
            "fs": "m:90+t:2",
            "fields": "f2,f3,f4,f12,f13,f14,f104,f105,f128,f136,f140,f141,f207",
        }
        d = _em_get(
            "https://push2.eastmoney.com/api/qt/clist/get",
            params=params, headers={"User-Agent": UA}, timeout=15,
        )
        items = (d.get("data") or {}).get("diff") or []
        rows: list[IndustryRankItem] = []
        for i, it in enumerate(items):
            rows.append(
                IndustryRankItem(
                    rank=i + 1,
                    name=it.get("f14", "") or "",
                    code=it.get("f12", "") or "",
                    change_pct=_f(it.get("f3")),
                    up_count=_i(it.get("f104")),
                    down_count=_i(it.get("f105")),
                    leader=it.get("f140", "") or "",
                    leader_change=_f(it.get("f136")),
                )
            )
        return IndustryComparison(top=rows[:top_n], bottom=rows[-top_n:], total=len(rows))

    # ── 3.7b 板块列表 / 成分股 / 板块 K 线（供热力图与行业筹码）─────

    def board_list(self, board_type: str = "industry") -> BoardList:
        """板块列表（行业/概念），含总市值/换手率/领涨股，供热力图一级节点。

        与 stock-sdk `board.industry.list()` / `board.concept.list()` 同源同字段：
        push2 clist，`fs` 区分行业/概念，返回全部板块（概念约 400+，需翻页拉全）。
        """
        board_fs = {"industry": "m:90+t:2", "concept": "m:90+t:3"}
        if board_type not in board_fs:
            raise ValueError(f"board_type 须为 {list(board_fs)}")
        # f2 最新价 / f3 涨跌幅 / f8 换手率 / f12 代码 / f14 名称 /
        # f20 总市值 / f128 领涨股 / f136 领涨股涨跌幅
        base = {
            "pn": "1", "pz": "100", "po": "1", "np": "1",
            "fltt": "2", "invt": "2", "fid": "f3",
            "fs": board_fs[board_type],
            "fields": "f2,f3,f8,f12,f14,f20,f128,f136",
        }

        def _page(pn: int):
            d = _em_get(
                "https://push2delay.eastmoney.com/api/qt/clist/get",
                params={**base, "pn": str(pn)}, headers={"User-Agent": UA}, timeout=15,
            )
            dd = d.get("data") or {}
            return (dd.get("diff") or []), int(dd.get("total") or 0)

        # 东财 clist 单页上限 100（pz 传大于 100 也只返回 100 条），
        # 必须 pz=100 才能让翻页逻辑 len(more) < page_size 正确走到最后一页。
        page_size = 100
        items, total = _page(1)
        pn = 2
        while len(items) < total:
            more, _ = _page(pn)
            if not more:
                break
            items += more
            if len(more) < page_size:
                break
            pn += 1

        rows = [
            BoardListItem(
                name=it.get("f14", "") or "",
                code=it.get("f12", "") or "",
                change_pct=_f(it.get("f3")),
                total_market_cap=_f(it.get("f20")),
                turnover_rate=_f(it.get("f8")),
                leader=it.get("f128", "") or "",
                leader_change=_f(it.get("f136")),
            )
            for it in items
        ]
        return BoardList(board_type=board_type, total=len(rows), rows=rows)

    def board_constituents(self, board_code: str) -> list[BoardConstituentItem]:
        """板块成分股列表，供热力图二级节点。"""
        base = {
            "pn": "1", "pz": "100", "po": "1", "np": "1",
            "fltt": "2", "invt": "2", "fid": "f3",
            "fs": f"b:{board_code} f:!50",
            "fields": "f2,f3,f6,f8,f12,f14",
        }

        def _page(pn: int):
            d = _em_get(
                "https://push2delay.eastmoney.com/api/qt/clist/get",
                params={**base, "pn": str(pn)}, headers={"User-Agent": UA}, timeout=15,
            )
            dd = d.get("data") or {}
            return (dd.get("diff") or []), int(dd.get("total") or 0)

        # 东财 clist 单页上限 100，需翻页拉全（融资融券等大板块成分股可达数千只）
        page_size = 100
        items, total = _page(1)
        pn = 2
        while len(items) < total:
            more, _ = _page(pn)
            if not more:
                break
            items += more
            if len(more) < page_size:
                break
            pn += 1

        return [
            BoardConstituentItem(
                code=it.get("f12", "") or "",
                name=it.get("f14", "") or "",
                price=_f(it.get("f2")),
                change_pct=_f(it.get("f3")),
                turnover_rate=_f(it.get("f8")),
                amount=_f(it.get("f6")),
            )
            for it in items
        ]

    def board_kline(
        self,
        board_code: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[KlineBar]:
        """板块指数日 K 线（东财 BK 指数，secid=90.{code}）。

        来源：东财 push2his kline（板块 BK 指数 K 线为东财独有，mootdx/腾讯无此数据，
        属 skill「东财只用于独有数据」范畴）。
        降级：无独立备胎（板块指数 K 线仅东财提供）；走 _em_get 串行限流防封。
        """
        secid = f"90.{board_code}"
        params = {
            "secid": secid,
            "klt": "101",  # 日K
            "fqt": "1",    # 前复权
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "lmt": str(limit),
        }
        if start:
            params["beg"] = start.replace("-", "")
        if end:
            params["end"] = end.replace("-", "")
        d = _em_get(
            "https://push2his.eastmoney.com/api/qt/stock/kline/get",
            params=params,
            headers={"Referer": "https://quote.eastmoney.com/", "Origin": "https://quote.eastmoney.com"},
            timeout=15,
        )
        rows: list[KlineBar] = []
        for line in (d.get("data") or {}).get("klines") or []:
            parts = line.split(",")
            if len(parts) >= 7:
                rows.append(
                    KlineBar(
                        time=parts[0],
                        open=_f0(parts[1]),
                        close=_f0(parts[2]),
                        high=_f0(parts[3]),
                        low=_f0(parts[4]),
                        volume=_f0(parts[5]),
                        amount=_f0(parts[6]),
                    )
                )
        return rows

    # ── 3.8 板块资金流向 ───────────────────────────────────────────

    def board_fund_flow(
        self, board_type: str = "industry", period: str = "today", top_n: int = 20
    ) -> BoardFundFlow:
        """板块资金流向（行业/概念/地域 × 今日/5日/10日）。

        来源：东财 push2 clist（板块级资金流为东财独有，mootdx/腾讯无此数据）。
        降级：无独立备胎；走 _em_get 串行限流防封。与 stock-sdk `board.fundFlow` 同源。
        """
        board_fs = {"industry": "m:90+t:2", "concept": "m:90+t:3", "region": "m:90+t:1"}
        board_period = {
            "today": ("f62", "f62", "f184", "f3", "f204"),
            "5d": ("f164", "f164", "f165", "f109", "f257"),
            "10d": ("f174", "f174", "f175", "f160", None),
        }
        if board_type not in board_fs:
            raise ValueError(f"board_type 须为 {list(board_fs)}")
        if period not in board_period:
            raise ValueError(f"period 须为 {list(board_period)}")
        fid, f_main, f_pct, f_chg, f_leader = board_period[period]

        fields = ["f12", "f14", f_chg, f_main, f_pct]
        if f_leader:
            fields.append(f_leader)
        if period == "today":
            fields += ["f66", "f72", "f78", "f84", "f205"]  # 超大/大/中/小单净额 + 主力净流入最大股名称

        base = {
            "pz": "200", "po": "1", "np": "1", "fltt": "2", "invt": "2",
            "fid": fid, "fs": board_fs[board_type],
            "fields": ",".join(dict.fromkeys(fields)),
        }

        def _page(pn: int):
            d = _em_get(
                "https://push2.eastmoney.com/api/qt/clist/get",
                params={**base, "pn": str(pn)}, headers={"User-Agent": UA}, timeout=15,
            )
            dd = d.get("data") or {}
            return (dd.get("diff") or []), int(dd.get("total") or 0)

        page_size = 200
        items, total = _page(1)
        pn = 2
        while len(items) < top_n:
            if total and len(items) >= total:
                break
            more, _ = _page(pn)
            if not more:
                break
            items += more
            pn += 1
            if len(more) < page_size:
                break
        total = max(total, len(items))

        rows: list[BoardFundFlowItem] = []
        for i, it in enumerate(items):
            row = BoardFundFlowItem(
                rank=i + 1,
                name=it.get("f14", "") or "",
                code=it.get("f12", "") or "",
                change_pct=_f(it.get(f_chg)),
                main_net=_f(it.get(f_main)),
                main_pct=_f(it.get(f_pct)),
                leader=(it.get(f_leader, "") or "") if f_leader else "",
            )
            if period == "today":
                row.super_large_net = _f(it.get("f66"))
                row.large_net = _f(it.get("f72"))
                row.medium_net = _f(it.get("f78"))
                row.small_net = _f(it.get("f84"))
                row.top_stock_code = it.get("f204", "") or ""
                row.top_stock_name = it.get("f205", "") or ""
            rows.append(row)
        return BoardFundFlow(board_type=board_type, period=period, total=total, rows=rows[:top_n])

    # ── 3.9 全市场龙虎榜 ───────────────────────────────────────────

    def daily_dragon_tiger(
        self, trade_date: str | None = None, min_net_buy: float | None = None
    ) -> DailyDragonTiger:
        if trade_date is None:
            trade_date = datetime.now().strftime("%Y-%m-%d")
        data = _eastmoney_datacenter(
            "RPT_DAILYBILLBOARD_DETAILSNEW",
            filter_str=f"(TRADE_DATE>='{trade_date}')(TRADE_DATE<='{trade_date}')",
            page_size=500, sort_columns="BILLBOARD_NET_AMT", sort_types="-1",
        )
        if not data:
            return DailyDragonTiger(
                date=trade_date, total_records=0, stocks=[],
                note="无数据（非交易日或盘后未更新）",
            )
        actual_date = str(data[0].get("TRADE_DATE", ""))[:10]
        stocks: list[DailyDragonTigerStock] = []
        for row in data:
            net_buy = _f0(row.get("BILLBOARD_NET_AMT")) / 10000
            if min_net_buy is not None and net_buy < min_net_buy:
                continue
            stocks.append(
                DailyDragonTigerStock(
                    code=str(row.get("SECURITY_CODE", "")).zfill(6),
                    name=str(row.get("SECURITY_NAME_ABBR", "")),
                    reason=row.get("EXPLANATION", "") or "",
                    close=_f0(row.get("CLOSE_PRICE")),
                    change_pct=round(_f0(row.get("CHANGE_RATE")), 2),
                    net_buy_wan=round(net_buy, 1),
                    buy_wan=round(_f0(row.get("BILLBOARD_BUY_AMT")) / 10000, 1),
                    sell_wan=round(_f0(row.get("BILLBOARD_SELL_AMT")) / 10000, 1),
                    turnover_pct=round(_f0(row.get("TURNOVERRATE")), 2),
                )
            )
        return DailyDragonTiger(date=actual_date, total_records=len(stocks), stocks=stocks)

    # ── 4.1 融资融券明细 ───────────────────────────────────────────

    def margin_trading(self, code: str, page_size: int = 30) -> list[MarginTradingItem]:
        digits = norm_ticker(code)
        data = _eastmoney_datacenter(
            "RPTA_WEB_RZRQ_GGMX", filter_str=f'(SCODE="{digits}")',
            page_size=page_size, sort_columns="DATE", sort_types="-1",
        )
        rows: list[MarginTradingItem] = []
        for row in data:
            rows.append(
                MarginTradingItem(
                    date=str(row.get("DATE", ""))[:10],
                    rzye=_f0(row.get("RZYE")),
                    rzmre=_f0(row.get("RZMRE")),
                    rzche=_f0(row.get("RZCHE")),
                    rqye=_f0(row.get("RQYE")),
                    rqmcl=_f0(row.get("RQMCL")),
                    rqchl=_f0(row.get("RQCHL")),
                    rzrqye=_f0(row.get("RZRQYE")),
                )
            )
        return rows

    # ── 4.2 大宗交易 ───────────────────────────────────────────────

    def block_trade(self, code: str, page_size: int = 20) -> list[BlockTradeItem]:
        digits = norm_ticker(code)
        data = _eastmoney_datacenter(
            "RPT_DATA_BLOCKTRADE", filter_str=f'(SECURITY_CODE="{digits}")',
            page_size=page_size, sort_columns="TRADE_DATE", sort_types="-1",
        )
        rows: list[BlockTradeItem] = []
        for row in data:
            close = _f0(row.get("CLOSE_PRICE"))
            deal_price = _f0(row.get("DEAL_PRICE"))
            premium = ((deal_price / close - 1) * 100) if close else 0
            rows.append(
                BlockTradeItem(
                    date=str(row.get("TRADE_DATE", ""))[:10],
                    price=deal_price,
                    close=close,
                    premium_pct=round(premium, 2),
                    vol=_f0(row.get("DEAL_VOLUME")),
                    amount=_f0(row.get("DEAL_AMT")),
                    buyer=row.get("BUYER_NAME", "") or "",
                    seller=row.get("SELLER_NAME", "") or "",
                )
            )
        return rows

    # ── 4.3 股东户数变化 ───────────────────────────────────────────

    def holder_num(self, code: str, page_size: int = 10) -> list[HolderNumItem]:
        digits = norm_ticker(code)
        data = _eastmoney_datacenter(
            "RPT_HOLDERNUMLATEST", filter_str=f'(SECURITY_CODE="{digits}")',
            page_size=page_size, sort_columns="END_DATE", sort_types="-1",
        )
        rows: list[HolderNumItem] = []
        for row in data:
            rows.append(
                HolderNumItem(
                    date=str(row.get("END_DATE", ""))[:10],
                    holder_num=_f0(row.get("HOLDER_NUM")),
                    change_num=_f0(row.get("HOLDER_NUM_CHANGE")),
                    change_ratio=_f0(row.get("HOLDER_NUM_RATIO")),
                    avg_shares=_f0(row.get("AVG_FREE_SHARES")),
                )
            )
        return rows

    # ── 4.4 分红送转历史 ───────────────────────────────────────────

    def dividend_history(self, code: str, page_size: int = 20) -> list[DividendItem]:
        digits = norm_ticker(code)
        data = _eastmoney_datacenter(
            "RPT_SHAREBONUS_DET", filter_str=f'(SECURITY_CODE="{digits}")',
            page_size=page_size, sort_columns="EX_DIVIDEND_DATE", sort_types="-1",
        )
        rows: list[DividendItem] = []
        for row in data:
            rows.append(
                DividendItem(
                    date=str(row.get("EX_DIVIDEND_DATE", ""))[:10],
                    bonus_rmb=_f0(row.get("PRETAX_BONUS_RMB")),
                    transfer_ratio=_f0(row.get("TRANSFER_RATIO")),
                    bonus_ratio=_f0(row.get("BONUS_RATIO")),
                    plan=row.get("ASSIGN_PROGRESS", "") or "",
                )
            )
        return rows

    # ── 4.5 个股资金流（120 日，日级）──────────────────────────────

    def fund_flow_120d(self, code: str) -> list[FundFlowDay]:
        secid = _em_secid(code)
        params = {
            "secid": secid,
            "fields1": "f1,f2,f3,f7",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
            "lmt": "120",
        }
        d = _em_get(
            "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get",
            params=params,
            headers={"Referer": "https://quote.eastmoney.com/", "Origin": "https://quote.eastmoney.com"},
            timeout=15,
        )
        rows: list[FundFlowDay] = []
        for line in (d.get("data") or {}).get("klines") or []:
            parts = line.split(",")
            if len(parts) >= 7:
                rows.append(
                    FundFlowDay(
                        date=parts[0],
                        main_net=_f0(parts[1]),
                        small_net=_f0(parts[2]),
                        mid_net=_f0(parts[3]),
                        large_net=_f0(parts[4]),
                        super_net=_f0(parts[5]),
                        close=_f(parts[6]) if len(parts) >= 7 else None,
                        change_pct=_f(parts[7]) if len(parts) >= 8 else None,
                    )
                )
        return rows

    # ── 4.5b 个股资金流排行（全市场）──────────────────────────────

    def fund_flow_rank(self, indicator: str = "today", top_n: int = 100) -> list[FundFlowRankItem]:
        """全市场个股资金流排行，按主力净流入降序（东财 clist，fid=f62）。

        来源：东财 push2 clist（个股资金流为东财独有，mootdx/腾讯无此数据）。
        降级：无独立备胎；走 _em_get 串行限流防封。与 stock-sdk `fundFlow.rank` 同源同字段：
        fs 覆盖沪深北全部 A 股，fields 取主力/超大/大/中/小单净额与净占比。
        """
        if indicator != "today":
            raise ValueError(f"fund_flow_rank 仅支持 indicator='today'，收到 {indicator!r}")
        # 全 A 股（深主板/深创业/深中小/沪主板/沪科创/北交所，剔除退市 f:!2）
        fs = "m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:1+t:3+f:!2"
        base = {
            "pn": "1", "pz": "100", "po": "1", "np": "1",
            "fltt": "2", "invt": "2", "fid": "f62",
            "fs": fs,
            "fields": "f12,f14,f2,f3,f62,f184,f66,f72,f78,f84",
        }

        def _page(pn: int):
            d = _em_get(
                "https://push2.eastmoney.com/api/qt/clist/get",
                params={**base, "pn": str(pn)}, headers={"User-Agent": UA}, timeout=15,
            )
            dd = d.get("data") or {}
            return (dd.get("diff") or []), int(dd.get("total") or 0)

        page_size = 100
        items, total = _page(1)
        pn = 2
        while len(items) < top_n:
            if total and len(items) >= total:
                break
            more, _ = _page(pn)
            if not more:
                break
            items += more
            pn += 1
            if len(more) < page_size:
                break

        rows: list[FundFlowRankItem] = []
        for it in items[:top_n]:
            rows.append(
                FundFlowRankItem(
                    code=it.get("f12", "") or "",
                    name=it.get("f14", "") or "",
                    price=_f(it.get("f2")),
                    change_pct=_f(it.get("f3")),
                    main_net=_f(it.get("f62")),
                    main_pct=_f(it.get("f184")),
                    super_large_net=_f(it.get("f66")),
                    large_net=_f(it.get("f72")),
                    medium_net=_f(it.get("f78")),
                    small_net=_f(it.get("f84")),
                )
            )
        return rows

    # ── 4.6 筹码分布（本地推演）────────────────────────────────────

    def _tencent_float_mcap(self, code: str) -> float:
        """腾讯实时行情取流通市值（亿→元），用于估算历史换手率。"""
        prefix = get_prefix(code)
        url = f"https://qt.gtimg.cn/q={prefix}{code}"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode("gbk", errors="replace")
        for line in data.strip().split(";"):
            if "=" not in line or '"' not in line:
                continue
            vals = line.split('"')[1].split("~")
            if len(vals) > 44:
                try:
                    return float(vals[44]) * 1e8  # 流通市值（亿）→ 元
                except (ValueError, IndexError):
                    return 0.0
        return 0.0

    def chip_distribution(
        self, code: str, days: int = 120, grid_size: int = 300, decay: float = 1.0
    ) -> ChipDistribution:
        digits = norm_ticker(code)
        # 1. 日线 OHLCV（mootdx，不复权；筹码成本需复权价，此处为简化取不复权）
        client = tdx_client()
        df = client.bars(symbol=digits, frequency=9, offset=days)
        if df is None or df.empty:
            raise ValueError(f"mootdx 无 {digits} 日线数据")
        # 2. 流通市值（腾讯），估算换手率 = 成交额 / 流通市值
        float_mcap = self._tencent_float_mcap(digits)
        rows = []
        for _, r in df.iterrows():
            amount = _f0(r.get("amount"))
            turn = (amount / float_mcap * 100) if float_mcap else 0.0
            rows.append(
                {
                    "date": str(r.get("datetime", ""))[:10],
                    "high": _f0(r.get("high")),
                    "low": _f0(r.get("low")),
                    "close": _f0(r.get("close")),
                    "turn": turn,
                }
            )
        return _chip_distribution(pd.DataFrame(rows), grid_size=grid_size, decay=decay)
