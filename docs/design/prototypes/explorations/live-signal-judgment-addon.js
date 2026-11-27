const judgmentParams = new URLSearchParams(location.search);

if (judgmentParams.get("theme") === "dark") {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}

const JUDGMENTS = {
  market: {
    title: "A 股宏观状态",
    state: ["偏弱", "weak"],
    headline: "风险偏好收缩，等待广度确认",
    description:
      "基础层偏空，形态层中性，高级层证据分歧；宏观缺口不参与方向投票，行业广度与成长/防守继续保留为市场背景。",
    layers: {
      basic: ["基础信号", "偏空", "weak", "4 项偏空证据占优，RSI 已进入超卖区", "4 空 / 3 多 / 3 中性"],
      pattern: ["K 线形态", "中性", "neutral", "未出现获得广度确认的突破或反转", "0 空 / 0 多 / 12 中性"],
      advanced: ["高级模型", "分歧", "mixed", "风险偏好偏弱，波动率仍未确认", "2 风险 / 1 多 / 3 不足"],
    },
  },
  "board-detail": {
    title: "板块技术诊断",
    state: ["偏强", "strong"],
    headline: "价格与形态改善，等待高级模型确认",
    description:
      "基础层偏多，形态层偏多，高级层证据分歧；总判断为偏强，置信度中。",
    layers: {
      basic: ["基础信号", "偏多", "strong", "均线斜率与量价结构同步改善", "5 多 / 1 空 / 4 中性"],
      pattern: ["K 线形态", "偏多", "strong", "平台突破获得成交额和龙头共振", "2 多 / 0 空 / 10 中性"],
      advanced: ["高级模型", "分歧", "mixed", "动量扩散偏强，拥挤度提示短期风险", "2 多 / 1 风险 / 3 不足"],
    },
  },
  analysis: {
    title: "技术信号诊断",
    state: ["偏弱", "weak"],
    headline: "趋势与形态承压，等待微观证据改善",
    description:
      "基础层偏空，形态层偏空，高级层分歧；微观结构只调整置信度，不覆盖三个主层结论。",
    layers: {
      basic: ["基础信号", "偏空", "weak", "价格低于 MA200，MACD 位于零轴下方", "5 空 / 2 多 / 3 中性"],
      pattern: ["K 线形态", "偏空", "weak", "空头破位和顶部反转确认", "3 空 / 1 多 / 8 中性"],
      advanced: ["高级模型", "分歧", "mixed", "Alpha 偏弱，资金累积出现改善", "3 空 / 2 多 / 5 不足"],
      micro: ["微观结构（辅助）", "低置信", "low-confidence", "单日分笔样本偏少，只调整置信度", "2 多 / 2 空 / 8 不足"],
    },
  },
  gold: {
    title: "黄金技术诊断",
    state: ["证据不足", "insufficient"],
    headline: "技术偏弱，但高级模型覆盖不足",
    description:
      "基础层偏空，形态层中性，高级层可用率不足；不生成确定方向，量能类信号保持“不适用”。",
    layers: {
      basic: ["基础信号", "偏空", "weak", "价格与均线结构转弱", "4 空 / 2 多 / 4 中性"],
      pattern: ["K 线形态", "中性", "neutral", "未形成带量确认的顶部或底部形态", "0 空 / 0 多 / 12 中性"],
      advanced: ["高级模型", "证据不足", "insufficient", "实际利率、美元和 ETF 数据未接入", "0 多 / 0 空 / 10 不足"],
    },
  },
};

function findPanel(title) {
  return [...document.querySelectorAll(".sig-panel")].find(
    (panel) => panel.querySelector(".sig-panel-head h2")?.textContent.trim() === title,
  );
}

function layerMarkup(config, order) {
  return order
    .filter((key) => config.layers[key])
    .map((key) => {
      const [label, verdict, tone, detail] = config.layers[key];
      return `<button type="button" class="sj-layer-row" data-sj-jump="${key}">
        <strong>${label}</strong>
        <span>${detail}</span>
        <span class="sj-layer-verdict is-${tone}">${verdict}</span>
      </button>`;
    })
    .join("");
}

function overallMarkup(config, order) {
  return `<section class="sj-overall" aria-label="${config.title}对象总判断">
    <div class="sj-overall-grid">
      <div>
        <div class="sj-kicker">对象总判断 · 主层共识</div>
        <div class="sj-headline-row">
          <span class="sj-state is-${config.state[1]}">${config.state[0]}</span>
          <h3 class="sj-headline">${config.headline}</h3>
        </div>
        <p class="sj-copy">${config.description}</p>
      </div>
      <div class="sj-layer-list">${layerMarkup(config, order)}</div>
    </div>
  </section>`;
}

function injectLayerSummary(panel, config, key) {
  const content = panel.querySelector(`[data-live-layer-content="${key}"]`);
  if (!content || !config.layers[key] || content.querySelector(".sj-layer-detail")) return;
  const [label, verdict, , detail, counts] = config.layers[key];
  content.insertAdjacentHTML(
    "afterbegin",
    `<div class="sj-layer-detail">
      <div><strong>${label}判断 · ${verdict}</strong><p>${detail}</p></div>
      <div class="sj-counts"><span>${counts}</span><span><strong>${key === "pattern" || key === "micro" ? "12" : "10"}</strong> 项本层</span></div>
    </div>`,
  );
}

function setupPanel(pageKey, config) {
  const panel = findPanel(config.title);
  if (!panel || panel.querySelector(".sj-overall")) return;

  const oldMarketSummary = panel.querySelector(".sig-analysis-intro");
  if (pageKey === "market") oldMarketSummary?.remove();

  const tabOrder = [...panel.querySelectorAll("[data-live-layer-tab]")].map(
    (tab) => tab.dataset.liveLayerTab,
  );
  const order = tabOrder.length > 0 ? tabOrder : Object.keys(config.layers);
  panel.querySelector(".sig-panel-head")?.insertAdjacentHTML(
    "afterend",
    overallMarkup(config, order),
  );
  for (const key of order) injectLayerSummary(panel, config, key);

  panel.querySelectorAll("[data-sj-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      panel.querySelector(`[data-live-layer-tab="${button.dataset.sjJump}"]`)?.click();
    });
  });
}

const pageKey = document.documentElement.dataset.liveSignalPage;
if (pageKey && JUDGMENTS[pageKey]) {
  setupPanel(pageKey, JUDGMENTS[pageKey]);
}
