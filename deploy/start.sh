#!/usr/bin/env bash
# ============================================================
#  AI Trader — 启动所有服务（Docker Compose）
#  访问：http://localhost:9080
#
#  只需启动某个模块时，请使用对应脚本：
#    ./deploy/start-db.sh     数据库
#    ./deploy/start-server.sh API 服务
#    ./deploy/start-worker.sh 同步 Worker
#    ./deploy/start-quant.sh  回测服务
#    ./deploy/start-web.sh    前端
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start.sh [选项]

启动全部服务（postgres / server / worker / quant / nginx）。

选项:
  --build        启动前重新构建所有镜像
  -f, --follow   启动后跟随日志（全部服务）
  -h, --help     显示本帮助

单独启动某模块请使用：
  ./deploy/start-db.sh     数据库
  ./deploy/start-server.sh API 服务
  ./deploy/start-worker.sh 同步 Worker
  ./deploy/start-quant.sh  回测服务
  ./deploy/start-web.sh    前端
EOF
}

parse_common_args usage "$@"

require_docker
ensure_env

if [ "$OPT_BUILD" -eq 1 ]; then
  info "构建全部镜像..."
  docker compose build
fi

info "启动所有容器..."
docker compose up -d

wait_for_postgres
log "全部服务已启动"

echo ""
echo "访问 http://localhost:9080"
echo ""
echo "docker compose logs -f  查看日志"
echo "docker compose down     停止所有容器"
echo ""

follow_logs
