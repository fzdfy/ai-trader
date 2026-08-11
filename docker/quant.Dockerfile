# ============================================================
#  Quant — Python FastAPI 回测微服务
# ============================================================
FROM python:3.14.7-alpine

# uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# 复制并安装 Python 依赖
COPY apps/quant/pyproject.toml apps/quant/
COPY apps/quant/uv.lock apps/quant/
RUN cd apps/quant && uv sync --frozen

# 复制源码
COPY apps/quant/ apps/quant/

EXPOSE 3002

CMD ["uv", "run", "--directory", "apps/quant", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
