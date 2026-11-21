# ai-trader

智能 A 股分析与策略平台（Docker Compose 全容器部署）。

## 架构

```
浏览器 → :80 (nginx)
           ├── /*         → dist/ 静态文件（SPA fallback）
           └── /api/*     → server:3001 (Hono API)
                              ├── postgres:5432 (数据库)
                              └── quant:3002 (回测)

worker       — 定时数据同步 → postgres:5432
```

## 部署到新机器

### 前置依赖

```bash
# macOS
brew install docker
# 启动 Docker Desktop 后再继续
```

### 一键部署

```bash
git clone <repo-url> ai-trader && cd ai-trader
chmod +x deploy/*.sh
./deploy/setup.sh

# 编辑 .env.local，填入：
#   DEEPSEEK_API_KEY=sk-...
#   BETTER_AUTH_SECRET=<随机64字符>

# 重启使环境变量生效
docker compose up -d
```

### 访问

| 地址 | 说明 |
|------|------|
| http://localhost:9080 | 前端页面 |
| http://localhost:9080/signup | 注册账号 |
| http://localhost:9080/health | API 健康检查 |
| http://localhost:3002/docs | quant API 文档 |

### 本地与公网环境

本地开发继续使用 `.env.local` 和默认 compose 命令，认证 Origin 默认为
`http://localhost:9080`：

```bash
docker compose up -d
```

通过 zrok 等反向代理提供公网访问时，使用独立的 `.env.public`，不要修改
`.env.local`：

```bash
cp .env.public.example .env.public
# 编辑 BETTER_AUTH_URL 和 AUTH_TRUSTED_ORIGINS

docker compose \
  --env-file .env.public \
  -f docker-compose.yml \
  -f docker-compose.public.yml \
  up -d
```

公网地址变化时只修改 `.env.public` 中两个精确 Origin，然后重新创建 server：

```bash
docker compose \
  --env-file .env.public \
  -f docker-compose.yml \
  -f docker-compose.public.yml \
  up -d --no-deps --force-recreate server
```

不要使用 `*.shares.zrok.io` 通配 Origin。需要长期稳定地址时，优先为 zrok
配置保留子域或自有域名。

### 容器管理

```bash
./deploy/start.sh           # 启动全部服务
./deploy/stop.sh            # 停止全部服务
docker compose logs -f      # 查看日志
./deploy/start.sh --build   # 重新构建并启动全部
docker compose restart server # 重启单个服务
```

### 按模块单独启动

每个模块都有独立的启动脚本，可单独启动/停止，互不影响：

| 脚本 | 模块 | 容器名 | 端口 | 依赖 |
|------|------|--------|------|------|
| `./deploy/start-db.sh` | 数据库（postgres + pgvector） | aitrader-postgres | 5432 | — |
| `./deploy/start-server.sh` | API 服务 | aitrader-server | 3001 | postgres |
| `./deploy/start-worker.sh` | 数据同步 Worker | aitrader-worker | — | postgres |
| `./deploy/start-quant.sh` | 回测微服务 | aitrader-quant | 3002 | postgres |
| `./deploy/start-web.sh` | 前端（nginx） | aitrader-nginx | 9080 | server |

```bash
./deploy/start-server.sh              # 启动 server（自动拉起 postgres）
./deploy/start-web.sh --build         # 重新构建并启动前端
./deploy/start-worker.sh -f           # 启动并跟随日志
./deploy/start-quant.sh --no-deps     # 不自动拉起依赖服务

./deploy/stop.sh db                   # 停止单个模块（db/server/worker/quant/web）
```

所有 `start-*.sh` 支持：`--build`（构建）、`-f/--follow`（跟随日志）、`--no-deps`（不自动拉起依赖）、`-h/--help`（帮助）。


## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（Docker 自动覆盖） | 是 |
| `BETTER_AUTH_SECRET` | 认证加密密钥 | 是 |
| `BETTER_AUTH_URL` | 当前环境的唯一认证 Origin；本地默认 `http://localhost:9080`，公网必须使用 HTTPS Origin | 是 |
| `AUTH_TRUSTED_ORIGINS` | Better Auth 与 CORS 共用的逗号分隔精确 Origin allowlist；公网 overlay 必填 | 公网必填 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI Agent） | 是 |
| `QUANT_URL` | 回测服务地址（Docker 自动覆盖） | 否 |

## 本地开发（非 Docker）

```bash
pnpm install
docker compose up -d postgres  # 仅启动数据库
pnpm db:migrate
pnpm dev                       # turbo dev + quant:dev
```
