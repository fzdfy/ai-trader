"""AI Trader Quant Service — FastAPI + AKQuant 回测微服务。"""
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_loader import load_kline
from engine import get_strategy_list, run
from logger import get_logger
from middleware.request_id import RequestIdMiddleware
from strategies import STRATEGIES

log = get_logger("main")


class BacktestRequest(BaseModel):
    symbol: str
    strategy: str
    params: dict[str, int] = {}
    startDate: str | None = None
    endDate: str | None = None


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


@app.post("/api/v1/backtests/run")
def run_backtest(req: BacktestRequest, request: Request) -> dict[str, Any]:
    request_id = getattr(request.state, "request_id", "-")

    df = load_kline(req.symbol, req.startDate, req.endDate)
    if df.empty:
        raise HTTPException(404, f"No data for {req.symbol}")

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


@app.get("/health")
def health():
    return {"status": "ok"}
