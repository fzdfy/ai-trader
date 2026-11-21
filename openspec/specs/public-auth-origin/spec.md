# public-auth-origin Specification

## Purpose

定义应用在本地与公网环境中使用唯一认证基准和精确受信任 Origin 的方式。该能力保证公网地址切换只影响部署配置，并保持本地开发行为不变。

## Requirements

### Requirement: Environment selects one auth origin

系统 SHALL 使用当前部署环境提供的一个 `BETTER_AUTH_URL` 作为唯一认证基准地址。

#### Scenario: Local development starts

- **WHEN** 使用默认 `.env.local` 启动 compose
- **THEN** 系统 MUST 保持现有本地认证行为
- **AND** 公网环境覆盖 MUST NOT 生效

#### Scenario: Public deployment starts

- **WHEN** 使用公网 compose overlay 和 `.env.public` 启动
- **THEN** `BETTER_AUTH_URL` MUST 等于配置的公网 HTTPS Origin
- **AND** 系统 MUST NOT 回退到 localhost

### Requirement: Trusted origins use an exact allowlist

Better Auth 和 CORS SHALL 使用同一份精确 Origin allowlist，不得反射任意 Origin。

#### Scenario: A configured public origin sends a request

- **WHEN** 浏览器 Origin 等于 `AUTH_TRUSTED_ORIGINS` 中的值
- **THEN** CORS MUST 允许携带凭据的请求
- **AND** Better Auth MUST 将该 Origin 视为可信

#### Scenario: An unknown origin sends a request

- **WHEN** 浏览器 Origin 不在 allowlist 中
- **THEN** CORS MUST NOT 返回该 Origin 的许可头
- **AND** Better Auth MUST 拒绝不可信 Origin

#### Scenario: No Origin header is present

- **WHEN** 非浏览器客户端请求 API
- **THEN** 系统 MUST 继续执行现有会话认证
- **AND** CORS 配置不得伪造 Origin

### Requirement: Public URL changes are configuration-only

公网地址变化 SHALL 通过环境配置完成，不修改应用源码或重新构建前端。

#### Scenario: zrok public hostname changes

- **WHEN** 运维更新 `.env.public` 中的 `BETTER_AUTH_URL` 和 `AUTH_TRUSTED_ORIGINS`
- **THEN** 重新创建 server 容器 MUST 使用新地址
- **AND** Web、数据库和 worker 业务代码 MUST NOT 需要修改

### Requirement: Reverse proxy preserves public protocol

nginx SHALL 向 server 传递公网请求的 Host 和原始 HTTP/HTTPS 协议。

#### Scenario: zrok terminates HTTPS

- **WHEN** zrok 通过 HTTP 转发到 nginx 并携带 HTTPS 转发信息
- **THEN** nginx MUST 向 server 传递 `X-Forwarded-Proto: https`
- **AND** MUST 传递公网 Host
