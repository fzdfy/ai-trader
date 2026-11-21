"""Baostock 历史估值 provider。

每日 PE/PB/PS/PCF、换手率、停牌和 ST 状态；北交所在登录前拒绝。
baostock 用 TCP 连接，包只在调用时导入，避免未安装时阻塞其他 provider。
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ...base import CAPABILITY_VALUATION_HISTORY, MarketProvider
from ...common import get_prefix, norm_date, norm_ticker
from ...schemas import ValuationDailyItem


def _number(value: Any) -> float | None:
    if value in (None, "", "--"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _bs_code(symbol: str) -> str:
    digits = norm_ticker(symbol)
    prefix = get_prefix(symbol)
    if prefix not in {"sh", "sz"}:
        raise ValueError(f"baostock 不支持北交所标的: {symbol}")
    return f"{prefix}.{digits}"


def map_baostock_valuation_rows(
    rows: list[dict[str, Any]], symbol: str
) -> list[ValuationDailyItem]:
    result: list[ValuationDailyItem] = []
    for row in rows:
        trade_date = str(row.get("date") or "")[:10]
        if not trade_date:
            continue
        status = str(row.get("tradestatus") or "")
        result.append(
            ValuationDailyItem(
                symbol=symbol,
                trade_date=trade_date,
                pe_ttm=_number(row.get("peTTM")),
                pb=_number(row.get("pbMRQ")),
                ps_ttm=_number(row.get("psTTM")),
                pcf=_number(row.get("pcfNcfTTM")),
                turnover_rate=_number(row.get("turn")),
                trade_status="trading" if status == "1" else "suspended",
                is_st=str(row.get("isST") or "") == "1",
                source="baostock",
                raw=dict(row),
            )
        )
    return sorted(result, key=lambda item: item.trade_date)


class BaostockProvider(MarketProvider):
    name = "baostock"
    capabilities = frozenset({CAPABILITY_VALUATION_HISTORY})

    def valuation_history(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
    ) -> list[ValuationDailyItem]:
        bs_code = _bs_code(symbol)
        end_date = norm_date(end) or date.today().isoformat()
        start_date = norm_date(start) or (
            date.fromisoformat(end_date) - timedelta(days=365 * 5)
        ).isoformat()

        try:
            import baostock as bs
        except ImportError as exc:
            raise RuntimeError("baostock 未安装，无法读取历史估值") from exc

        login = bs.login()
        if login.error_code != "0":
            raise RuntimeError(f"baostock 登录失败: {login.error_code} {login.error_msg}")
        try:
            result = bs.query_history_k_data_plus(
                bs_code,
                "date,code,close,peTTM,pbMRQ,psTTM,pcfNcfTTM,turn,tradestatus,isST",
                start_date=start_date,
                end_date=end_date,
                frequency="d",
                adjustflag="3",
            )
            if result.error_code != "0":
                raise RuntimeError(
                    f"baostock 查询失败: {result.error_code} {result.error_msg}"
                )
            rows: list[dict[str, Any]] = []
            while result.next():
                rows.append(dict(zip(result.fields, result.get_row_data(), strict=False)))
        finally:
            bs.logout()
        return map_baostock_valuation_rows(rows, symbol)
