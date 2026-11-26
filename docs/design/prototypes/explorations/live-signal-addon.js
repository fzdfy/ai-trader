const liveSignalParams = new URLSearchParams(location.search);

if (liveSignalParams.get("theme") === "dark") {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}

const liveBasic = [
  ["price_vs_ma200", "价格相对 MA200", "on", "触发", "+3.8%", "收盘价位于长期趋势上方"],
  ["ma200_slope_20", "MA200 斜率", "on", "触发", "+1.2%", "长期均线保持向上"],
  ["macd_zero_axis", "MACD 零轴状态", "neutral", "中性", "DIF +0.34", "零轴附近，动量尚未扩张"],
  ["macd_divergence", "MACD 背离", "neutral", "中性", "未形成", "最近摆动点未出现有效背离"],
  ["rsi_state", "RSI 超买超卖与背离", "neutral", "中性", "RSI 54.2", "位于中性区，未见背离"],
  ["bollinger_regime", "布林带压缩/扩张", "on", "触发", "72% 分位", "带宽扩张，波动率开始释放"],
  ["rvol", "RVOL 相对成交量", "on", "触发", "1.62×", "成交量为 20 日均量 1.62 倍"],
  ["adx_di", "ADX / DI 趋势强度", "on", "触发", "ADX 27.4", "DI+ 高于 DI-，趋势强度成立"],
  ["obv_trend", "OBV 资金累积/派发", "low", "低置信", "+2.1%", "OBV 改善但仅 12 个有效样本"],
  ["atr_regime", "ATR 波动率状态", "neutral", "中性", "48% 分位", "波动率处于常态区间"]
];

const livePatterns = [
  ["sideways_pending", "震荡待涨", "on", "形成中", "箱体 8.4%", "收盘位于箱体上 1/3，等待量能确认"],
  ["contraction_base", "缩量筑底", "low", "低置信", "5/10 日", "出现更高低点，成交量仍待放大"],
  ["golden_cross", "黄金交叉", "on", "已确认", "MA20 > MA60", "MA20 上穿 MA60，MACD 同步转强"],
  ["bull_alignment", "多头排列", "on", "已确认", "20 > 60 > 120", "均线顺序与斜率保持一致"],
  ["bottom_launch", "底部起涨", "on", "已确认", "突破 20 日高", "更高低点后放量突破"],
  ["platform_breakout", "平台突破", "on", "已确认", "+1.8%", "突破 60 日平台，RVOL 1.62×"],
  ["pullback_confirm", "回踩确认", "neutral", "等待", "回踩中", "量能缩至突破日 72%"],
  ["trend_acceleration", "主升加速", "neutral", "观察", "78% 分位", "尚未达到加速度阈值"],
  ["high_stall", "高位滞涨", "risk", "风险", "未触发", "高位量价尚未出现明显背离"],
  ["top_reversal", "顶部反转", "neutral", "未触发", "—", "未跌破短期颈线"],
  ["death_cross", "死亡交叉", "neutral", "未触发", "—", "MA20 仍在 MA60 上方"],
  ["bear_breakdown", "空头破位", "neutral", "未触发", "—", "关键平台与 MA60 均未失守"]
];

const liveAdvancedMarket = [
  ["risk_on_off", "Risk-On / Risk-Off", "on", "偏风险", "68 / 100", "成长、小盘和周期相对收益同步改善"],
  ["rate_valuation", "利率曲线与估值周期", "missing", "未接入", "—", "需要 10Y 国债、信用利差和实际利率序列"],
  ["breadth_thrust", "市场宽度扩散", "on", "扩散", "61.2%", "站上 MA200 比例 10 日提升 7.8pct"],
  ["volatility_regime", "波动率状态切换", "neutral", "常态", "42% 分位", "实现波动率回落至历史中枢"],
  ["cross_asset_corr", "跨资产相关性", "on", "机制稳定", "-0.18", "A股/黄金/海外权益滚动相关仍处常态"],
  ["economic_cycle", "经济周期领先指标", "missing", "未接入", "—", "需要 PMI、社融、库存与盈利预期"],
  ["style_diffusion", "多因子风格扩散", "on", "扩散", "4 / 6", "六个风格指数中四项同步走强"],
  ["credit_cycle", "信用周期", "missing", "未接入", "—", "需要信用利差与融资条件"],
  ["liquidity_structure", "流动性与成交结构", "low", "低置信", "+8.4%", "成交额改善，但融资活跃度缺失"],
  ["hmm_regime", "HMM 市场状态", "missing", "未验证", "—", "状态模型尚未完成样本外验证"]
];

const liveAdvancedSector = [
  ["growth_defense", "成长 / 防守轮动", "neutral", "不适用", "市场背景", "板块自身不生成独立风格状态"],
  ["momentum_diffusion", "行业动量扩散", "on", "扩散", "72%", "成分股 20/60 日正收益比例改善"],
  ["rs_trend", "板块相对强弱趋势", "on", "领先", "88 / 100", "板块/沪深300 比率突破 60 日高点"],
  ["fund_flow", "行业资金流", "on", "持续流入", "+18.2 亿", "5 日资金方向连续为正"],
  ["earnings_cycle", "盈利周期与预期修正", "low", "低置信", "覆盖 54%", "成分财务与一致预期覆盖不足"],
  ["valuation_rotation", "估值分位轮动", "neutral", "中性", "58% 分位", "估值与增速匹配度居中枢"],
  ["supply_chain", "产业链景气传导", "missing", "未接入", "—", "需要上中下游价格与订单序列"],
  ["leader_resonance", "龙头与板块共振", "on", "共振", "4 / 5", "前五成分中四只站上 MA20"],
  ["crowding_reversal", "拥挤度反转", "risk", "拥挤升温", "83% 分位", "成交集中度接近近一年高位"],
  ["multifactor", "多因子行业配置", "on", "配置优先", "81 / 100", "动量、资金与质量分项共同领先"]
];

const liveAdvancedStock = [
  ["alpha_momentum", "Alpha 动量", "on", "领先", "+12.4%", "20/60 日超额收益位于行业前 20%"],
  ["fama_french", "Fama-French 多因子", "low", "低置信", "4 暴露", "规模/价值/盈利/投资分项可用"],
  ["quality_growth", "质量成长", "on", "高质量", "82 / 100", "ROE、现金流与毛利率同步改善"],
  ["earnings_revision", "盈利预期修正", "low", "上修", "+3.8%", "一致预期改善，覆盖机构仍偏少"],
  ["accumulation", "资金累积与派发", "on", "累积", "+6.8 亿", "OBV 与价格结构同步改善"],
  ["vol_compression", "波动率压缩突破", "on", "突破", "19% 分位", "波动压缩后放量脱离区间"],
  ["chip_concentration", "筹码集中度", "neutral", "稳定", "72% 集中", "主要成本区间位于现价下方"],
  ["leader_rs", "行业相对强弱", "on", "领涨", "Top 8%", "个股相对行业指数持续走强"],
  ["event_driven", "事件驱动", "neutral", "观察", "2 条", "公告已结构化，尚未形成超额"],
  ["multifactor_return", "多因子预期收益", "on", "候选", "84 / 100", "动量、质量、估值与修正共同支持"]
];

const liveMicro = [
  ["ofi", "OFI 订单流失衡", "missing", "未接入", "—", "需要连续 Level 2 盘口快照"],
  ["cvd", "CVD 累计成交量差", "low", "近似", "+1.8 万手", "最近交易日约 3 秒聚合分笔，proxy"],
  ["vpin", "VPIN 知情交易概率", "missing", "样本不足", "—", "需要完整逐笔与等成交量桶"],
  ["kyle_lambda", "Kyle Lambda 价格冲击", "low", "近似", "0.014", "聚合分笔分桶回归，proxy"],
  ["obi", "OBI 盘口深度失衡", "low", "时点", "+0.21", "当前五档快照，无连续历史"],
  ["absorption", "主动成交吸收", "missing", "未接入", "—", "需要逐笔与盘口连续补充"],
  ["large_trade", "大单主动交易失衡", "low", "近似", "+0.23", "动态大单阈值，proxy"],
  ["amihud", "Amihud 非流动性", "on", "触发", "0.008", "单位成交额价格冲击抬升"],
  ["volume_profile", "Volume Profile", "missing", "未接入", "—", "需要真实分价成交量"],
  ["replenishment", "盘口补单与撤单", "missing", "未接入", "—", "需要逐笔委托和撤单生命周期"],
  ["auction_imbalance", "集合竞价失衡", "missing", "未接入", "—", "当前接口未保存完整竞价序列"],
  ["vwap_deviation", "VWAP 偏离", "low", "近似", "+0.8%", "分笔重建 VWAP，proxy"]
];

const liveAdvancedGold = [
  ["real_yield", "黄金 / 实际利率", "missing", "未接入", "—", "需要美国实际利率序列"],
  ["dollar", "黄金 / 美元强弱", "missing", "未接入", "—", "需要 DXY 日线"],
  ["gold_silver", "金银比", "missing", "未接入", "—", "需要 XAG/USD 日线"],
  ["cftc_positioning", "CFTC 持仓拥挤度", "missing", "未接入", "—", "需要 Managed Money 周度持仓"],
  ["etf_flows", "黄金 ETF 资金流", "missing", "未接入", "—", "需要全球黄金 ETF 持仓与流量"],
  ["central_bank", "全球央行购金", "missing", "未接入", "—", "需要央行黄金储备变化"],
  ["commodity_ratio", "黄金 / 大宗商品比价", "missing", "未接入", "—", "需要铜、原油等可比序列"],
  ["term_structure", "黄金期货期限结构", "missing", "未接入", "—", "需要 COMEX 远近月合约"],
  ["option_skew", "期权偏度与隐含波动率", "missing", "未接入", "—", "需要黄金期权链与风险逆转"],
  ["macro_regime", "黄金宏观状态切换", "missing", "未验证", "—", "宏观输入不足，状态模型不可用"]
];

function liveStatus(status, label) {
  const className = {
    on: "is-on",
    risk: "is-risk",
    neutral: "is-neutral",
    low: "is-low",
    missing: "is-missing",
    na: "is-na"
  }[status] || "is-neutral";
  return `<span class="sig-status ${className}">${label}</span>`;
}

function liveRows(items) {
  return items.map(([id, label, status, statusLabel, value, note]) => {
    const detailId = `live-signal-${id}`;
    return `<tr class="sig-matrix-row" data-sig-status="${status}">
      <td><div class="sig-matrix-name"><strong>${label}</strong><small>${id}</small></div></td>
      <td>${liveStatus(status, statusLabel)}</td>
      <td><span class="sig-matrix-value">${value}</span></td>
      <td><span class="sig-matrix-note">${note}</span></td>
      <td><button class="sig-matrix-more" type="button" data-live-expand="${detailId}" aria-label="展开${label}证据" aria-expanded="false">+</button></td>
    </tr>
    <tr class="sig-detail-row" id="${detailId}">
      <td colspan="5"><div class="sig-evidence">
        <section><b>确认条件</b><p>${note}；状态由 signals 1.0.0 计算。</p></section>
        <section><b>失效条件</b><p>价格结构、趋势斜率或数据质量跌破定义阈值时撤销。</p></section>
        <section><b>数据证据</b><p>as-of 11/26 · ${status === "missing" ? "所需数据尚未接入" : "日线、资金或宽度按定义可用"}。</p></section>
      </div></td>
    </tr>`;
  }).join("");
}

function liveGroup(title, kicker, items) {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>${title}</h2><p>${kicker}</p></div><span class="sig-version"><i></i>${items.length} 项</span></div>
    <div class="sig-toolbar">
      <button class="sig-filter is-active" type="button" data-live-filter="all">全部</button>
      <button class="sig-filter" type="button" data-live-filter="on">触发</button>
      <button class="sig-filter" type="button" data-live-filter="risk">风险</button>
      <button class="sig-filter" type="button" data-live-filter="low">低置信</button>
      <button class="sig-filter" type="button" data-live-filter="missing">不可用</button>
    </div>
    <div class="sig-table-wrap">
      <table class="sig-table sig-signal-table">
        <thead><tr><th style="width:28%">信号</th><th style="width:12%">状态</th><th style="width:14%">当前值</th><th style="width:38%">证据</th><th style="width:8%"></th></tr></thead>
        <tbody>${liveRows(items)}</tbody>
      </table>
    </div>
  </section>`;
}

function liveLayerWorkspace(title, kicker, groups, summaryHtml = "") {
  const tabs = groups.map((group, index) => `
    <button class="sig-layer-tab ${index === 0 ? "is-active" : ""}" type="button" role="tab"
      aria-selected="${index === 0}" data-live-layer-tab="${group.key}">
      ${group.label}<span>${group.items.length}</span>
    </button>
  `).join("");
  const layers = groups.map((group, index) => `
    <section class="sig-layer-content ${index === 0 ? "is-active" : ""}" data-live-layer-content="${group.key}">
      <div class="sig-table-wrap">
        <table class="sig-table sig-signal-table">
          <thead><tr><th style="width:28%">信号</th><th style="width:12%">状态</th><th style="width:14%">当前值</th><th style="width:38%">证据</th><th style="width:8%"></th></tr></thead>
          <tbody>${liveRows(group.items)}</tbody>
        </table>
      </div>
    </section>
  `).join("");
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>${title}</h2><p>${kicker}</p></div><span class="sig-version"><i></i>signals 1.0.0</span></div>
    ${summaryHtml ? `<div class="sig-panel-body">${summaryHtml}</div>` : ""}
    <div class="sig-toolbar sig-layer-toolbar">
      <div class="sig-layer-tabs" role="tablist" aria-label="${title}层级">${tabs}</div>
      <div class="sig-layer-filters">
        <button class="sig-filter is-active" type="button" data-live-filter="all">全部</button>
        <button class="sig-filter" type="button" data-live-filter="on">触发</button>
        <button class="sig-filter" type="button" data-live-filter="risk">风险</button>
        <button class="sig-filter" type="button" data-live-filter="low">低置信</button>
        <button class="sig-filter" type="button" data-live-filter="missing">不可用</button>
      </div>
    </div>
    ${layers}
  </section>`;
}

function liveStats(items) {
  return `<section class="sig-stats">${items.map(([label, value, note]) => `
    <div class="sig-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>
  `).join("")}</section>`;
}

function liveState(name) {
  if (!name || name === "success") return "";
  if (name === "loading") return `<div class="sig-loading"><div class="sig-skeleton"><i></i><i></i><i></i></div></div>`;
  const error = name === "error";
  return `<div class="${error ? "sig-error" : "sig-empty"}"><div class="sig-state-copy">
    <span class="sig-state-icon">${error ? "!" : "—"}</span>
    <h2>${error ? "信号快照暂时不可用" : "当前对象暂无可用信号"}</h2>
    <p>${error ? "信号计算服务未返回当前快照；页面其他数据域保持不变。" : "最新业务日期没有满足条件的信号，不使用中性值填补。"}</p>
    <button class="sig-secondary" type="button">重试信号区域</button>
  </div></div>`;
}

function marketSignalBlock() {
  const state = liveSignalParams.get("state") || "success";
  if (state !== "partial" && state !== "success") {
    return `<div class="sig-page is-embedded">${liveState(state)}</div>`;
  }
  return `<div class="sig-page is-embedded">
    ${state === "partial" ? `<div class="sig-banner"><strong>部分数据不可用</strong> · 宏观利率、信用与 HMM 未接入；技术信号继续展示。</div>` : ""}
    ${liveLayerWorkspace(
      "A 股宏观状态",
      "综合判断与全部市场指标；成长/红利低波只作为风格轮动证据出现",
      [
        { key: "advanced", label: "高级模型", items: liveAdvancedMarket },
        { key: "basic", label: "基础信号", items: liveBasic },
        { key: "pattern", label: "K 线形态", items: livePatterns },
      ],
      `<div class="sig-analysis-intro">
        <div>
          <span class="sig-summary-state">当前状态：证据分化，维持中性观察</span>
          <h2>趋势承压，广度偏弱，资金尚未形成主线。</h2>
          <p>成长 / 红利低波比值 0.1851，20 日相对 -21.1%；指数较 MA20 低 4.05%，行业上涨占比 30.2%。</p>
        </div>
        <div class="sig-analysis-links">
          <span class="sig-mini-chip">风险偏好 中性</span>
          <span class="sig-mini-chip">趋势 偏弱</span>
          <span class="sig-mini-chip">广度 30.2%</span>
          <span class="sig-mini-chip">数据质量 100%</span>
        </div>
      </div>`
    )}
  </div>`;
}

function boardSignalBlock(detail = false) {
  if (!detail) {
    return "";
  }
  return `<div class="sig-page is-embedded">
    ${liveLayerWorkspace("板块技术诊断", "基础、形态和高级模型在同一模块内切换", [
      { key: "basic", label: "基础信号", items: liveBasic },
      { key: "pattern", label: "K 线形态", items: livePatterns },
      { key: "advanced", label: "高级模型", items: liveAdvancedSector },
    ])}
  </div>`;
}

function stockSignalBlock(detail = false) {
  if (!detail) {
    return "";
  }
  return `<div class="sig-page is-embedded"><section class="sig-panel">
    <div class="sig-panel-head"><div><h2>快速技术摘要</h2><p>快速详情只展示标签、数据边界和深度分析入口</p></div><span class="sig-status is-on">候选</span></div>
    <div class="sig-panel-body">
      <div class="sig-chip-row"><span class="sig-mini-chip">平台突破</span><span class="sig-mini-chip">多头排列</span><span class="sig-mini-chip">龙头共振</span><span class="sig-mini-chip">资金累积</span></div>
      <div class="sig-kv-row"><div class="sig-kv"><span>高级多因子</span><strong>84 / 100</strong></div><div class="sig-kv"><span>微观可用</span><strong>5 / 12</strong></div><div class="sig-kv"><span>验证状态</span><strong>待验证</strong></div></div>
      <div class="sig-na-note">完整 44 项进入个股分析；当前快速详情不重复展开。</div>
    </div>
  </section></div>`;
}

function analysisSignalBlock() {
  return `<div class="sig-analysis-insert">
    ${liveLayerWorkspace("技术信号诊断", "44 项证据在同一模块内分层查看；不重复研究摘要", [
      { key: "basic", label: "基础信号", items: liveBasic },
      { key: "pattern", label: "K 线形态", items: livePatterns },
      { key: "advanced", label: "高级模型", items: liveAdvancedStock },
      { key: "micro", label: "微观结构", items: liveMicro },
    ])}
  </div>`;
}

function goldSignalBlock() {
  const basic = liveBasic.map((item) =>
    item[0] === "rvol" || item[0] === "obv_trend"
      ? [item[0], item[1], "na", "不适用", "—", "XAU/USD 无可信成交量"]
      : item
  );
  return `<div class="sig-page">
    <section class="sig-panel">
      <div class="sig-panel-head"><div><h2>伦敦金 XAU/USD</h2><p>USD/oz · 技术结构可用，宏观驱动按数据状态展示</p></div><span class="sig-status is-neutral">技术观察</span></div>
      <div class="sig-panel-body">
        ${liveStats([["技术信号", "20 / 22", "基础 8 · 形态 12"], ["宏观模型", "0 / 10", "真实数据未接入"], ["报价", "3,571.69", "USD/oz"], ["成交量", "不适用", "XAU/USD 无可信量能"], ["目录覆盖", "32 / 32", "定义完整"]])}
        <div class="sig-na-note">RVOL 与 OBV 对 XAU/USD 为“不适用”。实际利率、美元、CFTC、ETF、期限结构和期权数据尚未接入。</div>
      </div>
    </section>
    ${liveLayerWorkspace("黄金技术诊断", "技术结构与宏观驱动统一查看；缺失数据不补值", [
      { key: "basic", label: "基础信号", items: basic },
      { key: "pattern", label: "K 线形态", items: livePatterns },
      { key: "advanced", label: "高级模型", items: liveAdvancedGold },
    ])}
  </div>`;
}

function findHeading(text) {
  return [...document.querySelectorAll("h1,h2")].find((node) => node.textContent.trim() === text);
}

function insertAfterHeading(text, markup) {
  const heading = findHeading(text);
  if (!heading) return false;
  const card = heading.closest(".rounded-xl.border, article");
  if (!card) return false;
  card.insertAdjacentHTML("afterend", markup);
  return true;
}

function insertBeforeHeading(text, markup) {
  const heading = findHeading(text);
  if (!heading) return false;
  const card = heading.closest("article, .rounded-xl.border");
  if (!card?.parentElement) return false;
  card.insertAdjacentHTML("beforebegin", markup);
  return true;
}

function insertTechnicalDiagnosisAfterTrend() {
  const heading = findHeading("情景预测");
  if (!heading) return false;
  const card = heading.closest("article, .rounded-xl.border");
  if (!card?.parentElement) return false;
  card.parentElement.insertAdjacentHTML("beforebegin", analysisSignalBlock());
  return true;
}

function addGoldDetailLink() {
  const heading = findHeading("大类资产轮动");
  const card = heading?.closest(".rounded-xl.border, article");
  if (!card) return;
  const toolbar = card.firstElementChild;
  if (!toolbar) return;
  const link = document.createElement("a");
  const theme = liveSignalParams.get("theme") === "dark" ? "dark" : "light";
  link.href = `./live-market-gold-signals-v1.html?theme=${theme}`;
  link.className = "focus-ring rounded-md bg-app-surface px-2.5 py-1.5 text-[11px] font-medium text-primary";
  link.textContent = "黄金技术详情";
  toolbar.appendChild(link);
}

function consolidateBoardDetailCards() {
  const heading = findHeading("轮动位置");
  const rotationCard = heading?.closest(".rounded-xl.border, article");
  const overviewCard = rotationCard?.previousElementSibling;
  if (!rotationCard || !overviewCard) return;
  const rotationGrid = rotationCard.querySelector(".grid");
  const overviewGrid = overviewCard.querySelector(".grid");
  for (const item of [...(rotationGrid?.children || [])]) {
    if (item.textContent.includes("资金确认") || item.textContent.includes("数据状态")) {
      continue;
    }
    overviewGrid?.appendChild(item.cloneNode(true));
  }
  overviewCard.classList.add("analysis-merged-card");
  rotationCard.remove();
}

function consolidateAnalysisRanges() {
  const forecastHeading = findHeading("情景预测");
  const riskHeading = findHeading("风险参考区间");
  const forecastCard = forecastHeading?.closest(".rounded-xl.border, article");
  const riskCard = riskHeading?.closest(".rounded-xl.border, article");
  if (!forecastCard || !riskCard) return;

  const riskBody = [...riskCard.children].find((child) => child !== riskCard.firstElementChild);
  if (!riskBody) return;
  const duplicateBar = [...riskBody.querySelectorAll("div")].find(
    (node) => node.textContent.includes("68.17") && node.textContent.includes("72.49") && node.textContent.includes("79.84"),
  );
  duplicateBar?.remove();
  forecastHeading.textContent = "情景与风险区间";
  const subtitle = forecastCard.querySelector("p");
  if (subtitle) subtitle.textContent = "区间来源与技术、估值、情景解释合并";
  forecastCard.classList.add("analysis-merged-card");
  const divider = document.createElement("div");
  divider.className = "border-t border-app-line px-4 pt-3";
  divider.innerHTML = '<p class="text-[11px] font-semibold text-app-ink">区间来源</p>';
  riskBody.insertBefore(divider, riskBody.firstChild);
  forecastCard.appendChild(riskBody);
  riskCard.remove();
}

function removeDuplicateTrendStats() {
  const marker = [...document.querySelectorAll("span")].find(
    (node) => node.textContent.trim().startsWith("MA20 ") && node.textContent.includes("81.55"),
  );
  if (!marker) return;
  let row = marker.parentElement;
  while (row && !(row.textContent.includes("RSI14") && row.textContent.includes("60日压力"))) {
    row = row.parentElement;
  }
  row?.remove();
}

function removePositiveAvailabilityBadges() {
  for (const badge of [...document.querySelectorAll("span")]) {
    if (badge.textContent.trim() !== "可用") continue;
    const card = badge.closest("article, .rounded-xl.border");
    if (card) badge.remove();
  }
}

function enhanceBoardTable() {
  const table = [...document.querySelectorAll("table")].find(
    (candidate) =>
      candidate.textContent.includes("涨跌幅") &&
      candidate.textContent.includes("领涨股") &&
      candidate.textContent.includes("阶段"),
  );
  if (!table) return false;
  const headerRow = table.querySelector("thead tr");
  const headerCells = [...(headerRow?.children || [])];
  const stageHeader = headerCells.find((cell) => cell.textContent.trim() === "阶段");
  if (!headerRow || !stageHeader) return false;
  const stageIndex = headerCells.indexOf(stageHeader);
  stageHeader.textContent = "技术状态";

  const signals = new Map([
    ["白银", ["多头排列", "平台突破"]],
    ["水产养殖", ["底部起涨", "趋势加速"]],
    ["渔业", ["黄金交叉", "龙头共振"]],
    ["贵金属", ["多头排列", "资金累积"]],
    ["印制电路板", ["平台突破", "拥挤升温"]],
    ["元件", ["主升加速", "相对强弱"]],
  ]);
  for (const row of table.querySelectorAll("tbody tr")) {
    const name = row.cells[0]?.innerText.trim().split("\n")[0];
    const stage = row.cells[stageIndex];
    const stageLabel = stage?.textContent.trim() || "待确认";
    const tags = signals.get(name) || ["等待确认"];
    if (stage) {
      stage.innerHTML = `<div class="sig-chip-row"><span class="sig-mini-chip">${stageLabel}</span>${tags.map((tag) => `<span class="sig-mini-chip">${tag}</span>`).join("")}</div>`;
    }
  }
  return true;
}

function enhanceStockTable() {
  const table = [...document.querySelectorAll("table")].find(
    (candidate) =>
      candidate.textContent.includes("最新价") &&
      candidate.textContent.includes("涨跌幅") &&
      candidate.textContent.includes("查看"),
  );
  if (!table) return false;
  const headerRow = table.querySelector("thead tr");
  const headerCells = [...(headerRow?.children || [])];
  const viewHeader = headerCells.find((cell) => cell.textContent.trim() === "查看");
  if (!headerRow || !viewHeader) return false;
  const signalHeader = document.createElement("th");
  signalHeader.className = "px-3 py-2.5 text-left font-medium";
  signalHeader.textContent = "技术信号";
  headerRow.insertBefore(signalHeader, viewHeader);

  const signals = new Map([
    ["平安银行", ["震荡待涨", "多头排列"]],
    ["万 科Ａ", ["空头破位", "顶部反转"]],
    ["深振业Ａ", ["平台突破"]],
    ["全新好", ["死亡交叉"]],
    ["神州高铁", ["等待确认"]],
    ["中国宝安", ["空头排列"]],
    ["*ST美丽", ["空头破位"]],
    ["深物业A", ["底部起涨"]],
    ["南 玻Ａ", ["震荡待涨"]],
    ["沙河股份", ["回踩确认"]],
  ]);
  for (const row of table.querySelectorAll("tbody tr")) {
    const name = row.cells[0]?.innerText.trim().split("\n")[0];
    const viewCell = row.cells[row.cells.length - 1];
    const cell = document.createElement("td");
    cell.className = "px-3 py-2.5";
    cell.innerHTML = `<div class="sig-chip-row">${(signals.get(name) || ["待生成"]).map((tag) => `<span class="sig-mini-chip">${tag}</span>`).join("")}</div>`;
    row.insertBefore(cell, viewCell);
  }
  return true;
}

function removeMovedMarketIndicators() {
  for (const text of ["成长 / 防守轮动", "A-SHARE BREADTH"]) {
    const node = [...document.querySelectorAll("strong,p")].find(
      (candidate) => candidate.textContent.trim() === text,
    );
    if (!node) continue;
    let panel = node;
    while (panel && !(panel.classList.contains("border-t") && panel.classList.contains("px-4"))) {
      panel = panel.parentElement;
    }
    panel?.remove();
  }
}

const page = document.documentElement.dataset.liveSignalPage;
const contentRoot = document.querySelector("main .overflow-y-auto > div");
let inserted = false;
if (page === "market") {
  removeMovedMarketIndicators();
  const heading = findHeading("大类资产轮动");
  const card = heading?.closest(".rounded-xl.border, article");
  if (card) {
    card.insertAdjacentHTML("beforebegin", marketSignalBlock());
    addGoldDetailLink();
    inserted = true;
  }
} else if (page === "gold") {
  const header = contentRoot?.querySelector(":scope > header");
  const nav = contentRoot?.querySelector(":scope > nav");
  if (contentRoot && header && nav) {
    [...contentRoot.children].forEach((child) => {
      if (child !== header && child !== nav) child.remove();
    });
    contentRoot.insertAdjacentHTML("beforeend", goldSignalBlock());
    inserted = true;
  }
} else if (page === "boards") {
  inserted = enhanceBoardTable();
} else if (page === "board-detail") {
  consolidateBoardDetailCards();
  inserted = insertBeforeHeading("成分股", boardSignalBlock(true));
} else if (page === "stocks") {
  inserted = enhanceStockTable();
} else if (page === "stock-detail") {
  contentRoot?.insertAdjacentHTML("beforeend", stockSignalBlock(true));
  inserted = Boolean(contentRoot);
} else if (page === "analysis") {
  removeDuplicateTrendStats();
  removePositiveAvailabilityBadges();
  consolidateAnalysisRanges();
  inserted = insertTechnicalDiagnosisAfterTrend();
}

if (!inserted) {
  const content = document.querySelector("main .overflow-y-auto > div");
  content?.insertAdjacentHTML("beforeend", marketSignalBlock());
}

if (liveSignalParams.get("scroll") === "signals") {
  requestAnimationFrame(() => {
    document.querySelector(".sig-analysis-insert, .sig-page.is-embedded")?.scrollIntoView({
      block: "start",
    });
  });
}

document.addEventListener("click", (event) => {
  const layerTab = event.target.closest("[data-live-layer-tab]");
  if (layerTab) {
    const workspace = layerTab.closest(".sig-panel");
    const layer = layerTab.dataset.liveLayerTab;
    workspace.querySelectorAll("[data-live-layer-tab]").forEach((button) => {
      const active = button === layerTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    workspace.querySelectorAll("[data-live-layer-content]").forEach((content) => {
      content.classList.toggle("is-active", content.dataset.liveLayerContent === layer);
    });
    workspace.querySelectorAll("[data-live-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.liveFilter === "all");
    });
    workspace.querySelectorAll(".sig-matrix-row").forEach((row) => {
      row.style.display = "";
    });
    return;
  }
  const expand = event.target.closest("[data-live-expand]");
  if (expand) {
    const detail = document.getElementById(expand.dataset.liveExpand);
    if (!detail) return;
    const open = !detail.classList.contains("is-open");
    detail.classList.toggle("is-open", open);
    expand.setAttribute("aria-expanded", String(open));
    expand.textContent = open ? "−" : "+";
    return;
  }
  const filter = event.target.closest("[data-live-filter]");
  if (filter) {
    const panel = filter.closest(".sig-panel");
    panel.querySelectorAll("[data-live-filter]").forEach((button) => button.classList.toggle("is-active", button === filter));
    const status = filter.dataset.liveFilter;
    panel.querySelectorAll(".sig-matrix-row").forEach((row) => {
      row.style.display = status === "all" || row.dataset.sigStatus === status ? "" : "none";
    });
  }
});
