# Verification

日期：2026-11-19

## 结果

| 项目 | 结果 |
|---|---|
| Web 测试 | 36/36 通过 |
| Server 测试 | 62 通过，6 个数据库类测试按环境变量跳过 |
| Admin 数据库集成测试 | 6/6 通过 |
| Web 类型检查 | 通过 |
| Server 类型检查 | 通过 |
| Web lint | 0 errors，6 个既有 warning |
| Server lint | 0 errors，18 个既有 warning |
| Web 生产构建 | 通过；仅保留既有大 chunk warning |
| OpenSpec strict | `add-super-admin-data-management` valid |
| 真实 API 权限 | 未登录 401；普通用户 403；超级管理员 200；旧同步 API 404 |

## 实际执行

```text
cd apps/web
node --test --experimental-strip-types
../../node_modules/.bin/tsgo -b --noEmit
../../node_modules/.bin/oxlint .
../../node_modules/.bin/vite build

cd apps/server
node --import @oxc-node/core/register --test "src/**/*.test.ts"
../../node_modules/.bin/tsgo -b --noEmit
../../node_modules/.bin/oxlint .
ADMIN_DB_TESTS=1 node --import @oxc-node/core/register \
  --test src/db/admin-schema.integration.ts \
  src/lib/admin-sync-lock.test.ts src/lib/admin-audit.test.ts

cd ../..
node_modules/.bin/openspec validate add-super-admin-data-management --strict
```

`pnpm --version` 在当前 Node 26 环境无输出并持续挂起，因此使用仓库内已安装的二进制执行同等检查。

## 真实请求

- `GET /api/v1/system/me`：测试超级管理员返回 `role: super_admin`。
- `GET /api/v1/data-management/tables`：超级管理员 200。
- `GET /api/v1/data-management/sources`：超级管理员 200。
- `GET /api/v1/data-management/quality`：超级管理员 200。
- `GET /api/v1/data-management/audit`：超级管理员 200。
- 无 Cookie 请求 `/api/v1/data-management/tables`：401。
- 普通用户请求 `/api/v1/data-management/tables`：403。
- 请求 `/api/v1/sync/status`：404。

视觉验收使用两个本地测试账号完成，验收后账号、账号会话和 OAuth 关联数据均已删除。

独立审查发现并已修复：未验证邮箱白名单提权、检查与任务预留的并发窗口、审计记录进程中断恢复、断档总数被展示上限截断、数据源降级状态缺失、多来源表错误关联 Provider 健康，以及审计页不显示操作者。对应回归测试已加入并通过。

## 截图

- [设计稿浅色桌面](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/design-light-desktop.png)
- [设计稿深色桌面](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/design-dark-desktop.png)
- [真实页面深色桌面](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/live-dark-desktop.png)
- [真实页面浅色桌面](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/live-light-desktop.png)
- [真实页面浅色移动端](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/live-light-mobile.png)
- [真实数据源页](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/sources-dark-desktop.png)
- [真实数据质量页](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/quality-dark-desktop.png)
- [真实数据同步页](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/sync-dark-desktop.png)
- [手动同步确认框](../../../docs/design/prototypes/explorations/screenshots/data-management-v1/sync-confirm-dark-desktop.png)

截图工具检查：无控制台错误、无横向溢出、无加载失败图片、无过小文字或对比度提示。

## 未执行项

- 未真正提交一次全市场手动同步或失败模块重试，避免在验收环境发起长时间外部行情拉取。同步状态机由审计集成测试覆盖；页面确认框只打开，没有点击最终确认。
- Provider 运行态在 quant 服务不可用时降级为注册表信息，并在页面显示“运行态暂不可用”；未单独模拟 quant 断网截图。
