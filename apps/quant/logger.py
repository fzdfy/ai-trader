"""结构化日志配置（基于 structlog + stdlib logging）。

用法：
    from logger import get_logger
    log = get_logger("engine")
    log.info("回测开始", strategy="ma_cross")
    log.error("回测异常", exc_info=True,
"""

import logging
import os
import sys

import structlog

_LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
_LOG_FORMAT = os.getenv("LOG_FORMAT", "pretty")
_SERVICE_NAME = os.getenv("SERVICE_NAME", "quant")

logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
)

if _LOG_FORMAT == "json":
    # 生产模式：JSON 一行一条
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
else:
    # 开发模式：彩色人类可读
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(module: str, **extra: object) -> structlog.stdlib.BoundLogger:
    """创建带 module 字段的子 logger。

    Args:
        module: 模块标识（如 engine、kline、main）
        extra:  额外上下文字段（如 request_id）
    """
    return structlog.get_logger().bind(service=_SERVICE_NAME, module=module, **extra)
