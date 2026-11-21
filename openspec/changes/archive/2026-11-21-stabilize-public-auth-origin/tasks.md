# Tasks

> `[x]` 表示该任务本身的实现与对应测试完成；端到端验收以第 5 节为准。

Visual design: not applicable. 本变更没有可见 UI 行为变化。

## 1. Origin 解析与 allowlist

- [x] 1.1 新增 Origin 解析纯函数，验证逗号拆分、去空格、去末尾斜杠、去重、非法协议拒绝和默认本地回退
- [x] 1.2 新增 CORS Origin 决策函数，验证白名单命中返回原 Origin、未知 Origin 与 `null` Origin 不获许可

## 2. 认证与 CORS 接入

- [x] 2.1 将 Better Auth `trustedOrigins` 改为环境 allowlist，验证公网 Origin 可信而未知 Origin 不可信
- [x] 2.2 将 Hono CORS 改为同一 allowlist，验证不再反射任意 Origin 且保留 credentials

## 3. 本地与公网环境

- [x] 3.1 移除 compose 中 server/worker 的硬编码 `BETTER_AUTH_URL`，保持 `.env.local` 与默认本地启动行为不变
- [x] 3.2 新增 `.env.public` 忽略规则、`.env.public.example` 和 `docker-compose.public.yml`，验证公网配置只覆盖认证地址与 Origin
- [x] 3.3 更新部署文档，验证公网地址变化只需修改环境文件并重建 server

## 4. 反向代理

- [x] 4.1 更新 nginx 默认 server 名和转发头，验证 zrok 的 HTTPS 协议与 Host 到达 server

## 5. 验证

- [x] 5.1 运行 Origin 单元测试、server 全量测试、类型检查和 lint
- [x] 5.2 校验本地 compose 配置，确认 `.env.local` 与默认启动命令不变
- [x] 5.3 校验公网 compose overlay，确认只使用 `.env.public` 的公网认证值
- [x] 5.4 重建并验证公网 `/health`、可信 Origin CORS 和未知 Origin 拒绝
- [x] 5.5 将命令、结果、风险和未覆盖项写入 `verification.md`
