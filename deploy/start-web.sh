#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动前端模块（nginx：静态页面 + 反向代理）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-web.sh [选项]

单独启动前端模块（nginx 托管构建产物 + 反向代理 /api 到 server）。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  --no-deps      不自动拉起依赖服务（需自行保证 postgres、server 已运行）
  -h, --help     显示本帮助

说明:
  容器名 aitrader-nginx，端口 9080 → 容器 80。
  依赖 server（默认自动拉起，server 又会拉起 postgres）。
EOF
}

parse_common_args usage "$@"

start_module nginx postgres server
follow_logs nginx

echo ""
echo "前端已启动: http://localhost:9080"
echo "注册账号:   http://localhost:9080/signup"
