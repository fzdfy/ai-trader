"""数据源注册表 + 降级选择。

按「能力 → 首选源 → 备选源」维护降级链，router 通过 `call_with_fallback`
面向统一接口取数：首选源失败自动落到备选源，全部失败才抛错。

优先级原则（沿用 a-stock-data skill）：能用通达信(mootdx)/腾讯就别用东财——
行情 / K 线 / 实时价 / 市值走 mootdx / 腾讯 / 百度等不封 IP 源；东财仅用于其
「独有、别处拿不到」的数据（板块资金流 / 龙虎榜 / 解禁 / 融资融券 / 研报等），
并统一走 _em_get 串行限流防封。

增删平台：在 `_PROVIDER_CLASSES` 登记 provider 类、在 `_CAPABILITY_PRIORITY`
声明其能力优先级即可，无需改动 router 或各 provider 实现。
"""
from __future__ import annotations

from .base import (
    CAPABILITY_ADJUST_FACTOR,
    CAPABILITY_BLOCK_TRADE,
    CAPABILITY_BOARD_CONSTITUENTS,
    CAPABILITY_BOARD_FUND_FLOW,
    CAPABILITY_BOARD_KLINE,
    CAPABILITY_BOARD_LIST,
    CAPABILITY_CHIP_DISTRIBUTION,
    CAPABILITY_CONCEPT_BLOCKS,
    CAPABILITY_DAILY_DRAGON_TIGER,
    CAPABILITY_DIVIDEND_HISTORY,
    CAPABILITY_DRAGON_TIGER,
    CAPABILITY_FUND_FLOW_120D,
    CAPABILITY_FUND_FLOW_MINUTE,
    CAPABILITY_FUND_FLOW_RANK,
    CAPABILITY_HOLDER_NUM,
    CAPABILITY_HOT_REASON,
    CAPABILITY_INDUSTRY_COMPARISON,
    CAPABILITY_KLINE,
    CAPABILITY_LIMIT_UP_POOL,
    CAPABILITY_LOCKUP_EXPIRY,
    CAPABILITY_MARGIN_TRADING,
    CAPABILITY_NORTHBOUND,
    CAPABILITY_QUOTE,
    CAPABILITY_TRANSACTION,
    MarketProvider,
)
from .providers import (
    BaiduProvider,
    EastmoneyProvider,
    MootdxProvider,
    SinaProvider,
    TencentProvider,
    ThsProvider,
)

# 全部数据源实例（惰性创建，避免未安装依赖时 import 即崩）
_PROVIDER_CLASSES: dict[str, type[MarketProvider]] = {
    "mootdx": MootdxProvider,
    "tencent": TencentProvider,
    "baidu": BaiduProvider,
    "sina": SinaProvider,
    "ths": ThsProvider,
    "eastmoney": EastmoneyProvider,
}

_instances: dict[str, MarketProvider] = {}

# 每类能力的首选顺序（降级链）
_CAPABILITY_PRIORITY: dict[str, list[str]] = {
    # K 线：腾讯主（日线，支持前复权 qfq/后复权 hfq，见 kline 的 adjust 参数；
    # 非日线 tf 腾讯会抛错，自动降级到 mootdx）→ mootdx 备（多周期，不复权，不封 IP）
    # → 百度备（日线带 MA，不复权）。不再走东财（K 线非东财独有，push2his 有风控会封 IP）。
    CAPABILITY_KLINE: ["tencent", "mootdx", "baidu"],
    CAPABILITY_QUOTE: ["tencent", "mootdx"],
    # 逐笔：腾讯主（tencent_ticks，约 3 秒一笔的分笔，仅最近一个交易日）→ mootdx 备
    # （自 2026-09 起 transaction 返回空，且腾讯逐笔不支持北交所 / 历史日时由其兜底）。
    CAPABILITY_TRANSACTION: ["tencent", "mootdx"],
    CAPABILITY_ADJUST_FACTOR: ["sina"],
    # 信号层（Layer 3）
    CAPABILITY_HOT_REASON: ["ths"],
    CAPABILITY_NORTHBOUND: ["ths"],
    CAPABILITY_CONCEPT_BLOCKS: ["eastmoney"],
    CAPABILITY_FUND_FLOW_MINUTE: ["eastmoney"],
    CAPABILITY_DRAGON_TIGER: ["eastmoney"],
    CAPABILITY_LOCKUP_EXPIRY: ["eastmoney"],
    CAPABILITY_INDUSTRY_COMPARISON: ["eastmoney"],
    CAPABILITY_BOARD_FUND_FLOW: ["eastmoney"],
    CAPABILITY_DAILY_DRAGON_TIGER: ["eastmoney"],
    CAPABILITY_BOARD_LIST: ["eastmoney"],
    CAPABILITY_BOARD_CONSTITUENTS: ["eastmoney"],
    CAPABILITY_BOARD_KLINE: ["eastmoney"],
    CAPABILITY_FUND_FLOW_RANK: ["eastmoney"],
    CAPABILITY_LIMIT_UP_POOL: ["eastmoney"],
    # 资金面 / 筹码层（Layer 4）
    CAPABILITY_MARGIN_TRADING: ["eastmoney"],
    CAPABILITY_BLOCK_TRADE: ["eastmoney"],
    CAPABILITY_HOLDER_NUM: ["eastmoney"],
    CAPABILITY_DIVIDEND_HISTORY: ["eastmoney"],
    CAPABILITY_FUND_FLOW_120D: ["eastmoney"],
    CAPABILITY_CHIP_DISTRIBUTION: ["eastmoney"],
}


def get_provider(name: str) -> MarketProvider:
    """按名取 provider 实例（惰性创建）。"""
    if name not in _instances:
        cls = _PROVIDER_CLASSES[name]
        _instances[name] = cls()
    return _instances[name]


def providers_for(capability: str) -> list[MarketProvider]:
    """返回支持某能力的 provider 列表（按降级优先级排序）。"""
    out: list[MarketProvider] = []
    for name in _CAPABILITY_PRIORITY.get(capability, []):
        provider = get_provider(name)
        if capability in provider.capabilities:
            out.append(provider)
    return out


def all_provider_names() -> list[str]:
    """已登记的全部数据源名（供 /sources 端点枚举）。"""
    return list(_PROVIDER_CLASSES.keys())


def call_with_fallback(capability: str, method: str, *args, **kwargs):
    """按降级链依次调用 provider 方法，全部失败抛最后一个异常。"""
    providers = providers_for(capability)
    if not providers:
        raise RuntimeError(f"没有数据源支持能力 {capability}")
    last_error: Exception | None = None
    for provider in providers:
        try:
            return getattr(provider, method)(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — 任一源失败都尝试下一个源
            last_error = exc
    raise last_error  # type: ignore[misc]
