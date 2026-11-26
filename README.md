# ai-trader

智能 A 股分析与策略平台（Docker Compose 全容器部署）。

## 架构

```
浏览器 → Docker :9180 / 本地 Vite :9080 (nginx)
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

### 本地 Docker 一键部署

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
| http://localhost:9180 | Docker 前端页面 |
| http://localhost:9180/signup | Docker 注册账号 |
| http://localhost:9180/health | Docker API 健康检查 |
| http://localhost:3102/docs | Docker quant API 文档 |

### 本地与公网环境

本地开发继续使用 9080/3001/3002/5432。Docker 部署默认使用
9180/3101/3102/5532，可同时运行。根目录 `docker-compose.yml` 使用同一套认证
配置同时支持本机和当前 zrok 地址：

```dotenv
BETTER_AUTH_URL=http://localhost:9180
AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost
```

```bash
docker compose up -d
```

公网 zrok 地址变化时，更新 `docker-compose.yml` 中的精确
`AUTH_TRUSTED_ORIGINS`，然后重新创建 server。不要使用
`*.shares.zrok.io` 通配 Origin，也不要通过单独的 public overlay 或环境文件覆盖。

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
| `./deploy/start-db.sh` | 数据库（postgres + pgvector） | aitrader-postgres | 5532 | — |
| `./deploy/start-server.sh` | API 服务 | aitrader-server | 3101 | postgres |
| `./deploy/start-worker.sh` | 数据同步 Worker | aitrader-worker | — | postgres |
| `./deploy/start-quant.sh` | 回测微服务 | aitrader-quant | 3102 | postgres |
| `./deploy/start-web.sh` | 前端（nginx） | aitrader-nginx | 9180 | server |

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
| `BETTER_AUTH_URL` | Docker 部署固定为 `http://localhost:9180` | 是 |
| `AUTH_TRUSTED_ORIGINS` | Better Auth 与 CORS 共用的精确 Origin allowlist；当前为 zrok 域名和 localhost | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI Agent） | 是 |
| `QUANT_URL` | 回测服务地址（Docker 自动覆盖） | 否 |

Docker 宿主机端口可通过 `DOCKER_WEB_PORT`、`DOCKER_SERVER_PORT`、
`DOCKER_QUANT_PORT`、`DOCKER_POSTGRES_PORT`、`DOCKER_LOKI_PORT`、
`DOCKER_ALLOY_PORT` 和 `DOCKER_GRAFANA_PORT` 覆盖。容器内部端口不受影响。

## 本地开发（非 Docker）

```bash
pnpm install
docker compose up -d postgres  # Docker 数据库发布在 localhost:5532
pnpm db:migrate
pnpm dev                       # turbo dev + quant:dev
```
