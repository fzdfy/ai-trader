# ============================================================
#  Quant — Python FastAPI 回测微服务
# ============================================================
FROM python:3.14.7-alpine

# uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# 复制源码 + 依赖文件（.dockerignore 已排除 .venv/__pycache__）
COPY apps/quant/ apps/quant/

# 安装依赖
RUN cd apps/quant && uv sync --frozen

EXPOSE 3002

CMD ["uv", "run", "--directory", "apps/quant", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
