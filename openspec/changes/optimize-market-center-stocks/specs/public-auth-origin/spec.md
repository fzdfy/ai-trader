# Spec Delta

## ADDED Requirements

### Requirement: Local development allows loopback ports without widening public trust

Better Auth 与 CORS SHALL 在精确配置来源之外信任任意端口的 HTTP 本机回环来源，同时 SHALL NOT 信任局域网 IP、任意公网域名或伪装成 localhost 的域名。

#### Scenario: Vite uses any local port

- **WHEN** 浏览器从 `http://localhost:<port>`、`http://127.0.0.1:<port>` 或 `http://[::1]:<port>` 请求 API 或登录
- **THEN** Better Auth 和 CORS MUST 接受该请求的实际 Origin
- **AND** 响应的 `Access-Control-Allow-Origin` MUST 精确返回该回环 Origin

#### Scenario: Non-loopback origin tries to use the wildcard

- **WHEN** 请求 Origin 是局域网 IP、`localhost.evil.example` 或其他公网域名
- **THEN** 系统 MUST 拒绝该 Origin
- **AND** 公网部署 MUST 继续使用精确 allowlist
