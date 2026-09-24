"""腾讯财经行情源 provider。

能力：
- quote        实时行情（qt.gtimg.cn，GBK `~` 分隔，含 PE/PB/市值/换手率/涨跌停/指数/ETF）
- kline       个股日 K 线（ifzq.gtimg.cn/appstock/app/fqkline/get，前/后复权 qfq/hfq）
- transaction 当日逐笔成交（stock.gtimg.cn/data/index.php 成交明细，最近一个交易日）

数据来源均为腾讯财经 HTTP GET，不封 IP（连续 5000+ 次才触发限流返回空，属限流
非封禁，降速即可恢复）。用 stdlib urllib 直连，不引入第三方 HTTP 库。
不提供五档盘口（走 mootdx）。逐笔为约 3 秒一笔的分笔，仅最近一个交易日、无历史
（mootdx 逐笔自 2026-09 起返回空，逐笔主源已切到本源的 tencent_ticks）。
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request

from ...base import MarketProvider
from ...common import UA, get_prefix, norm_date, norm_ticker
from ...schemas import KlineBar, Quote, TradeTick

# 前复权日 K 线端点：param={前缀}{代码},day,{start},{end},{count},qfq
# 返回 JSON `data.{前缀}{代码}.qfqday`，每行 [日期, 开, 收, 高, 低, 量(手)]，
# 注意腾讯字段顺序是「开/收/高/低」（收在高/低之前），与常规 OHLC 不同。
# 注意：web.ifzq.gtimg.cn / ifzq.gtimg.cn 都会被腾讯 WAF 以 501 拦截，
# 换用 proxy.finance.qq.com 反代（同一后端、返回格式一致、不触发 WAF）。
_FQKLINE_URL = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get"

# 当日逐笔端点：appn=detail&action=data&c={symbol}&p={page}，一页 70 笔翻到空页为止。
# 返回 GBK 文本 `v_detail_data_{symbol}=[page,"记录|记录|..."];`，每条记录 7 段：
# 序号/时刻/价/较上一笔/量(手)/额(元)/方向(B 主动买 · S 主动卖 · M 中性)。
_TICK_URL = "https://stock.gtimg.cn/data/index.php"
_TICK_MAX_PAGES = 300            # 一页 70 笔；2026-09 实测最活跃的票全天约 69 页
_TICK_SESSION_END = "15:00:59"   # 连续竞价 + 收盘集合竞价到此为止，之后是盘后定价


def _tick_num(raw: str, label: str) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        raise RuntimeError(f"腾讯逐笔 {label} 字段 {raw!r} 不是数字") from None


def _qt_snapshot(symbol: str) -> tuple[str, str, float]:
    """腾讯行情快照 → (交易日 YYYY-MM-DD, 时刻 HHMMSS, 当日成交额 元)。代码不存在抛 ValueError。"""
    req = urllib.request.Request("https://qt.gtimg.cn/q=" + symbol, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        text = resp.read().decode("gbk", "replace")
    if "v_pv_none_match" in text:
        raise ValueError(f"腾讯没有 {symbol} 这个代码")
    m = re.search(rf'v_{symbol}="([^"]*)"', text)
    if not m:
        raise RuntimeError(f"腾讯行情快照 {symbol} 缺少 v_{symbol} 变量，格式可能已变")
    fields = m.group(1).split("~")
    if len(fields) < 36 or not re.fullmatch(r"[0-9]{14}", fields[30]):
        raise RuntimeError(f"腾讯行情快照 {symbol} 字段数 {len(fields)} 或时间字段异常，格式可能已变")
    parts = fields[35].split("/")          # 最新价/成交量/成交额(元)；成交量单位随板块不同，只用成交额
    if len(parts) != 3:
        raise RuntimeError(f"腾讯行情快照 {symbol} 的价/量/额字段是 {fields[35]!r}，格式可能已变")
    return norm_date(fields[30][:8]), fields[30][8:], _tick_num(parts[2], "成交额")


def _tick_page(symbol: str, page: int) -> list[dict] | None:
    """第 page 页逐笔（0 起）→ 记录列表；翻过最后一页时腾讯返回空内容，返回 None。"""
    query = urllib.parse.urlencode({"appn": "detail", "action": "data", "c": symbol, "p": page})
    req = urllib.request.Request(f"{_TICK_URL}?{query}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        text = resp.read().decode("gbk", "replace").strip()
    if not text:
        return None
    m = re.fullmatch(rf'v_detail_data_{symbol}=\[(\d+),"([^"]*)"\];?', text)
    if not m or int(m.group(1)) != page:
        raise RuntimeError(f"腾讯逐笔 {symbol} 第 {page} 页不是预期格式: {text[:80]!r}")
    if not m.group(2):
        return None
    records: list[dict] = []
    try:
        for item in m.group(2).split("|"):
            seq, clock, price, change, volume, amount, side = item.split("/")
            if not re.fullmatch(r"\d\d:\d\d:\d\d", clock) or side not in ("B", "S", "M"):
                raise ValueError(item)
            records.append({
                "seq": int(seq),
                "time": clock,
                "price": _tick_num(price, "price"),
                "change": _tick_num(change, "change"),
                "volume": _tick_num(volume, "volume"),
                "amount": _tick_num(amount, "amount"),
                "side": side,
            })
    except ValueError as exc:      # 字段数不对 / 序号不是整数 / 方向认不出：源格式变了，不是参数错
        raise RuntimeError(f"腾讯逐笔 {symbol} 第 {page} 页记录格式改变: {exc}") from exc
    return records


class TencentProvider(MarketProvider):
    name = "tencent"
    capabilities = frozenset({"quote", "kline", "transaction"})

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

        来源：腾讯 proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get，不封 IP，是
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
        # 无除权记录的标的腾讯不返回 qfqday/hfqday，仅返回 day（此时复权=不复权等价），
        # 需回退到 day，否则会被误判为空导致整只标的漏同步。
        if not rows and adjust != "none":
            rows = node.get("day") or []
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

    def transaction(self, symbol: str, date: str | None = None) -> list[TradeTick]:
        """当日逐笔成交（分笔）— 最近一个交易日的全部成交明细，沪深个股与 ETF。

        来源：腾讯 stock.gtimg.cn/data/index.php 成交明细，一页 70 笔翻到空页为止。
        约 3 秒一笔的分笔（同一时刻撮合的多笔合并成一笔），不是交易所 Level-2 逐笔；
        仅最近一个交易日、无历史；北交所与指数没有逐笔，直接抛 ValueError。

        side：B 主动买 / S 主动卖 / M 中性（集合竞价、盘后定价多为 M）；volume 单位
        「手」、amount 单位「元」。日期 date 给定时仅接受等于最近一个交易日，否则抛
        ValueError，交由 registry 降级链落到 mootdx（mootdx 支持指定历史日）。

        完整性核对：收盘后（两次快照成交额一致）会用行情快照的当日成交额核对连续竞价
        段（≤ 15:00:59）逐笔合计，差超过 0.1%+1000 元抛 RuntimeError；盘中成交额仍在
        变化，不做此核对。
        """
        prefix = get_prefix(symbol)
        ticker = norm_ticker(symbol)
        if prefix == "bj":
            raise ValueError("腾讯逐笔不支持北交所（返回空），北交所日线见 mootdx")
        if (prefix, ticker[:3]) in (("sh", "000"), ("sz", "399")):
            raise ValueError(f"{prefix}{ticker} 是指数，没有逐笔成交")
        full = prefix + ticker

        day, clock, amount_before = _qt_snapshot(full)
        req_date = norm_date(date)
        if req_date and req_date != day:
            raise ValueError(f"腾讯逐笔仅提供最近交易日 {day}，无法取 {req_date}（降级链将落到 mootdx）")
        if amount_before == 0:
            raise ValueError(f"{full} 在 {day} 没有成交（停牌、尚未开盘或集合竞价未撮合）")

        rows: list[dict] = []
        for page in range(_TICK_MAX_PAGES):
            records = _tick_page(full, page)
            if records is None:
                break
            for r in records:
                expected = rows[-1]["seq"] + 1 if rows else 0
                if r["seq"] < expected or (rows and r["time"] < rows[-1]["time"]):
                    raise RuntimeError(
                        f"腾讯逐笔 {full} 序号或时间倒退（第 {page} 页 {r['seq']} {r['time']}），结果不可信"
                    )
                if r["seq"] > expected and r["time"] <= _TICK_SESSION_END:
                    raise RuntimeError(
                        f"腾讯逐笔 {full} 缺序号 {expected}–{r['seq'] - 1}（第 {page} 页），"
                        "腾讯该页缓存不完整，稍后重试"
                    )
                rows.append(r)
            time.sleep(0.1)
        else:
            raise RuntimeError(f"腾讯逐笔 {full} 翻到第 {_TICK_MAX_PAGES} 页仍未结束，格式可能已变")

        if not rows:
            if clock < "092500":
                raise ValueError(f"{full} 集合竞价尚未撮合（{clock}），还没有逐笔")
            raise RuntimeError(
                f"{full} 在 {day} 成交 {amount_before:.0f} 元，腾讯逐笔却为空："
                "开盘前腾讯可能已清空上一交易日的明细，否则是接口变了"
            )

        day_after, _, amount_after = _qt_snapshot(full)
        if day_after != day:
            raise RuntimeError(f"取数期间交易日从 {day} 变成 {day_after}，请重试")
        session = sum(r["amount"] for r in rows if r["time"] <= _TICK_SESSION_END)
        # 两次快照成交额相同说明取数期间没有新成交（收盘后 / 午休 / 停牌），此时连续竞价段逐笔合计应与当日成交额相符
        if amount_after == amount_before and abs(session - amount_before) > amount_before * 0.001 + 1000:
            raise RuntimeError(
                f"腾讯逐笔 {full} 连续竞价段成交额 {session:.0f} 元，与行情快照 {amount_before:.0f} 元对不上，逐笔可能不全"
            )

        side_of = {"B": "buy", "S": "sell", "M": "neutral"}
        return [
            TradeTick(
                time=r["time"],
                price=r["price"],
                volume=r["volume"],
                side=side_of[r["side"]],
                date=day,
                code=full,
                seq=r["seq"],
                change=r["change"],
                amount=r["amount"],
            )
            for r in rows
        ]
