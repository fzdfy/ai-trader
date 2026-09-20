#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动数据库模块（postgres + pgvector）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-db.sh [选项]

单独启动数据库模块（PostgreSQL + pgvector）。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  -h, --help     显示本帮助

说明:
  容器名 aitrader-postgres，端口 5432。
  数据持久化在 docker volume `pgdata`，停止/重启容器不会丢失。
EOF
}

parse_common_args usage "$@"

start_module postgres
wait_for_postgres
follow_logs postgres

echo ""
echo "数据库已启动: localhost:5432 (db=aitrader, user=ai-trader)"
echo "连接串: postgres://ai-trader:aitrader123@localhost:5432/aitrader"
