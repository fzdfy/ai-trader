#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动回测微服务模块（quant）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-quant.sh [选项]

单独启动回测微服务模块（Python / FastAPI），依赖数据库。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  --no-deps      不自动拉起依赖服务（需自行保证 postgres 已运行）
  -h, --help     显示本帮助

说明:
  容器名 aitrader-quant，端口 3002。
  依赖 postgres（默认自动拉起）。
EOF
}

parse_common_args usage "$@"

start_module quant postgres
follow_logs quant

echo ""
echo "回测服务已启动: http://localhost:3002"
echo "接口文档:      http://localhost:3002/docs"
