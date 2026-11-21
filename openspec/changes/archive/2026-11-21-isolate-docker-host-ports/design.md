# Design

完整方案见 `docs/superpowers/specs/2026-11-21-docker-host-port-isolation-design.md`。

## Decisions

- Docker 宿主机端口默认统一 +100。
- Compose 使用逐项变量，不实现端口算术。
- zrok HTTP 切换到新 Web 端口。
- 数据库不创建 TCP share。
- 容器内部端口、Dockerfile 和服务名保持不变。
- 本地 `.env.local` 的数据库连接改为 5532。

## Risks

- zrok 公网 share 重启可能产生新的随机公网地址。
- 本地和 Docker 都监听 `localhost` 时，Cookie 不区分端口。
- 固定 `container_name` 仍阻止两台主 Compose 栈并存。

## Review Result

- **Status**: approved
- **Reviewer**: user confirmation + Codex self-review
- **Date**: 2026-11-21
- **Blocking issues**: none
- **Residual risk**: 公网地址可能因 zrok share 重启而变化。
