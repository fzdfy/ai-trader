"""FastAPI routes for pure technical-signal evaluation."""

from __future__ import annotations

import asyncio
import hmac
import os
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool

from .catalog import CATALOG_VERSION
from .engine import evaluate_technical_signals
from .microstructure import evaluate_microstructure_signals
from .patterns import evaluate_pattern_signals
from .serialization import evaluation_to_contract


ObjectType = Literal["market", "sector", "stock", "gold"]


class SignalBar(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    amount: float | None = None


class SignalTick(BaseModel):
    time: str
    price: float
    volume: float
    amount: float
    direction: Literal["buy", "sell", "neutral"] = "neutral"


class SignalOrderBook(BaseModel):
    bid_depth: float
    ask_depth: float


class SignalObjectInput(BaseModel):
    object_type: ObjectType
    object_subtype: Literal["industry", "concept"] | None = None
    object_code: str = Field(min_length=1, max_length=40)
    as_of: str | None = None
    bars: list[SignalBar] = Field(min_length=1, max_length=2000)
    ticks: list[SignalTick] = Field(default_factory=list, max_length=100_000)
    order_book: SignalOrderBook | None = None

    @model_validator(mode="after")
    def validate_subtype(self) -> "SignalObjectInput":
        if self.object_type == "sector" and self.object_subtype is None:
            raise ValueError("sector objects require industry or concept subtype")
        if self.object_type != "sector" and self.object_subtype is not None:
            raise ValueError("non-sector objects require object_subtype=null")
        return self


class SignalEvaluateRequest(BaseModel):
    catalog_version: Literal["technical-signals-1.0.0"]
    computed_at: str
    timeout_ms: int = Field(default=10_000, ge=500, le=30_000)
    objects: list[SignalObjectInput] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_total_bar_budget(self) -> "SignalEvaluateRequest":
        if sum(len(item.bars) for item in self.objects) > 64_000:
            raise ValueError("batch exceeds the 64000 total bar budget")
        return self


def _evaluate_one(
    item: SignalObjectInput,
    *,
    computed_at: str,
) -> dict[str, Any]:
    bars = [bar.model_dump() for bar in item.bars]
    basic = evaluate_technical_signals(
        bars,
        object_type=item.object_type,
        object_subtype=item.object_subtype,
        object_code=item.object_code,
        as_of=item.as_of,
        computed_at=computed_at,
    )
    pattern_signals = evaluate_pattern_signals(
        bars,
        object_type=item.object_type,
        object_subtype=item.object_subtype,
        object_code=item.object_code,
        as_of=item.as_of,
        computed_at=computed_at,
    )
    micro_signals = (
        evaluate_microstructure_signals(
            bars,
            ticks=[tick.model_dump() for tick in item.ticks],
            order_book=(
                item.order_book.model_dump() if item.order_book is not None else None
            ),
            object_code=item.object_code,
            as_of=item.as_of or str(bars[-1]["time"])[:10],
            computed_at=computed_at,
        )
        if item.object_type == "stock"
        else []
    )
    return {
        **evaluation_to_contract(
            basic,
            [*pattern_signals, *micro_signals],
        ),
    }


def _evaluate_batch(request: SignalEvaluateRequest) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for item in request.objects:
        try:
            items.append(
                _evaluate_one(item, computed_at=request.computed_at)
            )
        except (ValueError, ArithmeticError) as error:
            errors.append(
                {
                    "object_code": item.object_code,
                    "object_type": item.object_type,
                    "error": str(error),
                }
            )
    return {
        "catalogVersion": CATALOG_VERSION,
        "computedAt": request.computed_at,
        "items": items,
        "errors": errors,
    }


signals_router = APIRouter(prefix="/api/v1/signals", tags=["technical-signals"])


def _require_internal_token(http_request: Request) -> None:
    expected = os.environ.get("QUANT_INTERNAL_TOKEN")
    if not expected:
        return
    supplied = http_request.headers.get("x-quant-internal-token", "")
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(401, "invalid internal quant token")


@signals_router.post("/evaluate")
async def evaluate_signals(
    request: SignalEvaluateRequest,
    http_request: Request,
) -> dict[str, Any]:
    request_id = getattr(http_request.state, "request_id", "-")
    _require_internal_token(http_request)
    try:
        return await asyncio.wait_for(
            run_in_threadpool(_evaluate_batch, request),
            timeout=request.timeout_ms / 1000,
        )
    except TimeoutError as error:
        raise HTTPException(
            504,
            {
                "error": "signal evaluation timed out",
                "request_id": request_id,
            },
        ) from error
