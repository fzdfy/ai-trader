"""
数据层公共工具。

来源：a-stock-data skill「市场前缀规则 / Ticker 格式归一化 / mootdx 客户端」章节。
统一处理代码归一化、市场前缀判断与通达信客户端创建，供各数据源 provider 复用，
避免每个源各自实现一遍导致口径不一致。
"""
from __future__ import annotations

import socket

# 沪市指数白名单：与深市 000xxx 个股同号段，需靠白名单区分
# （沪深300 / 上证50 / 中证500 / 科创50 / 中证1000 / 上证180）
SH_INDEX = {"000300", "000905", "000016", "000688", "000852", "000010"}

# 实测可用通达信服务器（按延迟排序，2026-06 验证）
_TDX_SERVERS = [
    ("119.97.185.59", 7709),
    ("124.70.133.119", 7709),
    ("116.205.183.150", 7709),
    ("123.60.73.44", 7709),
    ("116.205.163.254", 7709),
    ("121.36.225.169", 7709),
    ("123.60.70.228", 7709),
    ("124.71.9.153", 7709),
    ("110.41.147.114", 7709),
    ("124.71.187.122", 7709),
]

# 统一浏览器 UA（HTTP 源通用，避免被识别为爬虫）
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def get_prefix(code: str) -> str:
    """6 位代码 → 市场前缀（sh/sz/bj），支持显式前缀/后缀透传。

    规则（顺序敏感）：
    - 后缀式（000016.SH）与前缀式（sh000016）等价透传；
    - 92 开头北交所新号段必须先于 9x 判断；
    - 5x/6x/9x → 沪；4x/8x → 北；白名单内 000xxx → 沪指数；
    - 其余（00/30/15/16/159/399 等）→ 深。
    """
    c = code.lower().strip()
    if c.endswith((".sh", ".sz", ".bj")):
        return c[-2:]
    if c.startswith(("sh", "sz", "bj")):
        return c[:2]
    if c.startswith("92"):
        return "bj"
    if c.startswith(("5", "6", "9")):
        return "sh"
    if c.startswith(("4", "8")):
        return "bj"
    if c in SH_INDEX:
        return "sh"
    return "sz"


def _natural_market(digits: str) -> str:
    """6 位码的自然归属市场，仅用于校验显式前缀是否自相矛盾。"""
    if digits.startswith("92") or digits[:2] in ("43", "83", "87"):
        return "bj"
    if digits[0] in ("5", "6", "9"):
        return "sh"
    return "sz"


def norm_ticker(code: str) -> str:
    """任意受支持写法 → 纯 6 位数字代码。

    支持 600519 / SH600519 / sh600519 / 600519.SH / BJ920982 等。
    不匹配时抛 ValueError（绝不静默返回空串或猜一个代码）。
    """
    import re

    raw = str(code).strip()
    m = re.match(
        r"^(?:(sh|sz|bj)(\d{6})|(\d{6})(?:\.(sh|sz|bj))?)$",
        raw,
        re.IGNORECASE,
    )
    if not m:
        raise ValueError(
            f"无法把 {code!r} 解析为 6 位股票代码；"
            f"支持格式：600519 / SH600519 / sh600519 / 600519.SH"
        )
    digits = m.group(2) or m.group(3)
    market = (m.group(1) or m.group(4) or "").lower()
    if market:
        if digits.startswith("000"):
            # 000xxx 是沪市指数 / 深市个股共用歧义段，显式标识是「消歧」而非「矛盾」，
            # 但 000xxx 不属北交所，需拦截。
            if market == "bj":
                raise ValueError(f"{code!r} 市场标识与号段矛盾：000xxx 不属北交所。")
        else:
            nat = _natural_market(digits)
            if market != nat:
                raise ValueError(
                    f"{code!r} 的市场标识与号段矛盾：{digits} 属 {nat} 市，而不是 {market} 市。"
                )
    return digits


def _probe(ip: str, port: int, timeout: float = 2.0) -> bool:
    """TCP 握手探测（快速粗筛，握手成功 ≠ 能取数，还需 _validate 验活）。"""
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def _validate(client, market: str = "std") -> bool:
    """真实取数验活：坏服务器可 TCP 握手通过却回空 body，用一次真实 K 线请求兜底。"""
    if market != "std":
        return True
    try:
        df = client.bars(symbol="000001", frequency=9, offset=1)
        return df is not None and not df.empty
    except Exception:
        return False


def tdx_client(market: str = "std"):
    """创建 mootdx 客户端，规避 0.11.x BESTIP.HQ 空串 bug + 坏服务器静默空表。

    顺序：逐个探测 _TDX_SERVERS → bestip 测速 → 裸 factory，全部失败抛 RuntimeError。
    """
    from mootdx.quotes import Quotes

    for ip, port in _TDX_SERVERS:
        if not _probe(ip, port):
            continue
        try:
            client = Quotes.factory(market=market, server=(ip, port))
            if _validate(client, market):
                return client
        except Exception:
            continue
    for kwargs in ({"bestip": True}, {}):
        try:
            client = Quotes.factory(market=market, **kwargs)
            if _validate(client, market):
                return client
        except Exception:
            continue
    raise RuntimeError(
        "所有 mootdx 服务器均无法取到数据（TCP 可达但返回空 / 被 reset）。"
        "海外网络通常全部超时（TCP 7709），请走国内代理或更新 _TDX_SERVERS。"
    )
