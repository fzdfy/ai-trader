# 数据治理基线验证报告

验证日期：2026-11-19

## 结论

数据治理基线已按确认计划完成实现与验证：

- 代码注册表登记 100 个逻辑资产，覆盖数据库实际表、视图和 Agent 运行时资产；年度分区和 `bar1d_raw_default` 作为分区子表折叠到逻辑资产。
- 质量规则、质量结果、事故、治理任务和事件均有 PostgreSQL 证据表。
- Tier 0 严重质量失败、缺失/过期证据或未解决严重事故可参与研究门禁；当前策略保持 `warn`。
- `a-stock-data` 固定为项目实际采用的 `v3.7.1` 快照，并每日比较上游 commit、版本和 checksum。
- 超级管理员治理控制台包含总览、资产与契约、质量证据、来源标准、治理任务和数据事故。

## 自动化验证

| 检查 | 命令 | 结果 |
|---|---|---|
| Server 常规测试 | `node --import @oxc-node/core/register --test "src/**/*.test.ts"` | 108 tests，92 passed，16 个数据库用例按开关跳过，0 failed |
| Server 类型检查 | `../../node_modules/.bin/tsgo -b --noEmit` | 通过 |
| Server lint | `../../node_modules/.bin/oxlint .` | 0 errors，18 个既有 warning，治理新增文件无 warning |
| Server DB 集成 | `ADMIN_DB_TESTS=1 ... --test <7 个治理测试文件>` | 18 passed，0 failed |
| Web 测试 | `node --test --experimental-strip-types "src/**/*.test.ts"` | 37 passed，0 failed |
| Web 类型检查 | `../../node_modules/.bin/tsgo -b --noEmit` | 通过 |
| Web lint | `../../node_modules/.bin/oxlint .` | 0 errors，6 个既有 warning |
| Web 生产构建 | `../../node_modules/.bin/vite build` | 通过；仅保留既有大 chunk 提示 |
| OpenSpec | `node_modules/.bin/openspec validate add-data-governance-baseline --strict` | valid |
| Schema/目录漂移 | `node --env-file=../../.env.local --import @oxc-node/core/register scripts/check-governance.ts` | `governance registry and catalog are current` |
| 快照完整性 | `shasum -a 256 docs/external/.../SKILL.md` | 与 `metadata.json` 的 `5c4572...1973` 一致 |

数据库集成覆盖：

- Schema 状态约束和索引。
- 事故追加事件与非法状态转换。
- 同一严重质量失败的资产级事故幂等。
- 质量结果的规则版本、请求上下文和任务关联。
- 全部执行型质量检查 SQL。
- 来源标准同一 commit 的审阅任务去重。
- 破坏性来源变更完成前必须关联 OpenSpec change。
- 治理 API 权限、原因校验、任务动作和事故动作审计。
- 治理扫描写入 `job_run`。

## 视觉验证

真实浏览器截图位于：

- `docs/design/prototypes/explorations/screenshots/data-governance-production/final-light-desktop/`
- `docs/design/prototypes/explorations/screenshots/data-governance-production/final-dark-desktop/`
- `docs/design/prototypes/explorations/screenshots/data-governance-production/final-light-mobile/`
- `docs/design/prototypes/explorations/screenshots/data-governance-production/final-dark-mobile/`

资产、质量、来源标准、治理任务、数据事故和确认弹层另有桌面截图。检查结果：

- 无控制台错误、横向溢出或加载失败图片。
- 桌面和移动端、浅色和深色均通过文字尺寸、对比度和行高检查。
- 移动端页面级导航会换行，摘要使用两列，内容底部预留助手悬浮按钮安全区。
- 桌面总览保留一条“边框分组过多”的非阻塞提示，来自确认稿采用的状态模块和侧栏账号卡；未发现可用性或可读性失败。

本轮按 Native execution 执行，未派独立视觉评审子代理；视觉结果由截图工具和主执行者人工复核。该轮未发现需要继续修改的阻塞问题。

## 回滚与上线边界

- 上线顺序：默认 `warn` 影子运行 → 审核假阳性 → 切 `enforce`。
- 可通过 `DATA_GOVERNANCE_GATE_MODE=warn|off` 回退阻断，不删除质量结果、事故或治理任务。
- `off/warn/enforce`、Tier 0/1/2 和缺失规则/过期证据均有自动化用例。
- 来源标准变化不会自动修改生产 Provider、限流或降级配置；需要生产变更时另建 OpenSpec change。

## 已知限制

- 生产门禁仍为 `warn`，最终切换到 `enforce` 需要先完成真实扫描假阳性评审。
- 当前固定基线是 `v3.7.1`；上游最新 `v3.10.4` 只由巡检检测并创建审阅任务，不自动采用。
- 质量检查已在当前真实数据上执行全部 SQL，但空表、主键重复等破坏性数据异常没有通过篡改生产表制造独立夹具。
- 仓库当前没有既有 CI workflow；Schema/目录漂移检查已提供可执行脚本，接入外部 CI 需要后续在仓库托管平台配置 PostgreSQL 服务。
- 备份恢复边界已写入数据库标准，本轮未对真实生产数据执行破坏性恢复演练。
