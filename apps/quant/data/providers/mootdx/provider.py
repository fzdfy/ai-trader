"""mootdx（通达信）行情源 provider。

能力：kline（多周期，不复权）/ quote（五档盘口）/ transaction（逐笔成交）。

注意：mootdx 不提供 PE / PB / 市值 / 换手率 / 涨跌停价，这些走腾讯源；
bars() 返回【不复权】数据，跨除权日比价需配合新浪复权因子。
"""
from __future__ import annotations

from ...base import MarketProvider
from ...common import norm_ticker, tdx_client
from ...schemas import BidAskLevel, KlineBar, Quote, TradeTick

# tf → mootdx frequency 映射（mootdx 0.11.7 实测频率值表）
_TF_TO_FREQ = {
    "1m": 8,
    "5m": 0,
    "15m": 1,
    "30m": 2,
    "60m": 3,
    "1d": 9,
    "1w": 5,
    "1mo": 6,
}


class MootdxProvider(MarketProvider):
    name = "mootdx"
    capabilities = frozenset({"kline", "quote", "transaction"})

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = tdx_client()
        return self._client

    def kline(
        self,
        symbol: str,
        tf: str = "1d",
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[KlineBar]:
        freq = _TF_TO_FREQ.get(tf)
        if freq is None:
            raise ValueError(f"mootdx 不支持的周期: {tf}")
        client = self._get_client()
        df = client.bars(symbol=norm_ticker(symbol), frequency=freq, offset=limit)
        if df is None or df.empty:
            return []

        bars: list[KlineBar] = []
        for _, row in df.iterrows():
            bars.append(
                KlineBar(
                    time=str(row.get("datetime", ""))[:10],
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("vol", 0) or 0),
                    amount=float(row["amount"]) if row.get("amount") else None,
                )
            )
        # 时间窗过滤（mootdx 只按 offset 取最近 N 根，start/end 由上层二次过滤）
        if start or end:
            bars = [
                b
                for b in bars
                if (not start or b.time >= start) and (not end or b.time <= end)
            ]
        return bars

    def quote(self, symbols: list[str]) -> dict[str, Quote]:
        client = self._get_client()
        digits = [norm_ticker(s) for s in symbols]
        df = client.quotes(symbol=digits)
        if df is None:
            return {}

        result: dict[str, Quote] = {}
        # 单只返回 Series / dict，多只返回 DataFrame
        if not hasattr(df, "iterrows"):
            df = df.to_frame().T if hasattr(df, "to_frame") else df
        rows = df.iterrows() if hasattr(df, "iterrows") else enumerate([df])
        for _, row in rows:
            sym = str(row.get("code", "")).zfill(6) if "code" in row else ""
            last = row.get("price")
            if last is None:
                continue
            pre_close = row.get("last_close")
            bid = [
                BidAskLevel(price=float(row.get(f"bid{i}")), volume=float(row.get(f"bid_vol{i}", 0) or 0))
                for i in range(1, 6)
                if row.get(f"bid{i}") is not None
            ]
            ask = [
                BidAskLevel(price=float(row.get(f"ask{i}")), volume=float(row.get(f"ask_vol{i}", 0) or 0))
                for i in range(1, 6)
                if row.get(f"ask{i}") is not None
            ]
            change = float(last) - float(pre_close) if pre_close is not None else None
            change_pct = (
                round((float(last) / float(pre_close) - 1) * 100, 4)
                if pre_close
                else None
            )
            key = sym or str(row.name)
            result[key] = Quote(
                symbol=key,
                last=float(last),
                open=float(row["open"]) if row.get("open") is not None else None,
                high=float(row["high"]) if row.get("high") is not None else None,
                low=float(row["low"]) if row.get("low") is not None else None,
                pre_close=float(pre_close) if pre_close is not None else None,
                volume=float(row.get("vol", 0) or 0),
                amount=float(row["amount"]) if row.get("amount") else None,
                change=change,
                change_pct=change_pct,
                bid=bid,
                ask=ask,
            )
        return result

    def transaction(self, symbol: str, date: str | None = None) -> list[TradeTick]:
        client = self._get_client()
        df = client.transaction(symbol=norm_ticker(symbol), date=date)
        if df is None or (hasattr(df, "empty") and df.empty):
            return []

        ticks: list[TradeTick] = []
        for _, row in df.iterrows():
            buyorsell = int(row.get("buyorsell", 2) or 2)
            side = {0: "buy", 1: "sell"}.get(buyorsell, "neutral")
            ticks.append(
                TradeTick(
                    time=str(row.get("time", "")),
                    price=float(row.get("price", 0) or 0),
                    volume=float(row.get("vol", 0) or 0),
                    num=int(row.get("num")) if row.get("num") is not None else None,
                    side=side,
                )
            )
        return ticks
