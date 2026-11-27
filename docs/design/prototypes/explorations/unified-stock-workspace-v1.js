(() => {
  const root = document.querySelector("#workspace-root");
  const params = new URLSearchParams(location.search);
  const allowedStates = new Set([
    "quick",
    "research",
    "loading",
    "error",
    "partial",
    "market-missing",
  ]);

  let state = allowedStates.has(params.get("state"))
    ? params.get("state")
    : "quick";
  const focusTarget = params.get("focus");

  const candles = [
    [79.4, 80.1, 78.8, 79.7],
    [79.6, 79.9, 78.4, 78.8],
    [78.7, 79.3, 78.1, 79.0],
    [79.0, 79.8, 78.6, 79.5],
    [79.4, 80.0, 78.9, 78.9],
    [79.0, 79.4, 77.8, 78.2],
    [78.1, 79.1, 77.9, 78.9],
    [78.9, 79.2, 77.4, 77.8],
    [77.7, 78.5, 77.1, 78.3],
    [78.4, 79.0, 77.8, 78.8],
    [78.8, 79.5, 78.1, 79.2],
    [79.1, 79.7, 78.3, 78.5],
    [78.6, 79.4, 77.9, 79.0],
    [79.0, 80.2, 78.7, 79.9],
    [80.0, 80.6, 79.1, 79.4],
    [79.3, 79.9, 78.2, 78.7],
    [78.8, 79.1, 77.6, 77.9],
    [77.8, 78.6, 77.2, 78.3],
    [78.2, 79.0, 77.7, 78.8],
    [78.9, 79.7, 78.3, 79.4],
    [79.3, 79.8, 78.1, 78.5],
    [78.6, 78.9, 77.1, 77.5],
    [77.4, 78.2, 76.9, 78.0],
    [77.9, 78.5, 77.2, 77.6],
    [77.7, 78.1, 76.5, 76.8],
    [76.8, 77.6, 76.3, 77.4],
    [77.3, 77.8, 76.2, 76.5],
    [76.6, 76.9, 74.9, 75.3],
    [75.4, 76.1, 74.8, 75.8],
    [75.7, 76.0, 74.4, 74.8],
    [74.7, 75.2, 73.9, 74.4],
    [74.5, 75.0, 73.8, 74.8],
    [74.8, 75.1, 73.6, 73.9],
    [74.0, 74.5, 73.4, 74.2],
    [74.1, 74.6, 73.2, 73.6],
    [73.5, 74.0, 73.1, 73.62],
  ];

  function icon(name) {
    const paths = {
      star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
      compare:
        '<path d="M8 7h8l-2-2"/><path d="m16 7-2 2"/><path d="M16 17H8l2-2"/><path d="m8 17 2 2"/>',
      refresh:
        '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      alert:
        '<path d="m12 3 9 16H3Z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
      chart:
        '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
      signal:
        '<path d="M4 17h3l2-7 4 10 2-6h5"/><path d="M4 7h4"/>',
      trend:
        '<path d="m3 15 5-5 4 4 8-8"/><path d="M15 6h5v5"/>',
      calendar:
        '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/>',
    };
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
  }

  function miniCandleChart({ compact = false, empty = false } = {}) {
    if (empty) {
      return `<div class="chart-empty" role="status">
        <div>
          <strong>K 线暂不可用</strong>
          <p>行情接口未返回本轮快照；深度研究数据独立展示，不使用研究接口中的报价替代实时行情。</p>
          <button class="action-button" type="button">重新加载行情</button>
        </div>
      </div>`;
    }

    const width = compact ? 430 : 920;
    const height = compact ? 260 : 292;
    const left = compact ? 30 : 48;
    const right = width - (compact ? 14 : 58);
    const top = 20;
    const chartBottom = compact ? 182 : 205;
    const volumeTop = compact ? 195 : 220;
    const volumeBottom = compact ? 239 : 265;
    const axisY = compact ? 253 : 283;
    const visible = compact ? candles.slice(-26) : candles;
    const min = 72.8;
    const max = 81;
    const innerWidth = right - left;
    const step = innerWidth / visible.length;
    const bodyWidth = Math.max(4, Math.min(compact ? 5.5 : 8, step * 0.58));

    const x = (index) => left + step * (index + 0.5);
    const y = (price) =>
      top + ((max - price) / (max - min)) * (chartBottom - top);
    const volumeY = (bar) => {
      const volume = Math.max(16, (bar[1] - bar[2]) * 120 + 48);
      return volumeBottom - Math.min(volumeBottom - volumeTop, volume);
    };

    const gridPrices = compact ? [80, 77, 74] : [80, 77, 74];
    const grid = gridPrices
      .map((price) => {
        const lineY = y(price);
        return `<line x1="${left}" x2="${right}" y1="${lineY}" y2="${lineY}" stroke="var(--quote-grid)" stroke-width="1"/>
          <text x="${compact ? 3 : 9}" y="${lineY + 4}" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="${compact ? 10 : 11}">${price}</text>`;
      })
      .join("");

    const volumeGrid = `<line x1="${left}" x2="${right}" y1="${volumeTop - 7}" y2="${volumeTop - 7}" stroke="var(--quote-grid)" stroke-width="1"/>
      <text x="${compact ? 3 : 9}" y="${volumeTop + 5}" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="${compact ? 10 : 11}">VOL</text>`;

    const candleMarkup = visible
      .map((bar, index) => {
        const [open, high, low, close] = bar;
        const up = close >= open;
        const color = up ? "var(--chart-up)" : "var(--chart-down)";
        const bodyTop = y(Math.max(open, close));
        const bodyBottom = y(Math.min(open, close));
        const bodyHeight = Math.max(1.8, bodyBottom - bodyTop);
        return `<g>
          <line x1="${x(index)}" x2="${x(index)}" y1="${y(high)}" y2="${y(low)}" stroke="${color}" stroke-width="1"/>
          <rect x="${x(index) - bodyWidth / 2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" rx="1" fill="${color}"/>
          <rect x="${x(index) - bodyWidth / 2}" y="${volumeY(bar)}" width="${bodyWidth}" height="${volumeBottom - volumeY(bar)}" rx="1" fill="${color}" opacity=".58"/>
        </g>`;
      })
      .join("");

    const movingAverage = (period) =>
      visible
        .map((_, index) => {
          if (index < period - 1) return null;
          const window = visible.slice(index - period + 1, index + 1);
          return window.reduce((sum, bar) => sum + bar[3], 0) / period;
        })
        .map((price, index) =>
          price == null
            ? null
            : `${index === period - 1 ? "M" : "L"}${x(index).toFixed(1)},${y(price).toFixed(1)}`,
        )
        .filter(Boolean)
        .join(" ");

    const ma5 = movingAverage(5);
    const ma20 = movingAverage(20);
    const dates = compact
      ? `<text x="${left}" y="${axisY}" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="10">11/14</text>
         <text x="${right}" y="${axisY}" text-anchor="end" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="10">11/26</text>`
      : `<text x="${left}" y="${axisY}" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">10/13</text>
         <text x="${(left + right) / 2}" y="${axisY}" text-anchor="middle" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">11/04</text>
         <text x="${right}" y="${axisY}" text-anchor="end" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">11/26</text>`;

    return `<svg class="candle-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="比亚迪最近一个月的日 K 线与成交量">
      <title>比亚迪日 K 线</title>
      ${grid}
      ${volumeGrid}
      ${candleMarkup}
      <path d="${ma5}" fill="none" stroke="var(--ink)" stroke-width="1.2" opacity=".7"/>
      <path d="${ma20}" fill="none" stroke="#8e6ac9" stroke-width="1.2" opacity=".78"/>
      <line x1="${left}" x2="${right}" y1="${y(73.62)}" y2="${y(73.62)}" stroke="var(--primary)" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>
      <rect x="${right - (compact ? 48 : 62)}" y="${Math.max(3, y(73.62) - 19)}" width="${compact ? 48 : 62}" height="18" rx="4" fill="var(--primary)"/>
      <text x="${right - (compact ? 24 : 31)}" y="${Math.max(16, y(73.62) - 7)}" text-anchor="middle" fill="var(--primary-foreground)" font-family="var(--font-family-code)" font-size="${compact ? 9 : 10}">73.62</text>
      <line x1="${left}" x2="${right}" y1="${volumeBottom + 1}" y2="${volumeBottom + 1}" stroke="var(--quote-line)" stroke-width="1"/>
      ${dates}
    </svg>`;
  }

  function trendChart() {
    const values = candles.map((bar) => bar[3]);
    const width = 340;
    const height = 102;
    const left = 5;
    const right = width - 5;
    const top = 10;
    const bottom = height - 8;
    const min = Math.min(...values) - 0.5;
    const max = Math.max(...values) + 0.5;
    const points = values
      .map((value, index) => {
        const x = left + (index / (values.length - 1)) * (right - left);
        const y = top + ((max - value) / (max - min)) * (bottom - top);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const area = `${left},${bottom} ${points} ${right},${bottom}`;
    const lastX = right;
    const lastY =
      top + ((max - values.at(-1)) / (max - min)) * (bottom - top);
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="前复权收盘价最近一个月先升后回落">
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity=".24"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${left}" x2="${right}" y1="${top}" y2="${top}" stroke="var(--quote-grid)"/>
      <line x1="${left}" x2="${right}" y1="${(top + bottom) / 2}" y2="${(top + bottom) / 2}" stroke="var(--quote-grid)"/>
      <line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="var(--quote-grid)"/>
      <polygon points="${area}" fill="url(#trend-fill)"/>
      <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${left}" x2="${right}" y1="${lastY}" y2="${lastY}" stroke="var(--chart-down)" stroke-width="1" stroke-dasharray="4 4" opacity=".6"/>
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="var(--primary)"/>
    </svg>`;
  }

  function stockHeader() {
    const missing = state === "market-missing";
    return `<header class="stock-header" aria-labelledby="stock-title">
      <div class="stock-identity">
        <div class="stock-eyebrow">
          <span>STOCK WORKSPACE</span>
          <span class="exchange">· 深交所主板</span>
        </div>
        <div class="stock-title-row">
          <h1 id="stock-title">比亚迪</h1>
          <span class="stock-code">002594.SZ</span>
        </div>
        <div class="stock-meta">
          <span class="status-chip"><i></i>正常交易</span>
          <span class="status-chip">汽车整车</span>
          <span class="status-chip">沪深 300</span>
          ${
            missing
              ? '<span class="status-chip warn"><i></i>快速行情暂缺</span>'
              : '<span class="status-chip"><i></i>行情可用</span>'
          }
        </div>
      </div>

      <div class="stock-quote${missing ? " missing" : ""}">
        <div class="quote-value-row">
          <strong>${missing ? "—" : "73.62"}</strong>
          <span>${missing ? "行情暂缺" : "-1.11%"}</span>
        </div>
        <div class="quote-note">
          <span>${missing ? "等待行情源恢复" : "11/26 15:00"}</span>
          <span>${missing ? "研究数据不受影响" : "成交额 22.97 亿"}</span>
        </div>
      </div>

      <div class="stock-actions" aria-label="个股操作">
        <button class="action-button" type="button">${icon("star")}<span class="action-label">自选</span></button>
        <button class="action-button" type="button">${icon("compare")}<span class="action-label secondary">加入对比</span></button>
        <button class="action-button icon-only" type="button" aria-label="更多操作">${icon("more")}</button>
      </div>
    </header>`;
  }

  function modeSwitch() {
    const research = state !== "quick";
    return `<div class="mode-switch-wrap">
      <div class="mode-switch" role="group" aria-label="查看深度">
        <button class="mode-button" type="button" data-mode="quick" aria-pressed="${!research}">
          <span class="mode-icon">${icon("chart")}</span>
          <span class="mode-copy">
            <strong>快速看盘</strong>
            <span>K 线、资金与关键信号，打开即看</span>
          </span>
          <span class="mode-detail">QUICK</span>
        </button>
        <button class="mode-button" type="button" data-mode="research" aria-pressed="${research}">
          <span class="mode-icon">${icon("signal")}</span>
          <span class="mode-copy">
            <strong>深度研究</strong>
            <span class="mode-description">
              <span class="nowrap">预测与风险</span>
              <span class="nowrap">44 项信号</span>
              <span class="nowrap">财务与事件</span>
            </span>
          </span>
          <span class="mode-detail">按需加载</span>
        </button>
      </div>
    </div>`;
  }

  function chartCard() {
    const empty = state === "market-missing";
    return `<section class="surface-card" aria-labelledby="chart-title">
      <div class="card-head">
        <div>
          <h2 id="chart-title">日 K 线与成交量</h2>
          <p>沪深腾讯 · 不复权快照 · 最近 36 个交易日</p>
        </div>
        <span class="quiet-badge ${empty ? "warning" : ""}">${empty ? "行情暂缺" : "11/26 收盘"}</span>
      </div>
      <div class="chart-toolbar">
        <div class="period-tabs" role="group" aria-label="K 线周期">
          <button type="button" aria-pressed="false">分时</button>
          <button type="button" aria-pressed="true">日</button>
          <button type="button" aria-pressed="false">5日</button>
          <button type="button" aria-pressed="false">周</button>
          <button type="button" aria-pressed="false">月</button>
        </div>
        <span class="spacer"></span>
        <button class="subtle-action" type="button">MA 7 条</button>
        <button class="subtle-action" type="button">VOL · MACD</button>
      </div>
      <div class="chart-shell">
        <div class="chart-readout">
          <span>2026-11-25</span><span>开 75.50</span><span>高 75.73</span><span>低 73.99</span><span>收 74.45</span><span>量 32.60万</span>
          <span class="ma5">MA5 77.70</span><span class="ma10">MA10 78.98</span><span class="ma20">MA20 81.55</span><span class="ma60">MA60 83.68</span>
        </div>
        <div class="candle-frame">${miniCandleChart({ empty })}</div>
      </div>
    </section>`;
  }

  function quickRail() {
    const empty = state === "market-missing";
    return `<aside class="quick-rail" aria-label="快速研判">
      <section class="rail-card verdict-card">
        <p class="verdict-kicker">快速结论 · 收盘快照</p>
        <h2>弱势缩量，等待趋势修复</h2>
        <p>价格位于主要均线下方，资金承接偏弱。当前结论只用于决定是否继续研究，不构成买卖建议。</p>
        <div class="signal-chips">
          <span class="signal-chip down">趋势偏弱</span>
          <span class="signal-chip neutral">缩量观望</span>
          <span class="signal-chip">接近支撑</span>
        </div>
        <button class="rail-link" type="button" data-mode="research">
          <span>进入深度研究</span><span>44 项信号与风险 →</span>
        </button>
      </section>

      <section class="rail-card" aria-labelledby="snapshot-title">
        <div class="card-head compact">
          <div><h3 id="snapshot-title">盘面速览</h3><p>最近交易日</p></div>
          <span class="quiet-badge ${empty ? "warning" : ""}">${empty ? "暂缺" : "行情"}</span>
        </div>
        <div class="metric-list">
          <div class="metric-row"><span>今开 / 昨收</span><strong>${empty ? "— / —" : "75.50 / 74.44"}</strong></div>
          <div class="metric-row"><span>最高 / 最低</span><strong>${empty ? "— / —" : "75.73 / 73.99"}</strong></div>
          <div class="metric-row"><span>换手率</span><strong>${empty ? "—" : "0.89%"}</strong></div>
          <div class="metric-row"><span>量比</span><strong class="${empty ? "" : "down"}">${empty ? "—" : "0.78"}</strong></div>
        </div>
      </section>

      <section class="rail-card" aria-labelledby="fund-title">
        <div class="card-head compact">
          <div><h3 id="fund-title">资金结构</h3><p>近 5 日 · 主力净流入不等同于全部资金</p></div>
          <span class="quiet-badge">11/25</span>
        </div>
        <div class="fund-bars">
          <div class="fund-row"><span>超大单</span><div class="fund-track"><div class="fund-fill" style="width: 72%"></div></div><strong>${empty ? "—" : "-1.82亿"}</strong></div>
          <div class="fund-row"><span>大单</span><div class="fund-track"><div class="fund-fill" style="width: 54%"></div></div><strong>${empty ? "—" : "-0.76亿"}</strong></div>
          <div class="fund-row"><span>中单</span><div class="fund-track"><div class="fund-fill up" style="width: 34%"></div></div><strong>${empty ? "—" : "+0.43亿"}</strong></div>
          <div class="fund-row"><span>小单</span><div class="fund-track"><div class="fund-fill up" style="width: 81%"></div></div><strong>${empty ? "—" : "+2.15亿"}</strong></div>
        </div>
      </section>
    </aside>`;
  }

  function quickPanel() {
    return `<section class="mode-panel quick-grid" aria-label="快速看盘">
      ${chartCard()}
      ${quickRail()}
    </section>`;
  }

  function marketRibbon() {
    const missing = state === "market-missing";
    const context = {
      research: {
        title: "弱势缩量，接近 20D 支撑",
        detail:
          "主力净流出 2.58 亿元，价格仍在 MA20 下方；快速行情作为研究判断的底座保留在同一页面。",
      },
      loading: {
        title: "研究加载中，行情底稿保持可用",
        detail:
          "深度内容首次进入时按需加载；行情、资金与页面导航不等待研究请求。",
      },
      error: {
        title: "研究请求失败，行情底稿保持可用",
        detail:
          "研究区域独立失败；K 线、资金和页面导航继续可用，可单独重试研究。",
      },
      partial: {
        title: "行情可用，研报全文部分失败",
        detail:
          "价格、技术信号、预测与财务已更新；研报全文 2 篇待重试，事件流仍保留已提取内容。",
      },
      "market-missing": {
        title: "行情与研究交叉缺失",
        detail:
          "共享头明确显示快速行情缺失；研究内容使用自己的数据日期和质量标记，不伪造实时报价。",
      },
    }[state];
    return `<section class="market-ribbon" aria-label="快速行情底稿">
      <div class="ribbon-chart">
        <div class="ribbon-title">
          <strong>行情底稿</strong><span>${missing ? "行情暂缺" : "日 K · 11/26 收盘"}</span>
        </div>
        <div class="candle-frame small">${miniCandleChart({ compact: true, empty: missing })}</div>
      </div>
      <div class="ribbon-context">
        <h2>${context.title}</h2>
        <p>${context.detail}</p>
        <div class="ribbon-metrics">
          <span>${missing ? "成交额 —" : "成交额 22.97亿"}</span>
          <span>${missing ? "资金 —" : "主力 -1.82亿"}</span>
          <span>${missing ? "数据日 11/25" : "技术 弱势"}</span>
        </div>
      </div>
      <div class="ribbon-actions">
        <button class="action-button" type="button" data-mode="quick">展开快速看盘</button>
        <button class="action-button" type="button">${icon("refresh")}刷新行情</button>
      </div>
    </section>`;
  }

  function healthStrip() {
    const sets = {
      research: [
        ["实时行情", "11/26 · 可用", ""],
        ["个股新闻", "12 条 · 可用", ""],
        ["公司公告", "9 条 · 可用", ""],
        ["研报元数据", "8 篇 · 可用", ""],
        ["研报全文", "6/8 · 部分", "warn"],
      ],
      loading: [
        ["实时行情", "已加载", ""],
        ["研究模块", "正在加载", "loading"],
        ["预测与风险", "等待", "loading"],
        ["财务与事件", "等待", "loading"],
        ["研报全文", "等待", "loading"],
      ],
      error: [
        ["快速行情", "保持可用", ""],
        ["研究聚合", "读取失败", "error"],
        ["预测与风险", "未加载", "error"],
        ["财务与事件", "未加载", "error"],
        ["研报全文", "未加载", "error"],
      ],
      partial: [
        ["实时行情", "11/26 · 可用", ""],
        ["个股新闻", "可用", ""],
        ["公司公告", "可用", ""],
        ["研报元数据", "8 篇 · 可用", ""],
        ["研报全文", "2 篇待重试", "warn"],
      ],
      "market-missing": [
        ["快速行情", "暂不可用", "error"],
        ["研究数据", "11/25 · 可用", ""],
        ["新闻与公告", "可用", ""],
        ["财务与预测", "可用", ""],
        ["行情交叉校验", "不可用", "warn"],
      ],
    };
    return (sets[state] || sets.research)
      .map(
        ([label, value, tone]) => `<div class="health-item ${tone}">
          <span>${label}</span>
          <strong><i></i>${value}</strong>
        </div>`,
      )
      .join("");
  }

  function researchToolbar() {
    const copy =
      state === "loading"
        ? "首次进入按需加载，行情底稿不等待研究请求"
        : state === "error"
          ? "研究请求独立失败，快速行情与导航保持可用"
          : state === "partial"
            ? "4 / 5 类证据可用 · 研报全文 2 篇待重试"
            : state === "market-missing"
              ? "研究数据可用，共享头明确标注行情缺失"
              : "4 / 5 类证据可用 · 核心模块更新至 11/26";
    return `<section class="research-toolbar" aria-labelledby="research-title">
      <div class="research-heading">
        <span class="eyebrow">STOCK RESEARCH · 002594.SZ</span>
        <h2 id="research-title">深度研究</h2>
        <p>${copy}</p>
      </div>
      <div class="health-strip" aria-label="研究数据完整度">${healthStrip()}</div>
    </section>`;
  }

  function researchSummaryCard() {
    return `<section class="surface-card" aria-labelledby="summary-title">
      <div class="card-head">
        <div>
          <h2 id="summary-title">研究结论</h2>
          <p>事实、推断与情景分层展示 · 证据可追溯到模块</p>
        </div>
        <span class="quiet-badge primary">置信度 72%</span>
      </div>
      <div class="research-summary">
        <div class="research-summary-copy">
          <blockquote>短期仍处弱势区间，估值提供缓冲，但趋势反转尚缺成交量确认。</blockquote>
          <p>价格回到 20 日均线下方，资金连续净流出，机构预期保持稳定。当前更像等待确认的观察窗口，而不是已经从弱势转为上行。</p>
          <div class="evidence-list">
            <div class="evidence-item"><i>1</i><span>趋势：收盘价低于 MA20 约 9.7%，MA5/10/20 空头排列。</span></div>
            <div class="evidence-item"><i>2</i><span>资金：近 5 日主力净流出 2.58 亿元，超大单持续减弱。</span></div>
            <div class="evidence-item"><i>3</i><span>估值：PE-TTM 21.22，位于近三年 34% 分位，未触发高估预警。</span></div>
          </div>
        </div>
        <div class="confidence-panel">
          <span>证据完整度</span>
          <strong>4 / 5 类可用</strong>
          <div class="confidence-meter"><span></span></div>
          <p>研报全文部分提取失败，不改变已展示的价格、财务和技术证据。</p>
        </div>
      </div>
    </section>`;
  }

  function trendResearchCard() {
    return `<section class="surface-card" aria-labelledby="trend-title">
      <div class="card-head">
        <div>
          <h2 id="trend-title">价格与趋势</h2>
          <p>前复权收盘价 · 最近 36 个交易日</p>
        </div>
        <span class="quiet-badge">11/26</span>
      </div>
      <div class="trend-panel">
        ${trendChart()}
        <div class="trend-stats">
          <div class="trend-stat"><span>MA20</span><strong>81.55</strong></div>
          <div class="trend-stat"><span>20D 支撑</span><strong>72.80</strong></div>
          <div class="trend-stat"><span>60D 压力</span><strong>86.73</strong></div>
        </div>
      </div>
    </section>`;
  }

  function signalResearchCard() {
    return `<section class="surface-card" aria-labelledby="signals-title">
      <div class="card-head">
        <div>
          <h2 id="signals-title">技术信号矩阵</h2>
          <p>基础、形态、高级模型与微观结构分层查看</p>
        </div>
        <span class="quiet-badge warning">32 / 44 触发</span>
      </div>
      <div class="signal-groups">
        <div class="signal-group">
          <header><strong>趋势与均线</strong><span>12 / 16</span></header>
          <div class="signal-rows">
            <div class="signal-row"><span>均线空头排列</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>MACD 水下</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>接近 20D 支撑</span><b class="positive">观察</b></div>
          </div>
        </div>
        <div class="signal-group">
          <header><strong>成交量与资金</strong><span>8 / 11</span></header>
          <div class="signal-rows">
            <div class="signal-row"><span>缩量下行</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>主力连续流出</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>尾盘承接</span><b>未触发</b></div>
          </div>
        </div>
        <div class="signal-group">
          <header><strong>K 线形态</strong><span>7 / 10</span></header>
          <div class="signal-rows">
            <div class="signal-row"><span>下降通道</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>长下影</span><b>未触发</b></div>
            <div class="signal-row"><span>跳空缺口</span><b>未触发</b></div>
          </div>
        </div>
        <div class="signal-group">
          <header><strong>高级与微观</strong><span>5 / 7</span></header>
          <div class="signal-rows">
            <div class="signal-row"><span>波动率抬升</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>主动卖盘占优</span><b class="risk">触发</b></div>
            <div class="signal-row"><span>流动性正常</span><b class="positive">触发</b></div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function forecastCard() {
    return `<section class="surface-card" aria-labelledby="forecast-title">
      <div class="card-head">
        <div>
          <h2 id="forecast-title">情景预测与风险区间</h2>
          <p>5 / 20 / 60 日历史分布 · 不生成目标价</p>
        </div>
        <span class="quiet-badge primary">可用</span>
      </div>
      <div class="forecast-strip">
        <div class="forecast-box"><span>5D · P10 / P90</span><strong>71.8–75.1</strong><small>中位 73.5 · 上涨 31%</small></div>
        <div class="forecast-box"><span>20D · P10 / P90</span><strong>68.5–78.1</strong><small>中位 72.5 · 风险区间</small></div>
        <div class="forecast-box"><span>60D · P10 / P90</span><strong>64.2–83.6</strong><small>样本外命中 80.8%</small></div>
      </div>
      <div class="probability-row" aria-label="未来一周方向概率">
        <div class="probability" style="--probability:31%;--probability-color:var(--chart-up)"><span>上涨</span><strong>31%</strong></div>
        <div class="probability" style="--probability:27%;--probability-color:var(--warning)"><span>震荡</span><strong>27%</strong></div>
        <div class="probability" style="--probability:42%;--probability-color:var(--chart-down)"><span>下跌</span><strong>42%</strong></div>
      </div>
    </section>`;
  }

  function fundamentalsCard() {
    return `<section class="surface-card" aria-labelledby="fundamentals-title">
      <div class="card-head">
        <div>
          <h2 id="fundamentals-title">财务与估值</h2>
          <p>最新快照与历史分位</p>
        </div>
        <span class="quiet-badge success">可用</span>
      </div>
      <div class="fact-grid">
        <div class="fact"><span>PE TTM</span><strong>21.22</strong><small>近三年 34% 分位</small></div>
        <div class="fact"><span>PB</span><strong>2.70</strong><small>近三年 29% 分位</small></div>
        <div class="fact"><span>总市值</span><strong>6,720 亿</strong><small>quant-live</small></div>
        <div class="fact"><span>一致 EPS</span><strong>FY26 · 13.7–16.2</strong><small>9 家机构</small></div>
      </div>
    </section>`;
  }

  function eventsCard() {
    const failed = state === "partial";
    return `<section class="surface-card" aria-labelledby="events-title">
      <div class="card-head">
        <div>
          <h2 id="events-title">新闻、公告与研报</h2>
          <p>按时间倒序的统一事件流 · 各来源独立更新</p>
        </div>
        <span class="quiet-badge ${failed ? "warning" : ""}">${failed ? "研报全文部分失败" : "21 条"}</span>
      </div>
      ${
        failed
          ? '<div class="module-failed"><strong>研报全文提取部分失败</strong>6 篇已可检索，2 篇等待重试；新闻、公告和研报元数据不受影响。<button class="action-button" type="button">重试失败篇目</button></div>'
          : ""
      }
      <div class="event-list">
        <div class="event-row"><span class="event-type">新闻</span><span class="event-copy"><strong>汽车行业今日净流出资金 3.75 亿元，比亚迪等 7 股净流出超 5000 万元</strong><span>东方财富 · 个股新闻</span></span><time>11/26 17:07</time></div>
        <div class="event-row"><span class="event-type announcement">公告</span><span class="event-copy"><strong>2026 年 11 月 12 日投资者关系活动记录表</strong><span>巨潮资讯 · 公司公告</span></span><time>11/12</time></div>
        <div class="event-row"><span class="event-type report">研报</span><span class="event-copy"><strong>Q3 盈利持续向好，出口核心驱动力稳步上行</strong><span>中航证券 · 买入 · PDF 已提取</span></span><time>11/13</time></div>
      </div>
    </section>`;
  }

  function researchReadyContent() {
    return `<div class="research-grid">
      <div class="research-column">
        ${researchSummaryCard()}
        ${signalResearchCard()}
        ${forecastCard()}
      </div>
      <div class="research-column">
        ${trendResearchCard()}
        ${fundamentalsCard()}
        ${eventsCard()}
      </div>
    </div>`;
  }

  function loadingContent() {
    return `<div class="skeleton-grid" aria-label="正在加载深度研究" aria-busy="true">
      <div class="skeleton-card tall">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-block"></div>
      </div>
      <div>
        <div class="skeleton-card">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-block"></div>
        </div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-block"></div>
      </div>
    </div>`;
  }

  function errorContent() {
    return `<div class="research-error" role="alert">
      <div>
        <span class="research-error-icon">${icon("alert")}</span>
        <h2>深度研究暂时无法读取</h2>
        <p data-error-copy>研究聚合请求超时。共享股票头、行情底稿和页面导航仍然可用；可以单独重试研究，不影响快速看盘。</p>
      </div>
      <div class="research-error-actions">
        <button class="action-button" type="button" data-mode="quick">返回快速看盘</button>
        <button class="action-button primary" type="button">${icon("refresh")}重试研究</button>
      </div>
    </div>`;
  }

  function noticeBar() {
    if (state === "partial") {
      return `<div class="notice-bar" role="status">
        <span class="notice-icon">!</span>
        <span><strong>研究部分可用。</strong> 价格、技术信号、预测与财务已展示；研报全文 2 篇提取失败，已在事件流内单独标记。</span>
      </div>`;
    }
    if (state === "market-missing") {
      return `<div class="notice-bar error" role="status">
        <span class="notice-icon">!</span>
        <span><strong>快速行情与 K 线暂不可用。</strong> 研究内容仍使用其数据接口的日期和质量，不把研究报价拼成实时行情，也不清空当前股票上下文。</span>
      </div>`;
    }
    return "";
  }

  function researchPanel() {
    let body = researchReadyContent();
    if (state === "loading") body = loadingContent();
    if (state === "error") body = errorContent();
    return `<section class="mode-panel research-shell" aria-label="深度研究">
      ${marketRibbon()}
      ${researchToolbar()}
      ${noticeBar()}
      ${body}
      <p class="research-footnote">本页为研究辅助，不构成投资建议。预测数字来自历史统计模型，正式结论需通过滚动样本外验证。</p>
    </section>`;
  }

  function render() {
    root.innerHTML = `${stockHeader()}${modeSwitch()}${state === "quick" ? quickPanel() : researchPanel()}`;
    root.dataset.prototypeState = state;
    if (focusTarget === "quick" || focusTarget === "research") {
      requestAnimationFrame(() => {
        root.querySelector(`[data-mode="${focusTarget}"]`)?.focus();
      });
    }
  }

  function setState(nextState, { push = true } = {}) {
    const url = new URL(location.href);
    url.searchParams.set("state", nextState);
    if (!url.searchParams.has("theme")) {
      url.searchParams.set(
        "theme",
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    }
    if (push) history.pushState({ state: nextState }, "", url);
    else history.replaceState({ state: nextState }, "", url);
    state = nextState;
    render();
  }

  root.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      const nextMode = modeButton.getAttribute("data-mode");
      setState(nextMode);
    }
  });

  addEventListener("popstate", () => {
    const nextParams = new URLSearchParams(location.search);
    state = allowedStates.has(nextParams.get("state"))
      ? nextParams.get("state")
      : "quick";
    render();
  });

  render();
})();
