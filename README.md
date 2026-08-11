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
| http://localhost | 前端页面 |
| http://localhost/signup | 注册账号 |
| http://localhost/health | API 健康检查 |
| http://localhost:3002/docs | quant API 文档 |

### 容器管理

```bash
docker compose up -d        # 启动
docker compose down         # 停止
docker compose logs -f      # 查看日志
docker compose up -d --build  # 重新构建
docker compose restart server # 重启单个服务
```

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（Docker 自动覆盖） | 是 |
| `BETTER_AUTH_SECRET` | 认证加密密钥 | 是 |
| `BETTER_AUTH_URL` | 认证服务地址（Docker 自动覆盖） | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI Agent） | 是 |
| `QUANT_URL` | 回测服务地址（Docker 自动覆盖） | 否 |

## 本地开发（非 Docker）

```bash
pnpm install
docker compose up -d postgres  # 仅启动数据库
pnpm db:migrate
pnpm dev                       # turbo dev + quant:dev
```
