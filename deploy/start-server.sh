#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动 API 服务模块（server）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-server.sh [选项]

单独启动 API 服务模块（Hono API），依赖数据库。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  --no-deps      不自动拉起依赖服务（需自行保证 postgres 已运行）
  -h, --help     显示本帮助

说明:
  容器名 aitrader-server，端口 3001。
  依赖 postgres（默认自动拉起）。
EOF
}

parse_common_args usage "$@"

start_module server postgres
follow_logs server

echo ""
echo "API 已启动: http://localhost:3001"
echo "健康检查:  http://localhost:3001/health"
