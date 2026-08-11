# ============================================================
#  Web + Nginx — 多阶段构建
#  Stage 1：vite build → dist/
#  Stage 2：nginx 托管静态文件 + /api 反向代理
# ============================================================

# ---- Stage 1：构建前端 ----
FROM node:24.19.0-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 一次性复制所有文件（避免 pnpm filter 丢失 workspace 依赖）
COPY . .

# 安装依赖 + 构建
RUN pnpm install --frozen-lockfile \
    && pnpm --prefix apps/web build

# ---- Stage 2：Nginx 托管 ----
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
