"""AI Trader Quant Service — FastAPI + AKQuant 回测微服务。"""
import os
from typing import Any

from akquant import AssetType
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data.router import router as data_router
from data_loader import (
    compute_market_trend,
    is_st_symbol,
    load_kline,
    load_raw_close,
    load_trade_day_index,
)
from engine import get_strategy_list, run
from factor_code import FactorCodeError
from factor_eval import evaluate_factor
from factor_validate import validate_factor_code_runnable, validate_factor_expression_runnable
from factors import get_factor_list
from feature_store import compute_features
from logger import get_logger
from middleware.request_id import RequestIdMiddleware
from research_reports import fetch_report_pdf, fetch_reports
from report_documents import (
    EMBEDDING_MODEL,
    EXTRACTOR_VERSION,
    chunk_pages,
    embed_texts,
    extract_pdf_pages,
    persist_report_pdf,
)
from screener import screen
from strategies import STRATEGIES
from strategies.composite import build_composite_strategy
from strategies.limit_matcher import LimitMatcher, compute_limit_sets

log = get_logger("main")

# 大盘过滤使用的基准指数（上证指数），复权日线视图中有其日线数据
MARKET_INDEX_SYMBOL = "000001.SH"


class BacktestRequest(BaseModel):
    symbol: str
    strategy: str
    params: dict[str, int] = {}
    # 自定义策略配置（strategy == "composite" 时使用）
    config: dict[str, Any] | None = None
    startDate: str | None = None
    endDate: str | None = None
    # PIT 复权：只采用 known_at <= asOf 的复权因子快照（"站在历史某时刻"回放）；
    # 缺省 None 即使用最新快照。当前仅有一个快照（2026-10-01），早于该时刻等价于不复权。
    asOf: str | None = None


class ScreenRequest(BaseModel):
    factors: list[dict[str, Any]] = []
    topN: int = 20
    symbols: list[str] | None = None
    combine: str = "weighted_sum"
    # 排除条件：smallCap（总市值<100亿）/ loss（市盈亏损）/ st / star（科创板）/ chinext（创业板）
    excludes: list[str] | None = None


class ValidateCodeRequest(BaseModel):
    code: str


class ValidateExpressionRequest(BaseModel):
    expression: str


class FactorEvalRequest(BaseModel):
    # 表达式因子（kind=expression）与 Python 代码因子（kind=python）二选一，code 优先
    expression: str = ""
    code: str | None = None
    horizon: int = 1
    layers: int = 5
    bars: int = 500
    maxSymbols: int = 800
    minSymbols: int = 20
    horizons: list[int] | None = None
    # 样本外占比（0~0.5）：>0 时按交易日切分样本内/样本外，另返回 valid 指标
    validRatio: float = 0.0
    # PIT 复权：只采用 known_at <= asOf 的复权因子快照（"站在历史某时刻"回放）；
    # 缺省 None 即使用最新快照。当前仅有一个快照（2026-10-01），早于该时刻等价于不复权。
    asOf: str | None = None


class ReportExtractRequest(BaseModel):
    pdf_url: str
    source_id: str
    publish_date: str
    ocr_language: str = "chi_sim+eng"
    max_chars: int = 4000
    overlap_chars: int = 500
    embed: bool = False


class ReportEmbedRequest(BaseModel):
    texts: list[str]


app = FastAPI(title="AI Trader Quant", version="0.1.0")

# Request ID 中间件（必须在 CORS 之前）
app.add_middleware(RequestIdMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 统一数据获取 API（多平台数据源 + 降级策略，返回 snake_case）
app.include_router(data_router, prefix="/api/v1/data")


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


@app.get("/api/v1/research/reports")
def list_research_reports(
    symbol: str,
    page: int = 1,
    page_size: int = 50,
    begin_time: str = "2020-01-01",
    end_time: str | None = None,
):
    """按标的获取东财研报元数据；所有请求走统一东财限流。"""
    try:
        return fetch_reports(
            symbol=symbol,
            page=max(1, page),
            page_size=min(max(page_size, 1), 100),
            begin_time=begin_time,
            end_time=end_time,
        )
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        log.error("研报元数据获取失败", error=str(error), symbol=symbol)
        raise HTTPException(502, "research report upstream failed") from error


@app.get("/api/v1/research/report-pdf")
def download_research_report_pdf(url: str):
    """受控代理研报 PDF；仅允许东财 PDF 域名。"""
    try:
        data = fetch_report_pdf(url)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        log.error("研报 PDF 下载失败", error=str(error))
        raise HTTPException(502, "research report PDF upstream failed") from error
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="research-report.pdf"'},
    )


@app.post("/api/v1/research/extract")
def extract_research_report(req: ReportExtractRequest):
    """下载、提取、OCR、分块；可选生成本地 BGE 向量。"""
    try:
        pdf = fetch_report_pdf(req.pdf_url)
        stored = persist_report_pdf(
            pdf,
            req.source_id,
            req.publish_date,
            os.environ.get("REPORTS_DATA_DIR", "/data/reports"),
        )
        pages = extract_pdf_pages(pdf, language=req.ocr_language)
        chunks = chunk_pages(pages, max_chars=req.max_chars, overlap_chars=req.overlap_chars)
        embeddings = embed_texts([chunk["text"] for chunk in chunks]) if req.embed and chunks else []
        return {
            "extractor_version": EXTRACTOR_VERSION,
            "embedding_model": EMBEDDING_MODEL if req.embed else None,
            **stored,
            "page_count": len(pages),
            "full_text": "\n\n".join(page["text"] for page in pages),
            "pages": pages,
            "chunks": [
                {
                    **chunk,
                    "embedding": embeddings[index] if index < len(embeddings) else None,
                }
                for index, chunk in enumerate(chunks)
            ],
        }
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        log.error("研报全文提取失败", error=str(error))
        raise HTTPException(500, f"research report extraction failed: {error}") from error


@app.post("/api/v1/research/embed")
def embed_research_texts(req: ReportEmbedRequest):
    try:
        vectors = embed_texts(req.texts)
        return {"model": EMBEDDING_MODEL, "vectors": vectors}
    except Exception as error:
        log.error("研报向量生成失败", error=str(error))
        raise HTTPException(500, f"embedding failed: {error}") from error


@app.post("/api/v1/backtests/run")
def run_backtest(req: BacktestRequest, request: Request) -> dict[str, Any]:
    request_id = getattr(request.state, "request_id", "-")

    df = load_kline(req.symbol, req.startDate, req.endDate, as_of=req.asOf)
    if df.empty:
        raise HTTPException(404, f"No data for {req.symbol}")

    # ST 状态影响涨跌停比例（限价撮合器需要），统一解析一次
    is_st = is_st_symbol(req.symbol)

    # 自定义多因子策略：通过 config JSON 构建 CompositeStrategy
    if req.strategy == "composite":
        if not req.config:
            raise HTTPException(400, "config is required for composite strategy")
        # 解析入场过滤所需的运行时上下文：大盘趋势
        entry = req.config.get("entry", {})
        market_trend: dict[str, bool] = {}
        if entry.get("marketFilter"):
            market_trend = compute_market_trend(
                MARKET_INDEX_SYMBOL, req.startDate, req.endDate, as_of=req.asOf
            )
        # 持仓时间上限按「自然交易日」计数：注入交易日历序号（停牌日无 bar 会被引擎
        # 跳过，只数 bar 会把持有期压短）。仅在启用 maxHoldingDays 时才查库。
        exit_cfg = req.config.get("exit", {})
        trade_day_index: dict[str, int] = {}
        if int(exit_cfg.get("maxHoldingDays", 0) or 0) > 0:
            trade_day_index = load_trade_day_index(req.startDate, req.endDate)
        strategy_cls = build_composite_strategy(
            req.config,
            symbol=req.symbol,
            is_st=is_st,
            market_trend=market_trend,
            trade_day_index=trade_day_index,
        )
    else:
        base_cls = _get_strategy_cls(req.strategy)
        strategy_cls = _apply_params(base_cls, req.params)

    cost = req.config.get("cost") if req.config else None

    # 涨跌停成交约束：在**原始价**空间按前收 ± 涨跌幅算出逐 bar 的涨停/跌停集合，
    # 交给自定义撮合器拦截「涨停买不进 / 跌停卖不出」。原引擎无此约束，会在涨跌停价
    # 照常成交；未命中涨跌停时该撮合器的成交口径与内置撮合器逐字段一致。
    raw_close = load_raw_close(req.symbol, req.startDate, req.endDate)
    limit_up, limit_down = compute_limit_sets(df, raw_close, req.symbol, is_st)
    matcher = LimitMatcher(cost, limit_up=limit_up, limit_down=limit_down)

    log.info(
        "回测开始",
        request_id=request_id,
        strategy=strategy_cls.__name__,
        symbol=req.symbol,
        params=req.params,
        limit_up_bars=len(limit_up),
        limit_down_bars=len(limit_down),
    )

    result = run(df, strategy_cls, cost=cost, custom_matchers={AssetType.Stock: matcher})

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
        excludes=req.excludes,
    )
    try:
        result = screen(req.factors, req.topN, req.symbols, req.combine, req.excludes)
        return {"success": True, **result}
    except Exception as e:
        log.error("选股失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Screen failed: {e}")


@app.post("/api/v1/factors/validate-code")
def validate_factor_code_endpoint(req: ValidateCodeRequest, request: Request) -> dict[str, Any]:
    """校验因子 Python 代码能否运行：AST 白名单 + 真实库小样本实际执行。"""
    request_id = getattr(request.state, "request_id", "-")
    log.info("因子代码运行校验", request_id=request_id, length=len(req.code or ""))
    try:
        return validate_factor_code_runnable(req.code)
    except Exception as e:
        log.error("因子代码运行校验失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Factor code validation failed: {e}")


@app.post("/api/v1/factors/validate-expression")
def validate_factor_expression_endpoint(
    req: ValidateExpressionRequest, request: Request
) -> dict[str, Any]:
    """校验因子表达式能否运行：AKQuant 引擎编译 + 真实库小样本实际求值。"""
    request_id = getattr(request.state, "request_id", "-")
    log.info("因子表达式运行校验", request_id=request_id, length=len(req.expression or ""))
    try:
        return validate_factor_expression_runnable(req.expression)
    except Exception as e:
        log.error("因子表达式运行校验失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Factor expression validation failed: {e}")


@app.post("/api/v1/factors/evaluate")
def evaluate_factor_endpoint(req: FactorEvalRequest, request: Request) -> dict[str, Any]:
    """因子检验：对表达式 / Python 代码因子做 IC / RankIC / ICIR / 分层回测 / 因子衰退。"""
    request_id = getattr(request.state, "request_id", "-")
    log.info(
        "因子检验开始",
        request_id=request_id,
        horizon=req.horizon,
        layers=req.layers,
        expressionLength=len(req.expression or ""),
        codeLength=len(req.code or ""),
    )
    try:
        result = evaluate_factor(
            req.expression,
            horizon=req.horizon,
            layers=req.layers,
            bars=req.bars,
            max_symbols=req.maxSymbols,
            min_symbols=req.minSymbols,
            horizons=req.horizons,
            valid_ratio=req.validRatio,
            code=req.code,
            as_of=req.asOf,
        )
        return {"success": True, **result}
    except FactorCodeError as e:
        log.warning("因子代码无效", request_id=request_id, error=str(e))
        raise HTTPException(400, f"Factor code invalid: {e}")
    except ValueError as e:
        log.warning("因子检验参数无效", request_id=request_id, error=str(e))
        raise HTTPException(400, f"Factor evaluation invalid: {e}")
    except Exception as e:
        log.error("因子检验失败", request_id=request_id, error=str(e))
        raise HTTPException(500, f"Factor evaluation failed: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}
