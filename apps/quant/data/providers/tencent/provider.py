"""腾讯财经行情源 provider。

能力：quote（实时行情，含 PE/PB/市值/换手率/涨跌停/指数/ETF）。

HTTP GET，GBK 编码，`~` 分隔 88 个字段，不封 IP。用 stdlib urllib 直连，
不引入第三方 HTTP 库。不提供五档盘口（走 mootdx），不提供逐笔成交。
"""
from __future__ import annotations

import urllib.request

from ...base import MarketProvider
from ...common import UA, get_prefix, norm_ticker
from ...schemas import Quote


class TencentProvider(MarketProvider):
    name = "tencent"
    capabilities = frozenset({"quote"})

    def quote(self, symbols: list[str]) -> dict[str, Quote]:
        # 前缀路由 + 原样键映射，保证返回键与入参一一对应
        prefixed: list[str] = []
        key_of: dict[str, str] = {}
        for c in symbols:
            p = f"{get_prefix(c)}{norm_ticker(c)}"
            prefixed.append(p)
            key_of[p] = c

        url = "https://qt.gtimg.cn/q=" + ",".join(prefixed)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode("gbk")

        result: dict[str, Quote] = {}
        for line in data.strip().split(";"):
            if not line.strip() or "=" not in line or '"' not in line:
                continue
            key = line.split("=")[0].split("_")[-1]
            vals = line.split('"')[1].split("~")
            if len(vals) < 53:
                continue
            code = key_of.get(key, key[2:])

            def f(i: int) -> float:
                try:
                    return float(vals[i]) if vals[i] else 0.0
                except (ValueError, IndexError):
                    return 0.0

            q = Quote(
                symbol=code,
                name=vals[1],
                last=f(3),
                pre_close=f(4),
                open=f(5),
                high=f(33),
                low=f(34),
                change=f(31),
                change_pct=f(32),
                amount=f(37) * 10000,  # 成交额(万元) → 元
                turnover_rate=f(38),
                pe=f(39),
                pb=f(46),
                limit_up=f(47),
                limit_down=f(48),
                extra={
                    "amplitude_pct": f(43),
                    "float_mcap_yi": f(44),  # 流通市值(亿)
                    "mcap_yi": f(45),        # 总市值(亿)
                    "vol_ratio": f(49),
                    "pe_static": f(52),
                },
            )
            # 僵尸报价检测：成交量 0 且最新价 == 昨收 → 已迁移老码 / 停牌股
            if q.amount == 0 and q.last == q.pre_close and q.last > 0:
                q.is_stale = True
                if key[2:4] in ("43", "83", "87"):
                    q.stale_reason = "北交所老号段，多数已迁至 920xxx，请按名称反查现行代码"
                else:
                    q.stale_reason = "成交量为 0（停牌 / 未开盘 / 废码），报价非当日真实成交"
            result[code] = q
        return result
