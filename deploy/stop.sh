#!/usr/bin/env bash
# ============================================================
#  AI Trader — 停止服务（全部，或单个模块）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/stop.sh [模块]

停止全部服务，或仅停止指定模块。

模块（缺省为 all）:
  all      停止并移除全部容器（默认）
  db       数据库        → postgres
  server   API 服务      → server
  worker   同步 Worker   → worker
  quant    回测服务      → quant
  web      前端          → nginx

选项:
  -h, --help   显示本帮助

说明:
  停止单个模块使用 `docker compose stop`：保留容器，可用对应 start-*.sh 再次启动；
  停止全部使用 `docker compose down`：移除容器，数据卷 pgdata 保留。
EOF
}

case "${1:-all}" in
  -h|--help) usage; exit 0 ;;
  all|db|server|worker|quant|web) TARGET="${1:-all}" ;;
  *) fail "未知模块：${1}（使用 --help 查看用法）" ;;
esac

require_docker

if [ "$TARGET" = "all" ]; then
  info "停止所有容器..."
  docker compose down
  log "服务已全部停止"
  exit 0
fi

case "$TARGET" in
  db)  SVC="postgres" ;;
  web) SVC="nginx" ;;
  *)   SVC="$TARGET" ;;
esac

info "停止模块 $TARGET ($SVC) ..."
docker compose stop "$SVC"
log "模块 $TARGET 已停止"
