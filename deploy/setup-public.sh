#!/usr/bin/env bash
# ============================================================
#  AI Trader — 公网首次/完整部署（Docker Compose + .env.public）
# ============================================================
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
用法: ./deploy/setup-public.sh

使用 `.env.public` 和 `docker-compose.public.yml` 完整部署公网环境：
  - 校验公网认证 Origin
  - 构建并启动全部容器
  - 等待数据库、执行迁移和基础数据同步
  - 校验 server 容器实际使用公网认证配置

本地 Docker 部署继续使用：
  ./deploy/setup.sh

选项:
  -h, --help   显示本帮助
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi
if [ $# -gt 0 ]; then
  fail "未知参数：$1（使用 --help 查看用法）"
fi

require_docker
ensure_env

if [ ! -f .env.public ]; then
  warn "未找到 .env.public"
  info "请先执行：cp .env.public.example .env.public，并填写公网 Origin"
  fail "公网部署需要 .env.public"
fi

if [ ! -f docker-compose.public.yml ]; then
  fail "未找到 docker-compose.public.yml"
fi

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' .env.public
}

public_auth_url="$(read_env_value BETTER_AUTH_URL)"
public_origins="$(read_env_value AUTH_TRUSTED_ORIGINS)"
public_origins_compact="$(printf '%s' "$public_origins" | tr -d '[:space:]')"

if [[ "$public_auth_url" != https://* ]]; then
  fail "BETTER_AUTH_URL 必须是公网 HTTPS Origin：${public_auth_url:-<empty>}"
fi
if [[ "$public_auth_url" == */ ]]; then
  fail "BETTER_AUTH_URL 不能包含末尾斜杠：$public_auth_url"
fi
if [ -z "$public_origins_compact" ]; then
  fail "AUTH_TRUSTED_ORIGINS 不能为空"
fi
case ",$public_origins_compact," in
  *",$public_auth_url,"*) ;;
  *) fail "AUTH_TRUSTED_ORIGINS 必须包含 BETTER_AUTH_URL：$public_auth_url" ;;
esac

compose_public() {
  docker compose \
    --env-file .env.public \
    -f docker-compose.yml \
    -f docker-compose.public.yml \
    "$@"
}

log "校验公网 Compose 配置..."
compose_public config --quiet

log "构建 Docker 镜像..."
compose_public build

log "启动全部容器..."
compose_public up -d

info "等待数据库就绪..."
retry=0
until compose_public exec -T postgres pg_isready -U ai-trader >/dev/null 2>&1; do
  sleep 2
  retry=$((retry + 1))
  if [ "$retry" -ge 30 ]; then
    fail "PostgreSQL 启动超时"
  fi
done
log "PostgreSQL 已就绪"

log "执行数据库迁移..."
compose_public run --rm server pnpm --prefix apps/server db:migrate

log "同步 A 股标的字典..."
compose_public run --rm server pnpm --prefix apps/server sync:instruments

actual_auth_url="$(compose_public exec -T server printenv BETTER_AUTH_URL | tr -d '[:space:]')"
actual_origins="$(compose_public exec -T server printenv AUTH_TRUSTED_ORIGINS | tr -d '[:space:]')"

[ "$actual_auth_url" = "$public_auth_url" ] ||
  fail "server 实际 BETTER_AUTH_URL=$actual_auth_url，与 .env.public 不一致"
case ",$actual_origins," in
  *",$public_auth_url,"*) ;;
  *) fail "server 实际 AUTH_TRUSTED_ORIGINS 未包含 $public_auth_url" ;;
esac

echo ""
echo "============================================"
echo -e "${GREEN}  公网部署完成！${NC}"
echo "============================================"
echo ""
echo "  公网地址：$public_auth_url"
echo "  登录页面：$public_auth_url/login"
echo "  健康检查：$public_auth_url/health"
echo ""
echo "  认证配置已写入 server 容器。"
echo "  公网地址变化时只修改 .env.public，然后重跑本脚本。"
echo ""
