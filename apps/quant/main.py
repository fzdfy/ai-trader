"""AI Trader Quant Service — FastAPI + AKQuant 回测微服务。"""
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_loader import compute_market_trend, is_st_symbol, load_kline
from engine import get_strategy_list, run
from factors import get_factor_list
from feature_store import compute_features
from logger import get_logger
from middleware.request_id import RequestIdMiddleware
from screener import screen
from strategies import STRATEGIES
from strategies.composite import build_composite_strategy

log = get_logger("main")

# 大盘过滤使用的基准指数（上证指数），bar1d_adj 中有其日线数据
MARKET_INDEX_SYMBOL = "000001.SH"


class BacktestRequest(BaseModel):
    symbol: str
    strategy: str
    params: dict[str, int] = {}
    # 自定义策略配置（strategy == "composite" 时使用）
    config: dict[str, Any] | None = None
    startDate: str | None = None
    endDate: str | None = None


class ScreenRequest(BaseModel):
    factors: list[dict[str, Any]] = []
    topN: int = 20
    symbols: list[str] | None = None
    combine: str = "weighted_sum"


app = FastAPI(title="AI Trader Quant", version="0.1.0")

# Request ID 中间件（必须在 CORS 之前）
app.add_middleware(RequestIdMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _get_strategy_cls(name: str) -> type:
    for s in STRATEGIES:
        if s["name"] == name:
            return s["cls"]
    raise HTTPException(400, f"Unknown strategy: {name}")


def _apply_params(cls: type, params: dict[str, int]) -> type:
    """子类化覆盖类属性。"""
    if not params:
        return cls
    overrides = {k: v for k, v in params.items() if not k.startswith("_")}
    return type(cls.__name__, (cls,), overrides)


@app.get("/api/v1/strategies")
def list_strategies():
    return {"strategies": get_strategy_list()}


@app.get("/api/v1/factors")
def list_factors():
    return {"factors": get_factor_list()}


@app.post("/api/v1/backtests/run")
def run_backtest(req: BacktestRequest, request: Request) -> dict[str, Any]:
    request_id = getattr(request.state, "request_id", "-")

    df = load_kline(req.symbol, req.startDate, req.endDate)
    if df.empty:
        raise HTTPException(404, f"No data for {req.symbol}")

    # 自定义多因子策略：通过 config JSON 构建 CompositeStrategy
    if req.strategy == "composite":
        if not req.config:
            raise HTTPException(400, "config is required for composite strategy")
        # 解析入场过滤所需的运行时上下文：ST 状态 + 大盘趋势
        entry = req.config.get("entry", {})
        # ST 状态在 ST 过滤或涨跌停过滤时都需要（涨跌停比例依赖是否 ST）
        need_st = bool(entry.get("stFilter") or entry.get("limitFilter"))
        is_st = is_st_symbol(req.symbol) if need_st else False
        market_trend: dict[str, bool] = {}
        if entry.get("marketFilter"):
            market_trend = compute_market_trend(MARKET_INDEX_SYMBOL, req.startDate, req.endDate)
        strategy_cls = build_composite_strategy(
            req.config, is_st=is_st, market_trend=market_trend
        )
    else:
        base_cls = _get_strategy_cls(req.strategy)
        strategy_cls = _apply_params(base_cls, req.params)

    log.info(
        "回测开始",
        request_id=request_id,
        strategy=strategy_cls.__name__,
        symbol=req.symbol,
        params=req.params,
    )

    result = run(df, strategy_cls)

    # 注入 symbol / strategy 到 report 块
    result.setdefault("report", {})
    result["report"]["symbol"] = req.symbol
    result["report"]["strategy"] = req.strategy
    return result


@app.post("/api/v1/features/compute")
def compute_features_endpoint(request: Request) -> dict[str, Any]:
    """触发因子预计算：对自选股重算因子并写入 feature_value 表。"""
    request_id = getattr(request.state, "request_id", "-")
    log.info("因子计算触发", request_id=request_id)
    try:
        stats = compute_features()
        return {"success": True, **stats}
    except Exception as e:
        log.error("因子计算失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Feature computation failed: {e}")


@app.post("/api/v1/screens/run")
def run_screen(req: ScreenRequest, request: Request) -> dict[str, Any]:
    """选股：按策略因子对股票池打分并返回 Top N。"""
    request_id = getattr(request.state, "request_id", "-")
    log.info(
        "选股开始",
        request_id=request_id,
        factors=[f.get("name") for f in req.factors],
        top_n=req.topN,
    )
    try:
        result = screen(req.factors, req.topN, req.symbols, req.combine)
        return {"success": True, **result}
    except Exception as e:
        log.error("选股失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Screen failed: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}
