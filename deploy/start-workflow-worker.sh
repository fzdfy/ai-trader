#!/usr/bin/env bash
# ============================================================
#  AI Trader — 单独启动工作流 Worker 模块（workflow-worker）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/start-workflow-worker.sh [选项]

单独启动工作流 Worker（消费 workflow-run、维护定时触发和工作流历史），
依赖数据库与 quant。

选项:
  --build        启动前重新构建镜像
  -f, --follow   启动后跟随日志
  --no-deps      不自动拉起依赖服务
  -h, --help     显示本帮助

说明:
  容器名 aitrader-workflow-worker，无对外端口，命令为 worker:workflow。
EOF
}

parse_common_args usage "$@"

start_module workflow-worker postgres quant
follow_logs workflow-worker

echo ""
echo "Workflow Worker 已启动: aitrader-workflow-worker"
