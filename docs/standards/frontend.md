# 前端工程标准

## 基线

- React 19、TypeScript、Vite 6、TanStack Router、TanStack Query。
- UI：Tailwind CSS v4 + Preline UI。
- 服务端状态集中在业务域 hooks。
- Preline 负责 DOM 行为，React 负责渲染与业务状态。

## 结构与路由

- `src/routes/` 使用 TanStack 文件路由。
- 路由私有代码放同级 `-private/`。
- 复用 UI 组件放 `src/components/preline-ui/`；页面通过 `@preline-ui/*` 别名引用。
- 图表放 `src/components/charts/`。
- 请求与缓存放 `src/hooks/`，不得混入 Preline 实例状态。

## Preline

- 使用 `preline/non-auto`，在持有路由 `Outlet` 的布局中按 `pathname` 初始化。
- 组件自己创建的 Preline 实例必须在卸载时调用 `destroy()`。
- `cleanCollection()` 只清理注册表，不代替实例销毁。
- 不混用同一插件的完整包和单插件运行时。
- 客户端不能覆盖系统行为或可信身份。

## 样式与可访问性

- 使用 Preline 语义 token 和 Tailwind 工具类。
- 禁止页面散落 raw hex、rgb 和任意值颜色。
- 交互必须有键盘路径、可见焦点和语义化 ARIA。
- 响应式、reduced motion 和深浅主题是完成标准。
- 图表颜色从统一语义 token 读取。

## React 与性能

- 避免瀑布请求；独立请求并行化。
- 重组件和低频交互使用动态加载。
- 不创建只用于缩短函数的抽象。
- 列表 key 禁止使用数组索引。
- 长请求支持 `AbortSignal`。
- 变更后运行类型检查、oxlint 和生产构建。
