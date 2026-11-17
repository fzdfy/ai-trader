# UI 设计与 Preline 标准

## 工作流

1. `frontend-design` 或 `oil-ui` 确定视觉方向。
2. 原稿复制到 `docs/design/prototypes/explorations/` 后修改。
3. 用浏览器预览确认。
4. Preline UI + Preline Theme 实现。
5. Playwright 或浏览器截图完成视觉 QA。

## 原型

- `initial/` 保存基准稿。
- `explorations/` 保存独立探索稿。
- 不覆盖历史稿；确认后单独更新基准。
- `quant-workbench-assistant.html` 是原始资产，基准快照在 `docs/design/prototypes/initial/`，不得直接改写。

## 主题

- 主题以 `initial/quant-workbench-assistant.html` 为唯一视觉基准：暖白画布、蓝灰导航、白色内容面板、原始蓝主操作、黄色状态强调、A 股红涨绿跌。
- 核心 token：画布 `#f6f5f1`、导航 `#eef1f7`、面板 `#ffffff`、正文 `#202a42`、次文 `#727f98`、主色 `#3157e8`、强调 `#ffd951`。
- 字体沿用原稿的 `SF Pro Display` / `SF Pro Text` / `PingFang SC` 字体栈；数据数字使用等宽数字特性。
- 参考图只用于理解信息密度和页面构成，不作为主题色来源。
- 颜色、字体、间距、圆角、阴影使用语义 CSS 变量。
- `data-theme` 表示视觉主题，`.dark` 表示明暗模式。
- 首屏渲染前恢复主题，避免闪烁。
- 业务组件不得散落 raw hex。

## 页面

- 三区工作台：业务导航、主数据区、AI 助手。
- 密集数据用表格和行，不用同尺寸卡片堆叠。
- 主内容左对齐，操作优先级通过对比和留白表达。
- 移动端收敛为抽屉/单列，保持键盘和触控可用。

## 验收

- 浅色、深色和移动端截图无裁切、溢出或焦点丢失。
- Preline 交互在路由切换后正确初始化并在卸载时清理。
- 图标、图表和状态语义一致。
