(() => {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "./stock-five-day-forecast-v1.css";
  document.head.appendChild(stylesheet);

  const params = new URLSearchParams(location.search);
  const requestedTheme = params.get("theme");
  const state = params.get("state") || "model";

  if (requestedTheme === "dark" || requestedTheme === "light") {
    document.documentElement.classList.toggle("dark", requestedTheme === "dark");
    document.documentElement.style.colorScheme = requestedTheme;
  }

  const labels = {
    model: {
      title: "项目模型 · stock-forecast-v1",
      tone: "model",
      source: "项目模型 v1",
      quality: "可用",
      asOf: "11/26 收盘",
      reason: "预测来自当前通过样本外门槛的项目模型。",
    },
    baseline: {
      title: "forecast-baseline-v1",
      tone: "baseline",
      source: "统计基线",
      quality: "可用",
      asOf: "11/26 收盘",
      reason: "监督模型未上线，当前展示条件化历史 bootstrap 基线。",
    },
    low: {
      title: "项目模型 · stock-forecast-v1",
      tone: "warning",
      source: "项目模型 v1",
      quality: "低置信",
      asOf: "11/26 收盘",
      reason: "近期波动状态样本偏少，方向概率仅供研究参考。",
    },
    stale: {
      title: "项目模型 · stock-forecast-v1",
      tone: "warning",
      source: "项目模型 v1",
      quality: "快照陈旧",
      asOf: "11/25 收盘",
      reason: "今天尚未完成收盘推理，当前显示最近一个完整快照。",
    },
    unsupported: {
      title: "暂不支持",
      tone: "muted",
      source: "未提供预测",
      quality: "不适用",
      asOf: "11/26",
      reason: "当前标的未纳入首期预测范围，不会用其他股票数据代替。",
    },
    unavailable: {
      title: "等待可靠数据",
      tone: "muted",
      source: "未提供预测",
      quality: "数据不足",
      asOf: "11/26",
      reason: "复权快照或历史样本未通过预测门禁，不生成替代数字。",
    },
    error: {
      title: "预测读取失败",
      tone: "warning",
      source: "未提供预测",
      quality: "错误",
      asOf: "11/26",
      reason: "请求未完成，请稍后重试。",
    },
  };

  const compact = matchMedia("(max-width: 720px)").matches;
  const geometry = compact
    ? {
        width: 360,
        height: 300,
        left: 28,
        right: 352,
        chartBottom: 264,
        axisY: 286,
        historyEnd: 210,
        futureStart: 228,
        futureStep: 26,
        historyStep: 10.4,
        priceTop: 18,
        priceSpan: 232,
      }
    : {
        width: 1000,
        height: 370,
        left: 48,
        right: 960,
        chartBottom: 331,
        axisY: 354,
        historyEnd: 660,
        futureStart: 690,
        futureStep: 61,
        historyStep: 15.2,
        priceTop: 22,
        priceSpan: 278,
      };

  const dates = ["11/27", "11/30", "12/01", "12/02", "12/03"];
  const forecast = {
    p10: [71.8, 70.9, 70.1, 69.3, 68.5],
    p50: [73.5, 73.3, 73.0, 72.8, 72.5],
    p90: [75.1, 75.8, 76.6, 77.3, 78.1],
    probabilities: [31, 27, 42],
  };
  const baselineForecast = {
    p10: [71.1, 70.0, 68.9, 67.9, 66.8],
    p50: [73.4, 73.2, 72.9, 72.6, 72.2],
    p90: [75.7, 76.6, 77.4, 78.3, 79.2],
    probabilities: [28, 25, 47],
  };
  const weakForecast = {
    p10: [70.3, 69.0, 67.6, 66.2, 64.8],
    p50: [73.2, 72.7, 72.0, 71.2, 70.4],
    p90: [76.1, 76.9, 77.6, 78.0, 78.5],
    probabilities: [22, 31, 47],
  };

  const history = [
    [79.4, 80.1, 78.8, 79.7], [79.6, 79.9, 78.4, 78.8], [78.7, 79.3, 78.1, 79.0],
    [79.0, 79.8, 78.6, 79.5], [79.4, 80.0, 78.9, 78.9], [79.0, 79.4, 77.8, 78.2],
    [78.1, 79.1, 77.9, 78.9], [78.9, 79.2, 77.4, 77.8], [77.7, 78.5, 77.1, 78.3],
    [78.4, 79.0, 77.8, 78.8], [78.8, 79.5, 78.1, 79.2], [79.1, 79.7, 78.3, 78.5],
    [78.6, 79.4, 77.9, 79.0], [79.0, 80.2, 78.7, 79.9], [80.0, 80.6, 79.1, 79.4],
    [79.3, 79.9, 78.2, 78.7], [78.8, 79.1, 77.6, 77.9], [77.8, 78.6, 77.2, 78.3],
    [78.2, 79.0, 77.7, 78.8], [78.9, 79.7, 78.3, 79.4], [79.3, 79.8, 78.1, 78.5],
    [78.6, 78.9, 77.1, 77.5], [77.4, 78.2, 76.9, 78.0], [77.9, 78.5, 77.2, 77.6],
    [77.7, 78.1, 76.5, 76.8], [76.8, 77.6, 76.3, 77.4], [77.3, 77.8, 76.2, 76.5],
    [76.6, 76.9, 74.9, 75.3], [75.4, 76.1, 74.8, 75.8], [75.7, 76.0, 74.4, 74.8],
    [74.7, 75.2, 73.9, 74.4], [74.5, 75.0, 73.8, 74.8], [74.8, 75.1, 73.6, 73.9],
    [74.0, 74.5, 73.4, 74.2], [74.1, 74.6, 73.2, 73.6], [73.5, 74.0, 73.1, 73.62],
  ];

  const tone = labels[state] ?? labels.model;
  const activeForecast =
    state === "baseline" ? baselineForecast : state === "low" ? weakForecast : forecast;
  const showForecast = state === "model" || state === "baseline" || state === "low" || state === "stale";
  function path(points) {
    return points.map((point, index) => `${index ? "L" : "M"}${point[0]},${point[1]}`).join(" ");
  }

  function x(index, count) {
    return geometry.left + (compact ? 0 : 10) + index * geometry.historyStep;
  }

  function futureX(index) {
    return geometry.futureStart + index * geometry.futureStep;
  }

  function y(price) {
    return geometry.priceTop + ((82 - price) / 15) * geometry.priceSpan;
  }

  function candleMarkup(bar, index, count) {
    const [open, high, low, close] = bar;
    const color = close >= open ? "var(--chart-up)" : "var(--chart-down)";
    const bodyWidth = compact ? 5.8 : 8.4;
    const left = x(index, count) - bodyWidth / 2;
    const top = y(Math.max(open, close));
    const height = Math.max(2, y(Math.min(open, close)) - top);
    return `<g aria-hidden="true">
      <line x1="${x(index, count)}" x2="${x(index, count)}" y1="${y(high)}" y2="${y(low)}" stroke="${color}" stroke-width="1"/>
      <rect x="${left}" y="${top}" width="${bodyWidth}" height="${height}" rx="1" fill="${color}" opacity=".9"/>
    </g>`;
  }

  function futureMarkup() {
    const upper = activeForecast.p90.map((price, index) => [futureX(index), y(price)]);
    const lower = activeForecast.p10
      .map((price, index) => [futureX(index), y(price)])
      .reverse();
    const band = [...upper, ...lower];
    const median = activeForecast.p50.map((price, index) => [futureX(index), y(price)]);
    const strong = [73.62, 74.7, 75.4, 76.1, 76.9, 77.4].map((price, index) =>
      index === 0 ? [futureX(0), y(price)] : [futureX(index - 1), y(price)],
    );
    const base = [73.62, 73.4, 73.2, 73.0, 72.8, 72.5].map((price, index) =>
      index === 0 ? [futureX(0), y(price)] : [futureX(index - 1), y(price)],
    );
    const weak = [73.62, 72.8, 71.9, 71.2, 70.6, 70.1].map((price, index) =>
      index === 0 ? [futureX(0), y(price)] : [futureX(index - 1), y(price)],
    );

    const sessionLabels = compact
      ? [[0, "11/27"], [4, "12/03"]]
      : dates.map((date, index) => [index, date]);

    return `
      <path class="forecast-band" d="${path(band)} Z"/>
      <path class="forecast-path strong" d="${path(strong)}"/>
      <path class="forecast-path base" d="${path(base)}"/>
      <path class="forecast-path weak" d="${path(weak)}"/>
      <path class="forecast-median" d="${path(median)}"/>
      <circle class="forecast-today" cx="${futureX(0)}" cy="${y(73.62)}" r="4"/>
      ${dates.map((date, index) => `
        <g class="forecast-session" tabindex="0" role="button"
          aria-label="${date} 收盘预测，P10 ${activeForecast.p10[index].toFixed(2)}，P50 ${activeForecast.p50[index].toFixed(2)}，P90 ${activeForecast.p90[index].toFixed(2)}"
          data-session="${index}">
          <rect class="forecast-session-hit" x="${futureX(index) - (compact ? 12 : 22)}" y="${compact ? 24 : 30}" width="${compact ? 24 : 44}" height="${compact ? 214 : 256}" rx="6" fill="transparent"/>
          <circle class="forecast-session-focus" cx="${futureX(index)}" cy="${y(activeForecast.p50[index])}" r="${compact ? 7 : 9}"/>
        </g>`).join("")}
      ${sessionLabels.map(([index, label]) => `
        <text class="forecast-label-strong" x="${futureX(index)}" y="${geometry.axisY - 12}" text-anchor="middle">${label}</text>`).join("")}
    `;
  }

  function chartMarkup() {
    const visibleHistory = compact ? history.slice(-18) : history;
    const gridPrices = compact ? [80, 76, 72, 68] : [80, 77, 74, 71, 68];
    const gridStep = compact ? 58 : 70;
    const futureState = showForecast
      ? futureMarkup()
      : `<g>
          <rect x="${compact ? 220 : 666}" y="24" width="${compact ? 132 : 286}" height="${compact ? 234 : 276}" rx="10" fill="color-mix(in srgb, var(--quote-canvas-axis) 5%, transparent)" stroke="var(--quote-canvas-line)" stroke-dasharray="5 5"/>
          <text class="forecast-label-strong" x="${compact ? 286 : 809}" y="${compact ? 143 : 145}" text-anchor="middle">${tone.title}</text>
        </g>`;

    return `<svg viewBox="0 0 ${geometry.width} ${geometry.height}" role="img"
      aria-label="历史日 K 与未来五个交易日概率路径。${tone.reason}">
      <title>比亚迪未来一周路径预测</title>
      <desc>历史 K 线止于 11 月 26 日；未来五个交易日以概率带展示，不构成确定性价格。</desc>
      ${gridPrices.map((price, index) => {
        const gridY = geometry.priceTop + index * gridStep;
        return `<line x1="${geometry.left}" x2="${geometry.right}" y1="${gridY}" y2="${gridY}" stroke="var(--quote-canvas-grid)" stroke-width="1"/>
          <text class="forecast-label" x="${compact ? 2 : 8}" y="${gridY + 4}">${price}</text>`;
      }).join("")}
      ${visibleHistory.map((bar, index) => candleMarkup(bar, index, visibleHistory.length)).join("")}
      <line class="forecast-separator" x1="${geometry.historyEnd + 9}" x2="${geometry.historyEnd + 9}" y1="18" y2="${geometry.chartBottom}"/>
      <rect x="${geometry.historyEnd - 26}" y="12" width="${compact ? 70 : 80}" height="24" rx="6" fill="var(--quote-canvas-surface)" stroke="var(--quote-canvas-line)"/>
      <text class="forecast-label-strong" x="${geometry.historyEnd + 9}" y="28" text-anchor="middle">预测起点</text>
      ${futureState}
      <line x1="${geometry.left}" x2="${geometry.right}" y1="${geometry.chartBottom}" y2="${geometry.chartBottom}" stroke="var(--quote-canvas-line)" stroke-width="1"/>
      ${compact
        ? `<text class="forecast-label" x="${geometry.left + 2}" y="${geometry.axisY}" text-anchor="start">11/14</text>
           <text class="forecast-label" x="${geometry.historyEnd}" y="${geometry.axisY}" text-anchor="middle">11/26</text>`
        : `<text class="forecast-label" x="58" y="${geometry.axisY}" text-anchor="middle">10/13</text>
           <text class="forecast-label" x="334" y="${geometry.axisY}" text-anchor="middle">11/04</text>
           <text class="forecast-label" x="610" y="${geometry.axisY}" text-anchor="middle">11/26</text>`}
    </svg>`;
  }

  function shellMarkup() {
    const probabilities = activeForecast.probabilities;
    const contextDetail = {
      unsupported: "首期范围：有足够 PIT 历史的沪深 A 股",
      unavailable: "数据门禁已暂停本次预测",
      error: "预测区域已隔离；历史 K 线不受影响",
    }[state] ?? tone.reason;
    const footerMetric =
      state === "model"
        ? "区间误差较基线降低 7.4%"
        : state === "baseline"
          ? "统计基线 · 不提供模型增益"
          : state === "low"
            ? "低置信 · 不显示精确情景线"
            : "最近收盘版本 · 请留意时效";
    return `
      <div class="forecast-head">
        <div class="forecast-title">
          <div>
            <h3>未来一周路径预测</h3>
            <p class="forecast-kicker">5 个交易日 · ${tone.source} · ${tone.asOf}</p>
          </div>
          <span class="forecast-pill" data-tone="${tone.tone}">${tone.quality}</span>
        </div>
        ${showForecast ? `<button class="forecast-toggle" type="button" aria-expanded="true">收起预测</button>` : ""}
      </div>
      <div class="forecast-body">
        <div class="forecast-context">
          <span class="forecast-chip">日 K 预测层</span>
          <span>${contextDetail}</span>
        </div>
        <div class="forecast-chart-shell">${chartMarkup()}</div>
        ${showForecast ? `
        <div class="forecast-legend" aria-label="预测图例">
          <span><i class="band"></i>80% 概率带</span>
          <span><i></i>P50 中位路径</span>
          <span class="forecast-path-legend"><i class="dashed"></i>偏强 / 中枢 / 偏弱样本路径</span>
          <span class="forecast-low-legend">代表性情景已隐藏 · 低置信</span>
        </div>
        <div class="forecast-detail" id="forecastDetail">
          聚焦任一预测交易日可查看当日 P10 / P50 / P90。
        </div>
        <div class="forecast-metrics">
          <div class="forecast-metric"><span>周五收盘区间</span><strong>${activeForecast.p10[4].toFixed(2)} – ${activeForecast.p90[4].toFixed(2)}</strong></div>
          <div class="forecast-metric"><span>中位路径</span><strong>${activeForecast.p50[4].toFixed(2)}</strong></div>
          <div class="forecast-metric"><span>验证覆盖率</span><strong>80.8%</strong></div>
        </div>
        <div class="forecast-probabilities" aria-label="未来一周方向概率">
          <div class="forecast-probability" style="--probability:${probabilities[0]}%;"><span>上涨</span><strong>${probabilities[0]}%</strong></div>
          <div class="forecast-probability" style="--probability:${probabilities[1]}%;"><span>震荡</span><strong>${probabilities[1]}%</strong></div>
          <div class="forecast-probability" style="--probability:${probabilities[2]}%;"><span>下跌</span><strong>${probabilities[2]}%</strong></div>
        </div>
        <div class="forecast-note">
          <span><strong>概率情景，不是目标价。</strong> 阈值按个股波动率归一化；预测不构成买卖建议。</span>
          <span>${footerMetric}</span>
        </div>` : `<div class="forecast-unavailable-row" data-tone="${tone.tone === "warning" ? "warning" : "muted"}">
          <span>${tone.reason}</span>
          ${state === "error" ? `<button class="forecast-toggle" type="button">重试预测</button>` : ""}
        </div>`}
      </div>`;
  }

  function enhance() {
    const section = [...document.querySelectorAll("section")].find((node) =>
      node.getAttribute("aria-label")?.includes("K 线与资金结构"),
    );
    const chartHost = section?.querySelector("[k-line-chart-id]");
    if (!section || !chartHost) return;

    document.body.classList.add("forecast-demo");
    const panel = document.createElement("section");
    panel.setAttribute("data-forecast-panel", "");
    panel.setAttribute("aria-label", "未来一周路径预测");
    panel.setAttribute("data-quality", state === "low" ? "low" : "standard");
    panel.innerHTML = shellMarkup();
    chartHost.replaceWith(panel);
    const chartParent = panel.parentElement;
    const syncChartParentHeight = () => {
      if (chartParent) chartParent.style.height = `${panel.offsetHeight}px`;
    };
    syncChartParentHeight();
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(syncChartParentHeight)
      : null;
    resizeObserver?.observe(panel);

    const toggle = panel.querySelector(".forecast-toggle[aria-expanded]");
    const body = panel.querySelector(".forecast-body");
    toggle?.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") !== "false";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? "展开预测" : "收起预测";
      body.hidden = expanded;
    });

    const detail = panel.querySelector("#forecastDetail");
    panel.querySelectorAll(".forecast-session").forEach((node) => {
      const update = () => {
        const index = Number(node.dataset.session);
        if (!detail || !Number.isInteger(index)) return;
        detail.innerHTML = `<strong>${dates[index]}</strong> · P10 ${activeForecast.p10[index].toFixed(2)} · P50 ${activeForecast.p50[index].toFixed(2)} · P90 ${activeForecast.p90[index].toFixed(2)}`;
      };
      node.addEventListener("focus", update);
      node.addEventListener("click", update);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          update();
        }
      });
    });

    const scroller = section.closest(".overflow-y-auto");
    if (scroller) {
      requestAnimationFrame(() => {
        scroller.scrollTop = Math.max(0, panel.getBoundingClientRect().top + scroller.scrollTop - 140);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", enhance);
})();
