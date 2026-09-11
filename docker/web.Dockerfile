# ============================================================
#  Web + Nginx — 多阶段构建
#  Stage 1：vite build → dist/
#  Stage 2：nginx 托管静态文件 + /api 反向代理
# ============================================================

# ---- Stage 1：构建前端 ----
FROM node:24.19.0-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 先复制依赖清单，缓存依赖安装层（避免 pnpm filter 丢失 workspace 依赖）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/lint/package.json packages/lint/package.json

# 安装依赖
RUN pnpm install --frozen-lockfile

# 再复制源码并构建
COPY . .
RUN pnpm --prefix apps/web build

# ---- Stage 2：Nginx 托管 ----
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
