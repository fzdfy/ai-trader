#!/usr/bin/env bash
# ============================================================
#  AI Trader — 一键部署脚本（Docker Compose 全容器）
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "============================================"
echo "  AI Trader 环境部署（Docker）"
echo "============================================"
echo ""

# ---- 1. 检查前置依赖 ----
log "检查前置依赖..."
command -v docker >/dev/null 2>&1 || fail "未安装 Docker，请先安装 Docker Desktop"

# ---- 2. 环境变量 ----
log "配置环境变量..."
if [ ! -f .env.local ]; then
  cp apps/server/.env.example .env.local
  warn "已从模板创建 .env.local，请填入 DEEPSEEK_API_KEY 和 BETTER_AUTH_SECRET"
fi

# ---- 3. 构建并启动所有容器 ----
log "构建 Docker 镜像..."
docker compose build

log "启动所有容器..."
docker compose up -d

log "等待数据库就绪..."
RETRY=0
until docker compose exec -T postgres pg_isready -U ai-trader 2>/dev/null; do
  sleep 2
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge 15 ]; then
    fail "PostgreSQL 启动超时"
  fi
done
log "PostgreSQL 已就绪"

# ---- 4. 数据库迁移 ----
log "执行数据库迁移..."
docker compose run --rm server pnpm --prefix apps/server db:migrate

# ---- 5. 同步基础数据 ----
log "同步 A 股标的字典..."
docker compose run --rm server pnpm --prefix apps/server sync:instruments

# ---- 完成 ----
echo ""
echo "============================================"
echo -e "${GREEN}  部署完成！${NC}"
echo "============================================"
echo ""
echo "  访问地址："
echo "    http://localhost       前端页面"
echo "    http://localhost/signup 注册账号"
echo ""
echo "  容器管理："
echo "    docker compose logs -f  查看日志"
echo "    docker compose down     停止所有容器"
echo "    docker compose up -d    重新启动"
echo ""
echo "  还需要在 .env.local 中填入："
echo "    DEEPSEEK_API_KEY=sk-...  （DeepSeek API Key）"
echo "    BETTER_AUTH_SECRET=...   （随机 64 字符密钥）"
echo ""
