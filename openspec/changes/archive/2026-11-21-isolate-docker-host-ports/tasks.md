# Tasks

Visual design: not applicable. 本变更不修改任何可见 UI 行为。

## 1. Docker 与本地端口隔离

- [x] 1.1 将 Docker 宿主机端口默认改为 9180/3101/3102/5532/3200/12445/3110，保持容器内部端口不变
- [x] 1.2 将 Docker 本地认证默认地址和 `.env.local` 数据库端口同步改为 9180/5532

## 2. 文档与脚本

- [x] 2.1 更新部署脚本、环境模板、README 和架构文档中的 Docker 端口
- [x] 2.2 重新生成前端知识文档

## 3. zrok 与运行环境

- [x] 3.1 按新端口重建并启动 Docker 栈
- [x] 3.2 将 zrok HTTP share 切到 9180，并同步公网认证地址

## 4. 验证

- [x] 4.1 验证本地与 Docker 端口合同及容器内部通信
- [x] 4.2 运行认证/CORS、server 全量、类型、lint 和格式检查
- [x] 4.3 验证本地 Web、公网 Web、可信/未知 Origin 和 5532 数据库连接，确认 zrok 不共享数据库
- [x] 4.4 写入 `verification.md`
