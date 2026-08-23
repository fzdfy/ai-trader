"""腾讯财经行情源 provider。

能力：
- quote        实时行情（qt.gtimg.cn，GBK `~` 分隔，含 PE/PB/市值/换手率/涨跌停/指数/ETF）
- kline       个股日 K 线（web.ifzq.gtimg.cn/appstock/app/fqkline/get，前/后复权 qfq/hfq）

数据来源均为腾讯财经 HTTP GET，不封 IP（连续 5000+ 次才触发限流返回空，属限流
非封禁，降速即可恢复）。用 stdlib urllib 直连，不引入第三方 HTTP 库。
不提供五档盘口（走 mootdx），不提供逐笔成交。
"""
from __future__ import annotations

import json
import urllib.request

from ...base import MarketProvider
from ...common import UA, get_prefix, norm_date, norm_ticker
from ...schemas import KlineBar, Quote

# 前复权日 K 线端点：param={前缀}{代码},day,{start},{end},{count},qfq
# 返回 JSON `data.{前缀}{代码}.qfqday`，每行 [日期, 开, 收, 高, 低, 量(手)]，
# 注意腾讯字段顺序是「开/收/高/低」（收在高/低之前），与常规 OHLC 不同。
_FQKLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"


class TencentProvider(MarketProvider):
    name = "tencent"
    capabilities = frozenset({"quote", "kline"})

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

    def kline(
        self,
        code: str,
        tf: str = "1d",
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
        adjust: str = "qfq",
    ) -> list[KlineBar]:
        """个股日 K 线（腾讯财经，前/后复权）。

        来源：腾讯 web.ifzq.gtimg.cn/appstock/app/fqkline/get，不封 IP，是
        skill 优先级里「自带复权」的日 K 首选源（mootdx/百度不复权需另算复权因子）。

        tf：腾讯 fqkline 仅支持日线（1d），无分钟/周/月复权接口；收到非 1d 抛
        ValueError，由 registry 降级链落到 mootdx（多周期不复权）。

        adjust 复权口径：qfq=前复权（默认，最新价为基准）、hfq=后复权（历史价为基准，
        适合增量落库，除权不漂移）。接口返回键名与口径对应：qfq→qfqday、hfq→hfqday。
        降级：由 registry 降级链落到 mootdx（不复权）→ 百度（日线带 MA）。

        字段顺序注意：腾讯返回 [日期, 开, 收, 高, 低, 量(手)]，收在高/低之前，
        与常规 OHLC 不同；成交量单位为「手」，落库口径与 mootdx/百度一致。
        """
        if tf != "1d":
            raise ValueError(f"腾讯 K 线仅支持日线 tf=1d，收到 {tf}（降级链将落到 mootdx）")
        if adjust not in ("qfq", "hfq", "none"):
            raise ValueError(f"不支持的复权口径: {adjust}（可选 qfq/hfq/none）")
        start = norm_date(start)
        end = norm_date(end)
        prefix = get_prefix(code)
        digits = norm_ticker(code)
        key = f"{prefix}{digits}"

        # 腾讯参数：{前缀}{代码},day,{起始日},{结束日},{根数},{复权口径}
        # 起始/结束日留空则返回最近 limit 根；qfq/hfq 表示前/后复权。
        # 逗号与空字段直接拼接（实测无需 URL 编码，编码反而可能触发 %2C 解析失败）。
        param = f"{key},day,{start or ''},{end or ''},{limit},{adjust}"
        url = f"{_FQKLINE_URL}?param={param}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": "https://gu.qq.com/"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # 返回键名与复权口径对应：qfq→qfqday / hfq→hfqday / none→day
        node = data.get("data", {}).get(key, {})
        adjust_key = {"qfq": "qfqday", "hfq": "hfqday", "none": "day"}[adjust]
        rows = node.get(adjust_key) or []
        if not rows:
            return []

        bars: list[KlineBar] = []
        for row in rows:
            if not isinstance(row, (list, tuple)) or len(row) < 6:
                continue

            def f(i: int) -> float:
                try:
                    return float(row[i]) if row[i] not in (None, "") else 0.0
                except (ValueError, TypeError):
                    return 0.0

            bars.append(
                KlineBar(
                    time=str(row[0])[:10],
                    open=f(1),
                    close=f(2),
                    high=f(3),
                    low=f(4),
                    volume=f(5),
                    amount=None,  # 腾讯日 K 不返回成交额，落库时为 NULL
                )
            )
        # 时间窗二次过滤（腾讯对 start/end 的过滤粒度较粗，可能与入参不完全对齐）
        if start or end:
            bars = [
                b
                for b in bars
                if (not start or b.time >= start) and (not end or b.time <= end)
            ]
        return bars
