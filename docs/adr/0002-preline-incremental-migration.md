# Preline 采用壳层优先的渐进迁移

## Status

accepted

## Context

前端已有大量旧组件库引用，并与认证、数据查询、图表和交互深度耦合。一次性逐页重写会同时改变多个稳定行为，难以验证和回滚。

## Decision

新增 Tailwind + Preline 后，先迁移全局壳、认证页和 `/home` 工作台；随后通过兼容 API 的 Preline 基础组件覆盖剩余业务路由，最后删除旧运行时与依赖。

## Consequences

过渡期会同时存在两套 UI 依赖和有限 CSS 差异。该成本换来可持续运行和可回滚的迁移，避免一次大规模不可验证重写。
