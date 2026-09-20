#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动数据同步 Worker 模块（worker）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-worker.sh [选项]

单独启动数据同步 Worker 模块（定时同步 A 股数据），依赖数据库。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  --no-deps      不自动拉起依赖服务（需自行保证 postgres 已运行）
  -h, --help     显示本帮助

说明:
  容器名 aitrader-worker，无对外端口，覆盖 command 为 worker:sync。
  与 server 共用镜像 docker/server.Dockerfile。依赖 postgres（默认自动拉起）。
EOF
}

parse_common_args usage "$@"

start_module worker postgres
follow_logs worker

echo ""
echo "Worker 已启动: aitrader-worker（后台定时同步）"
