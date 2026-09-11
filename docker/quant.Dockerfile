# ============================================================
#  Quant — Python FastAPI 回测微服务
# ============================================================
# 基础镜像用 Debian slim（glibc）而非 Alpine（musl）：
# numpy/pandas/uvloop 等有 manylinux 预编译 wheel，避免源码编译拖慢构建。
FROM python:3.12-slim

# uv
RUN pip install --no-cache-dir uv

# 交易日历/时段判断依赖本地时区，统一用上海时区
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Shanghai

WORKDIR /app

# 先复制依赖清单并安装依赖（源码变动不会使依赖层缓存失效）
COPY apps/quant/pyproject.toml apps/quant/uv.lock apps/quant/
RUN cd apps/quant && uv sync --frozen --no-install-project

# 再复制源码
COPY apps/quant/ apps/quant/

# 安装项目自身（virtual 项目，几乎瞬时）
RUN cd apps/quant && uv sync --frozen

EXPOSE 3002

CMD ["uv", "run", "--directory", "apps/quant", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
