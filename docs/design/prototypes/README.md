# Visual Prototypes

本目录保存可重复预览的 HTML 原型，不直接作为生产代码。

## 目录

```text
docs/design/prototypes/
├── initial/
│   └── quant-workbench-assistant.html  # 已确认原稿快照，不直接修改
├── explorations/
│   └── quant-workbench-preline.html    # 继承原始稿主题的独立 Preline 探索稿
└── assets/
    ├── reference-workspace.png     # 用户提供的视觉参考
    ├── echarts.min.js
    └── mermaid.min.js
```

原始工作稿位于外部设计输出目录，仓库内保留 checksum 一致的快照：

```text
/Users/dakai/Documents/Codex/2026-11-15/ai-ui/outputs/quant-workbench-assistant.html
```

## 使用规则

1. 每次新设计先复制 `initial/` 或对应历史探索稿。
2. 只在 `explorations/` 中修改，保留历史稿。
3. 通过浏览器检查桌面、移动端、浅色和深色主题。
4. 设计确认后单独更新 `initial/` 基准。
5. 正式页面使用 Preline UI + Preline Theme，不直接复制静态原型代码。

## 预览

```bash
cd docs/design/prototypes
python3 -m http.server 9090
```

访问：

- `http://localhost:9090/initial/quant-workbench-assistant.html`
- `http://localhost:9090/explorations/quant-workbench-preline.html`

探索稿使用 Tailwind CSS 与 Preline CDN。正式应用使用 npm 包和 Vite 构建。

主题必须沿用 `initial/quant-workbench-assistant.html` 的原始 PULSE 色板与字体；参考图仅用于页面构成和信息密度，不替代原稿主题。
