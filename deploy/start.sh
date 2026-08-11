#!/usr/bin/env bash
# ============================================================
#  AI Trader — 启动所有服务（Docker Compose）
#  访问：http://localhost
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "启动所有容器..."
docker compose up -d

echo ""
echo "访问 http://localhost"
echo ""
echo "docker compose logs -f  查看日志"
echo "docker compose down     停止所有容器"
