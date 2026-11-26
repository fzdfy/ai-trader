const SIG_BASIC = [
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

const SIG_PATTERNS = [
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

const SIG_ADV_MARKET = [
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

const SIG_ADV_SECTOR = [
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

const SIG_ADV_STOCK = [
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

const SIG_ADV_GOLD = [
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

const SIG_MICRO = [
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

const SIG_BOARDS = [
  ["BK1036", "半导体设备", "industry", "+3.62%", "黄金交叉 · 平台突破", "18.2 亿", "on", "领先"],
  ["BK1047", "算力基础设施", "industry", "+3.18%", "趋势加速 · 龙头共振", "12.4 亿", "on", "扩散"],
  ["BK0896", "工业母机", "industry", "+2.77%", "底部起涨 · 回踩确认", "8.9 亿", "low", "升温"],
  ["BK0478", "有色金属", "industry", "+2.34%", "多头排列", "6.8 亿", "neutral", "稳定"],
  ["BK1158", "液冷服务器", "concept", "+4.07%", "主升加速 · 拥挤升温", "15.8 亿", "risk", "过热"],
  ["BK1102", "先进封装", "concept", "+3.42%", "平台突破", "11.1 亿", "on", "扩散"],
  ["BK0475", "白酒", "industry", "-0.82%", "死亡交叉 · 空头破位", "-9.6 亿", "risk", "退潮"],
  ["BK0898", "白酒概念", "concept", "-1.04%", "高位滞涨", "-8.1 亿", "risk", "弱势"]
];

const SIG_STOCKS = [
  ["002371.SZ", "北方华创", "半导体设备", "+3.08%", "多因子 84", "突破 · 龙头共振", "on", "候选"],
  ["300308.SZ", "中际旭创", "光模块", "+4.18%", "多因子 88", "主升加速 · 拥挤", "risk", "过热"],
  ["002594.SZ", "比亚迪", "新能源汽车", "+2.06%", "多因子 76", "回踩确认", "on", "观察"],
  ["300750.SZ", "宁德时代", "锂电池", "+1.44%", "多因子 72", "震荡待涨", "neutral", "等待"],
  ["688981.SH", "中芯国际", "半导体制造", "+1.76%", "多因子 79", "平台突破", "on", "候选"],
  ["600036.SH", "招商银行", "银行", "+0.36%", "多因子 61", "多头排列", "neutral", "防守"],
  ["600519.SH", "贵州茅台", "白酒", "-0.72%", "多因子 38", "死亡交叉", "risk", "转弱"],
  ["000858.SZ", "五粮液", "白酒", "-1.14%", "多因子 34", "空头破位", "risk", "弱势"]
];

const sigBaseRenderMarketCenter = renderMarketCenter;

function sigQuery() {
  return new URLSearchParams(location.search);
}

function sigView() {
  const value = sigQuery().get("view") || "overview";
  const detail = sigQuery().get("detail");
  if (value === "boards" && detail === "board") return "board-detail";
  if (value === "stocks" && detail === "stock") return "stock-detail";
  if (value === "gold") return "gold";
  return ["overview", "boards", "stocks"].includes(value) ? value : "overview";
}

function sigState() {
  const value = sigQuery().get("state") || "success";
  return ["success", "loading", "empty", "error", "partial"].includes(value) ? value : "success";
}

function sigStatus(status) {
  const map = {
    on: ["is-on", "触发"],
    risk: ["is-risk", "风险"],
    neutral: ["is-neutral", "中性"],
    low: ["is-low", "低置信"],
    missing: ["is-missing", "不可用"],
    na: ["is-na", "不适用"]
  };
  const [className, label] = map[status] || map.neutral;
  return `<span class="sig-status ${className}">${label}</span>`;
}

function sigStatusText(status, label) {
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

function sigNav(view, patch = {}) {
  const params = sigQuery();
  const mapped = view === "board-detail"
    ? { view: "boards", detail: "board" }
    : view === "stock-detail"
      ? { view: "stocks", detail: "stock" }
      : { view };
  params.set("view", mapped.view);
  if (mapped.detail) params.set("detail", mapped.detail);
  else params.delete("detail");
  params.delete("state");
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}#market`);
  setPage("market");
}

function sigCrumb() {
  const view = sigView();
  const trail = [
    { label: "Apollo Quant", page: "dashboard" },
    { label: "行情中心", page: "market" }
  ];
  const labels = {
    overview: "总览",
    boards: "板块",
    "board-detail": "半导体设备",
    stocks: "个股",
    "stock-detail": "北方华创",
    analysis: "个股分析",
    gold: "黄金分析"
  };
  if (view !== "overview") trail.push({ label: labels[view], current: true });
  else trail.push({ label: "总览", current: true });
  $("#workspaceCrumb").innerHTML = trail.map((item, index) => {
    const separator = index ? '<i class="workspace-crumb-separator" aria-hidden="true">/</i>' : "";
    if (item.current || index === trail.length - 1) {
      return `${separator}<span class="workspace-crumb-item crumb-current" aria-current="page">${item.label}</span>`;
    }
    return `${separator}<button class="workspace-crumb-item${index === 0 ? " crumb-brand" : ""}" type="button" data-sig-nav="${item.page}" data-sig-target-page="${item.page}">${item.label}</button>`;
  }).join("");
}

function sigPageMeta() {
  const view = sigView();
  return {
    overview: ["MARKET STATE · 11.20", "行情中心", "先判断市场状态，再沿板块、个股与黄金核对同一套证据。"],
    boards: ["SECTOR SCAN · 11.20", "板块信号", "把相对强弱、资金、宽度和价格结构放进同一张发现表。"],
    "board-detail": ["BOARD DIAGNOSIS · BK1036", "半导体设备", "板块指数结构、资金持续性与成分股共振的完整证据。"],
    stocks: ["STOCK SCAN · 11.20", "个股信号", "只保留适合发现的信号摘要，完整 44 项进入个股分析。"],
    "stock-detail": ["QUICK QUOTE · 002371.SZ", "北方华创", "快速核对趋势标签、量价状态和微观结构可用性。"],
    analysis: ["STOCK RESEARCH · 002371.SZ", "个股分析", "44 项技术证据与基本面、资金和研报上下文并列审阅。"],
    gold: ["CROSS ASSET · XAUUSD", "黄金分析", "技术结构可用，宏观驱动按真实数据接入状态逐项说明。"]
  }[view];
}

function sigPageHead(meta = sigPageMeta(), actions = "") {
  return `<header class="sig-page-head">
    <div>
      <div class="sig-eyebrow">${meta[0]}</div>
      <h1>${meta[1]}</h1>
      <p>${meta[2]}</p>
    </div>
    <div class="sig-head-actions">
      <span class="sig-snapshot"><i></i>11/20 收盘</span>
      <span class="sig-version"><i></i>signals 1.0.0</span>
      ${actions || `<button class="sig-secondary" type="button" data-sig-toast="已刷新当前快照">刷新数据</button>`}
    </div>
  </header>`;
}

function sigTabs() {
  const view = sigView();
  const active = view === "board-detail" ? "boards" : view === "stock-detail" || view === "analysis" ? "stocks" : view;
  return `<nav class="sig-tabs" aria-label="行情中心模块">
    <button class="sig-tab ${active === "overview" ? "is-active" : ""}" type="button" data-sig-nav="overview">总览 <small>32 项</small></button>
    <button class="sig-tab ${active === "boards" ? "is-active" : ""}" type="button" data-sig-nav="boards">板块 <small>496</small></button>
    <button class="sig-tab ${active === "stocks" ? "is-active" : ""}" type="button" data-sig-nav="stocks">个股 <small>全市场</small></button>
    <button class="sig-tab ${active === "gold" ? "is-active" : ""}" type="button" data-sig-nav="gold">黄金 <small>XAU/USD</small></button>
  </nav>`;
}

function sigStats(items) {
  return `<section class="sig-stats">${items.map(([label, value, note]) => `
    <div class="sig-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>
  `).join("")}</section>`;
}

function sigMatrixRows(items) {
  return items.map(([id, label, status, statusLabel, value, note]) => {
    const detailId = `sig-detail-${id.replaceAll("_", "-")}`;
    return `
      <tr class="sig-matrix-row" data-sig-status="${status}">
        <td><div class="sig-matrix-name"><strong>${label}</strong><small>${id}</small></div></td>
        <td>${sigStatusText(status, statusLabel)}</td>
        <td><span class="sig-matrix-value">${value}</span></td>
        <td><span class="sig-matrix-note">${note}</span></td>
        <td><button class="sig-matrix-more" type="button" data-sig-expand="${detailId}" aria-label="展开${label}证据" aria-expanded="false">+</button></td>
      </tr>
      <tr class="sig-detail-row" id="${detailId}">
        <td colspan="5"><div class="sig-evidence">
          <section><b>确认条件</b><p>${note}；状态由规则版本 1.0.0 计算。</p></section>
          <section><b>失效条件</b><p>价格结构、趋势斜率或数据质量跌破定义阈值时撤销。</p></section>
          <section><b>数据证据</b><p>as-of 11/20 · 目录版本 1.0.0 · ${status === "missing" ? "所需数据尚未接入" : "日线 / 资金 / 宽度按定义可用"}。</p></section>
        </div></td>
      </tr>`;
  }).join("");
}

function sigMatrixGroup(title, subtitle, items) {
  return `<section class="sig-panel">
    <div class="sig-panel-head">
      <div><h2>${title}</h2><p>${subtitle}</p></div>
      <span class="sig-version"><i></i>${items.length} 项</span>
    </div>
    <div class="sig-toolbar">
      <button class="sig-filter is-active" type="button" data-sig-filter="all">全部</button>
      <button class="sig-filter" type="button" data-sig-filter="on">触发</button>
      <button class="sig-filter" type="button" data-sig-filter="risk">风险</button>
      <button class="sig-filter" type="button" data-sig-filter="low">低置信</button>
      <button class="sig-filter" type="button" data-sig-filter="missing">不可用</button>
    </div>
    <div class="sig-table-wrap">
      <table class="sig-table sig-signal-table">
        <thead><tr><th style="width:28%">信号</th><th style="width:12%">状态</th><th style="width:14%">当前值</th><th style="width:38%">证据</th><th style="width:8%"></th></tr></thead>
        <tbody>${sigMatrixRows(items)}</tbody>
      </table>
    </div>
  </section>`;
}

function sigChart() {
  return `<div class="sig-chart-panel">
    <svg class="sig-chart" viewBox="0 0 760 150" role="img" aria-label="上证指数最近 120 个交易日趋势示意图">
      <path class="area" d="M4 126 L44 120 L84 128 L124 107 L164 114 L204 86 L244 92 L284 68 L324 76 L364 48 L404 61 L444 42 L484 54 L524 38 L564 60 L604 49 L644 71 L684 58 L724 74 L756 64 L756 146 L4 146 Z"></path>
      <path class="line" d="M4 126 L44 120 L84 128 L124 107 L164 114 L204 86 L244 92 L284 68 L324 76 L364 48 L404 61 L444 42 L484 54 L524 38 L564 60 L604 49 L644 71 L684 58 L724 74 L756 64"></path>
      <path class="ma" d="M4 118 C150 104, 260 91, 380 72 S610 54, 756 58"></path>
      <line class="resistance" x1="4" y1="38" x2="756" y2="38"></line>
      <line class="support" x1="4" y1="128" x2="756" y2="128"></line>
      <text x="694" y="32">压力 3,412</text>
      <text x="684" y="142">支撑 3,228</text>
      <text x="8" y="146">08-21</text><text x="374" y="146">10-09</text><text x="720" y="146">11-20</text>
    </svg>
    <div class="sig-legend"><span><i></i>上证指数</span><span><i></i>MA20</span><span><i></i>压力</span><span><i></i>支撑</span></div>
  </div>`;
}

function sigLayerRows() {
  return `<div class="sig-layer-list">
    <div class="sig-layer-row"><strong>基础信号</strong><span>7 / 10 可用</span><p>MA200 上方 · RVOL 1.62× · ADX 27.4</p><button type="button" data-sig-nav="analysis">查看 10 项</button></div>
    <div class="sig-layer-row"><strong>K 线形态</strong><span>4 / 12 形成</span><p>震荡待涨 · 黄金交叉 · 多头排列 · 平台突破</p><button type="button" data-sig-nav="analysis">查看 12 项</button></div>
    <div class="sig-layer-row"><strong>高级模型</strong><span>6 / 10 可用</span><p>Risk-On · 宽度扩散 · 风格扩散 · 跨资产相关</p><button type="button" data-sig-nav="analysis">查看 10 项</button></div>
  </div>`;
}

function sigBanner() {
  return `<div class="sig-banner">${icon("database")}<span><strong>部分数据不可用</strong> · 宏观利率、信用和 HMM 模型未接入；技术信号与其他页面模块继续展示。</span></div>`;
}

function sigStateBlock(state) {
  if (state === "loading") {
    return `<div class="sig-loading"><div class="sig-skeleton"><i></i><i></i><i></i><i></i></div></div>`;
  }
  const error = state === "error";
  return `<div class="${error ? "sig-error" : "sig-empty"}">
    <div class="sig-state-copy">
      <span class="sig-state-icon">${icon(error ? "database" : "layout")}</span>
      <h2>${error ? "信号快照暂时不可用" : "当前对象暂无可用信号"}</h2>
      <p>${error ? "计算服务未返回当前快照。行情、资金和研报模块仍可独立读取，可只重试信号区域。" : "最新业务日期没有满足条件的信号。不会用中性值或历史旧值填补空结果。"}</p>
      <button class="sig-secondary" type="button" data-sig-retry>重试信号区域</button>
    </div>
  </div>`;
}

function sigOverview(partial) {
  return `${sigStats([
    ["已触发", "9", "基础 5 · 形态 4"],
    ["形成中 / 风险", "5", "等待确认 3 · 风险 2"],
    ["低置信", "3", "样本或覆盖不足"],
    ["不可用 / 不适用", "6", "宏观与 HMM"],
    ["目录完整度", "32 / 32", "signals 1.0.0"]
  ])}
  <div class="sig-layout">
    <section class="sig-panel is-flush">
      <div class="sig-panel-head"><div><h2>A 股市场状态</h2><p>指数结构 × 市场宽度 × 风格扩散</p></div><span class="sig-status is-on">风险偏好改善</span></div>
      <div class="sig-panel-body">
        <div class="sig-summary-hero">
          <div>
            <span class="sig-summary-state">观察：震荡待涨</span>
            <h2>上方压力仍在，<br>但内部参与度开始改善。</h2>
            <p>上证指数站上 MA200，成长、小盘与周期证据同步改善；成交扩张得到确认，但利率和信用周期数据尚未接入。</p>
          </div>
          <div class="sig-score-side">
            <div><span class="sig-score-label">MARKET STATE SCORE</span><div class="sig-score-value">68<small>/ 100</small></div></div>
            <div><div class="sig-score-track"><i></i></div><div class="sig-score-meta"><span>偏强但未确认</span><span>6 / 10 高级模型</span></div></div>
          </div>
        </div>
        ${sigLayerRows()}
      </div>
    </section>
    <section class="sig-panel">
      <div class="sig-panel-head"><div><h2>跨资产背景</h2><p>共同交易日 · 20D 相对强弱</p></div><span class="sig-snapshot"><i></i>11/20</span></div>
      <div class="sig-panel-body">
        <div class="sig-cross-card">
          <button class="sig-cross-row" type="button" data-sig-nav="overview" style="border:0;text-align:left"><i>沪</i><span><strong>上证指数</strong><small>市场基准</small></span><b>+1.8%</b>${sigStatusText("on","偏强")}</button>
          <button class="sig-cross-row" type="button" data-sig-nav="gold" style="border:0;text-align:left"><i>金</i><span><strong>伦敦金 XAU/USD</strong><small>USD/oz · 黄金分析</small></span><b>+0.6%</b>${sigStatusText("neutral","常态")}</button>
          <button class="sig-cross-row" type="button" data-sig-nav="overview" style="border:0;text-align:left"><i>纳</i><span><strong>纳斯达克</strong><small>跨市场背景</small></span><b>+0.7%</b>${sigStatusText("neutral","同步")}</button>
        </div>
        <div class="sig-na-note">${icon("spark")}<span>跨资产只提供背景，不改变 A 股状态评分。黄金宏观驱动尚未接入，黄金详情会逐项标注。</span></div>
      </div>
    </section>
  </div>
  <div class="sig-layout">
    <section class="sig-panel">
      <div class="sig-panel-head"><div><h2>触发链</h2><p>优先展示对当前判断贡献最大的证据</p></div><button class="sig-ghost" type="button" data-sig-nav="analysis">查看完整矩阵 ${icon("arrow-right")}</button></div>
      <div class="sig-panel-body">
        <div class="sig-trigger-list">
          <div class="sig-trigger-row"><div><strong>平台突破</strong><small>K 线形态 · threshold 1.0.0</small></div><span class="sig-trigger-value">+1.8%</span>${sigStatusText("on","已确认")}</div>
          <div class="sig-trigger-row"><div><strong>市场宽度扩散</strong><small>高级模型 · 站上 MA200 比例</small></div><span class="sig-trigger-value">61.2%</span>${sigStatusText("on","扩散")}</div>
          <div class="sig-trigger-row"><div><strong>多因子风格扩散</strong><small>高级模型 · 6 个风格指数</small></div><span class="sig-trigger-value">4 / 6</span>${sigStatusText("on","扩散")}</div>
          <div class="sig-trigger-row"><div><strong>利率曲线与估值周期</strong><small>高级模型 · 数据未接入</small></div><span class="sig-trigger-value">—</span>${sigStatusText("missing","不可用")}</div>
        </div>
      </div>
    </section>
    <section class="sig-panel">
      <div class="sig-panel-head"><div><h2>数据完整度</h2><p>证据缺口不会折算成中性</p></div></div>
      <div class="sig-panel-body">
        <div class="sig-kv-row">
          <div class="sig-kv"><span>行情 / 形态</span><strong>可用</strong></div>
          <div class="sig-kv"><span>资金 / 宽度</span><strong>可用</strong></div>
          <div class="sig-kv"><span>宏观 / 信用</span><strong>缺失</strong></div>
        </div>
        <div class="sig-na-note">${icon("database")}<span>缺失的 6 项信号保留在目录中，并显示具体数据要求。页面不会把它们计为中性或触发。</span></div>
      </div>
    </section>
  </div>`;
}

function sigBoards(partial) {
  return `${sigStats([
    ["行业 / 概念", "496", "完整板块目录"],
    ["触发形态", "84", "行业 51 · 概念 33"],
    ["相对强弱领先", "42", "20D 超额 > 0"],
    ["拥挤升温", "17", "成交集中度高位"],
    ["数据完整度", "91%", "资金与宽度可用"]
  ])}
  <section class="sig-panel">
    <div class="sig-panel-head"><div><h2>板块信号扫描</h2><p>点击一行进入 32 项完整诊断</p></div><div class="sig-head-actions"><button class="sig-secondary is-active" type="button">行业</button><button class="sig-secondary" type="button">概念</button></div></div>
    <div class="sig-toolbar"><button class="sig-filter is-active" type="button">全部</button><button class="sig-filter" type="button">相对强弱</button><button class="sig-filter" type="button">资金持续</button><button class="sig-filter" type="button">拥挤风险</button></div>
    <div class="sig-table-wrap">
      <table class="sig-table">
        <thead><tr><th style="width:24%">板块</th><th style="width:10%">涨跌</th><th style="width:26%">关键形态</th><th style="width:12%">主力资金</th><th style="width:12%">状态</th><th style="width:8%">详情</th></tr></thead>
        <tbody>${SIG_BOARDS.filter(row => row[2] === "industry").map((row, index) => `
          <tr data-sig-nav="board-detail" data-sig-code="${row[0]}">
            <td><strong>${String(index + 1).padStart(2,"0")} · ${row[1]}</strong><small>${row[0]} · ${row[2] === "industry" ? "行业" : "概念"}</small></td>
            <td>${row[3]}</td>
            <td><div class="sig-chip-row">${row[4].split(" · ").map(item => `<span class="sig-mini-chip">${item}</span>`).join("")}</div></td>
            <td>${row[5]}</td>
            <td>${sigStatusText(row[6], row[7])}</td>
            <td>${icon("arrow-right")}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
  </section>
  <div class="sig-layout">
    <section class="sig-panel">
      <div class="sig-panel-head"><div><h2>轮动强度</h2><p>多周期动量与相对强弱排名</p></div></div>
      <div class="sig-panel-body"><div class="sig-trigger-list">
        <div class="sig-trigger-row"><div><strong>半导体设备</strong><small>20D +18.2% · 60D +31.4%</small></div><span class="sig-trigger-value">88</span>${sigStatusText("on","领先")}</div>
        <div class="sig-trigger-row"><div><strong>算力基础设施</strong><small>20D +14.7% · 60D +26.1%</small></div><span class="sig-trigger-value">84</span>${sigStatusText("on","扩散")}</div>
        <div class="sig-trigger-row"><div><strong>工业母机</strong><small>20D +9.8% · 60D +12.4%</small></div><span class="sig-trigger-value">73</span>${sigStatusText("low","升温")}</div>
      </div></div>
    </section>
    <section class="sig-panel"><div class="sig-panel-head"><div><h2>板块数据缺口</h2><p>盈利与产业链证据仍未接入</p></div></div><div class="sig-panel-body"><div class="sig-na-note">${icon("database")}<span>盈利周期覆盖不足 80%，产业链景气传导未接入。相关信号标记低置信或不可用。</span></div></div></section>
  </div>`;
}

function sigBoardDetail() {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>技术信号诊断</h2><p>在现有板块行情、资金、轮动和成分股之后追加完整证据</p></div><span class="sig-status is-on">领先</span></div>
    <div class="sig-panel-body">
      <div class="sig-trigger-list">
        <div class="sig-trigger-row"><div><strong>平台突破</strong><small>放量脱离 60 日平台</small></div><span class="sig-trigger-value">+3.62%</span>${sigStatusText("on","确认")}</div>
        <div class="sig-trigger-row"><div><strong>龙头共振</strong><small>北方华创等 4/5 龙头站上 MA20</small></div><span class="sig-trigger-value">4 / 5</span>${sigStatusText("on","共振")}</div>
        <div class="sig-trigger-row"><div><strong>主力资金持续</strong><small>5 日主力净流入连续为正向</small></div><span class="sig-trigger-value">+18.2亿</span>${sigStatusText("on","流入")}</div>
        <div class="sig-trigger-row"><div><strong>拥挤度升温</strong><small>成交集中度进入 83% 历史分位</small></div><span class="sig-trigger-value">83%</span>${sigStatusText("risk","风险")}</div>
      </div>
    </div>
  </section>
  ${sigMatrixGroup("基础信号", "10 个原子证据", SIG_BASIC)}
  ${sigMatrixGroup("K 线形态", "12 个组合后的价格结构", SIG_PATTERNS)}
  ${sigMatrixGroup("高级模型", "10 个轮动、资金与景气模型", SIG_ADV_SECTOR)}`;
}

function sigStocks(partial) {
  return `${sigStats([
    ["全市场发现", "5,214", "最新行情快照"],
    ["多因子候选", "126", "综合分 ≥ 75"],
    ["形态触发", "482", "已去重交易事件"],
    ["风险形态", "93", "顶部/死亡交叉/破位"],
    ["微观覆盖", "18%", "仅最近交易日可分笔"]
  ])}
  <section class="sig-panel">
    <div class="sig-panel-head"><div><h2>个股信号扫描</h2><p>列表不展开 44 项，只保留发现型证据</p></div><button class="sig-secondary" type="button">加入自选</button></div>
    <div class="sig-toolbar"><button class="sig-filter is-active" type="button">全市场</button><button class="sig-filter" type="button">我的自选</button><button class="sig-filter" type="button">多因子 ≥ 80</button><button class="sig-filter" type="button">形态触发</button><span class="sig-table-meta">按综合信号强度排序</span></div>
    <div class="sig-table-wrap">
      <table class="sig-table">
        <thead><tr><th style="width:22%">股票</th><th style="width:11%">涨跌</th><th style="width:13%">多因子</th><th style="width:26%">关键信号</th><th style="width:12%">资金</th><th style="width:10%">状态</th></tr></thead>
        <tbody>${SIG_STOCKS.map(row => `
          <tr data-sig-nav="stock-detail" data-sig-code="${row[0]}">
            <td><strong>${row[1]}</strong><small>${row[0]} · ${row[2]}</small></td>
            <td class="${row[3].startsWith("-") ? "sig-price-down" : "sig-price-up"}">${row[3]}</td>
            <td>${row[4]}</td>
            <td><div class="sig-chip-row">${row[5].split(" · ").map(item => `<span class="sig-mini-chip">${item}</span>`).join("")}</div></td>
            <td>${row[1] === "北方华创" ? "+10.2 亿" : "—"}</td>
            <td>${sigStatusText(row[6], row[7])}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function sigStockDetail() {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>技术信号摘要</h2><p>快速行情详情只展示标签和数据边界</p></div><span class="sig-status is-on">候选</span></div>
    <div class="sig-panel-body">
      <div class="sig-chip-row">
        <span class="sig-mini-chip">平台突破</span><span class="sig-mini-chip">多头排列</span><span class="sig-mini-chip">龙头共振</span><span class="sig-mini-chip">资金累积</span>
      </div>
      <div class="sig-kv-row">
        <div class="sig-kv"><span>高级多因子</span><strong>84 / 100</strong></div>
        <div class="sig-kv"><span>微观可用</span><strong>5 / 12</strong></div>
        <div class="sig-kv"><span>验证状态</span><strong>待验证</strong></div>
      </div>
      <div class="sig-na-note">${icon("spark")}<span>完整 10 项基础信号、12 个形态、10 个高级模型和 12 个微观指标进入个股分析。</span></div>
      <button class="sig-primary" type="button" data-sig-nav="analysis" style="width:100%;margin-top:12px">进入个股分析 ${icon("arrow-right")}</button>
    </div>
  </section>`;
}

function sigAnalysis() {
  return `<div class="sig-stats">
    <div class="sig-stat"><span>技术矩阵</span><strong>44</strong><small>4 个层级</small></div>
    <div class="sig-stat"><span>已触发</span><strong>12</strong><small>含 3 个风险</small></div>
    <div class="sig-stat"><span>低置信</span><strong>5</strong><small>样本/覆盖不足</small></div>
    <div class="sig-stat"><span>不可用</span><strong>7</strong><small>Level 2 / 宏观</small></div>
    <div class="sig-stat"><span>验证状态</span><strong>待验证</strong><small>无统一回测证据</small></div>
  </div>
  <div class="sig-layout">
    <section class="sig-panel"><div class="sig-panel-head"><div><h2>价格与趋势</h2><p>前复权收盘价 · 最近 120 个交易日</p></div><span class="sig-status is-on">多头排列</span></div>${sigChart()}</section>
    <section class="sig-panel"><div class="sig-panel-head"><div><h2>研究摘要</h2><p>结论引用结构化信号</p></div><span class="sig-version">84%</span></div><div class="sig-panel-body">
      <div class="sig-summary-state">趋势延续，拥挤度上升</div>
      <h2 style="margin:14px 0 0;font-size:24px;line-height:1.25;letter-spacing:-.035em">行业与个股共振，<br>但短线需等待回踩确认。</h2>
      <p style="margin:9px 0 0;color:var(--muted);font-size:11px;line-height:1.75">参考 <span class="sig-mini-chip">平台突破</span> <span class="sig-mini-chip">Alpha 动量</span> <span class="sig-mini-chip">龙头共振</span>。结论不包含未经验证的胜率。</p>
      <div class="sig-na-note">${icon("database")}<span>微观结构只有最近交易日近似分笔，不能作为跨日稳定结论。</span></div>
    </div></section>
  </div>
  ${sigMatrixGroup("基础信号 · 10", "单指标原子证据，不重复计算形态", SIG_BASIC)}
  ${sigMatrixGroup("K 线形态 · 12", "由趋势、价格结构与量能组合形成", SIG_PATTERNS)}
  ${sigMatrixGroup("高级个股模型 · 10", "选股、资金、质量、事件与多因子", SIG_ADV_STOCK)}
  ${sigMatrixGroup("微观结构 · 12", "盘口与成交事实、代理和缺失数据分层", SIG_MICRO)}`;
}

function sigGold() {
  return `${sigStats([
    ["技术信号", "22 / 22", "基础 8 · 形态 12"],
    ["宏观模型", "0 / 10", "真实数据未接入"],
    ["报价", "2,701.3", "USD/oz"],
    ["成交量", "不适用", "XAU/USD 无可信量能"],
    ["目录完整度", "32 / 32", "signals 1.0.0"]
  ])}
  <div class="sig-layout">
    <section class="sig-panel"><div class="sig-panel-head"><div><h2>伦敦金 XAU/USD</h2><p>USD/oz · 连续交易时段</p></div><span class="sig-status is-on">多头排列</span></div>${sigChart()}</section>
    <section class="sig-panel"><div class="sig-panel-head"><div><h2>技术可用，宏观待接入</h2><p>不把价格代理当作实际利率或持仓证据</p></div></div><div class="sig-panel-body">
      <div class="sig-na-note">${icon("database")}<span>RVOL 与 OBV 对 XAU/USD 为“不适用”。实际利率、美元、CFTC、ETF、期限结构和期权数据尚未接入。</span></div>
      <div class="sig-kv-row"><div class="sig-kv"><span>基础可用</span><strong>8 / 10</strong></div><div class="sig-kv"><span>形态可用</span><strong>12 / 12</strong></div><div class="sig-kv"><span>宏观高置信</span><strong>0 / 10</strong></div></div>
    </div></section>
  </div>
  ${sigMatrixGroup("黄金基础信号", "量能条件不适用，不使用替代值", SIG_BASIC.map(item => item[0] === "rvol" || item[0] === "obv_trend" ? [item[0], item[1], "na", "不适用", "—", "XAU/USD 无可信成交量"] : item))}
  ${sigMatrixGroup("黄金 K 线形态", "只用价格结构、波动率和关键位确认", SIG_PATTERNS)}
  ${sigMatrixGroup("黄金高级模型", "目录完整保留，缺数据时明确不可用", SIG_ADV_GOLD)}`;
}

function sigRenderMarketCenter() {
  const requested = sigView();
  if (requested === "gold") {
    requestAnimationFrame(() => {
      $("#workspaceCrumb").innerHTML = `<button class="workspace-crumb-item crumb-brand" type="button" data-sig-nav="dashboard">Apollo Quant</button><i class="workspace-crumb-separator" aria-hidden="true">/</i><button class="workspace-crumb-item" type="button" data-sig-nav="overview">行情中心</button><i class="workspace-crumb-separator" aria-hidden="true">/</i><span class="workspace-crumb-item crumb-current" aria-current="page">黄金分析</span>`;
    });
    return `<div class="mkt-page">
      ${mktPageHead()}
      ${mktTabsMarkup()}
      <div class="sig-page is-embedded">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <button class="sig-ghost" type="button" data-sig-nav="overview">${icon("arrow-left")} 返回大类资产轮动</button>
          <span class="sig-version"><i></i>XAU/USD · USD/oz</span>
        </div>
        ${sigGold()}
      </div>
    </div>`;
  }
  const base = sigBaseRenderMarketCenter();
  const state = mktCurrentState();
  const view = mktCurrentView();
  const detail = mktParams().get("detail");
  let addon = "";
  if (state !== "loading" && state !== "empty" && state !== "error") {
    addon = view === "boards" && detail === "board" ? sigBoardDetail()
      : view === "boards" ? sigBoardScanAddon()
      : view === "stocks" && detail === "stock" ? sigStockDetail()
      : view === "stocks" ? sigStockScanAddon()
      : sigMarketOverviewAddon();
  }
  if (!addon) return base;
  const insertAt = base.lastIndexOf("</div>");
  const embedded = `<div class="sig-page is-embedded">${state === "partial" ? sigBanner() : ""}${addon}</div>`;
  requestAnimationFrame(() => renderBreadcrumb("market"));
  return `${base.slice(0, insertAt)}${embedded}${base.slice(insertAt)}`;
}

function sigMarketOverviewAddon() {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>A 股技术信号</h2><p>在主要指数、市场温度与资金结构之外补充可追溯的技术状态</p></div><span class="sig-status is-on">风险偏好改善</span></div>
    <div class="sig-panel-body">
      <div class="sig-summary-hero">
        <div>
          <span class="sig-summary-state">观察：震荡待涨</span>
          <h2>上方压力仍在，<br>但内部参与度开始改善。</h2>
          <p>指数站上 MA200，宽度、风格扩散和成交结构同步改善；宏观利率与信用模型仍未接入。</p>
        </div>
        <div class="sig-score-side">
          <div><span class="sig-score-label">技术状态</span><div class="sig-score-value">68<small>/ 100</small></div></div>
          <div><div class="sig-score-track"><i></i></div><div class="sig-score-meta"><span>偏强但未确认</span><span>6 / 10 高级模型</span></div></div>
        </div>
      </div>
      ${sigLayerRows()}
      <div style="margin-top:14px">${sigStats([["已触发","9","基础 5 · 形态 4"],["形成中","5","等待确认 3 · 风险 2"],["低置信","3","样本不足"],["不可用","6","宏观与 HMM"],["完整度","32 / 32","signals 1.0.0"]])}</div>
    </div>
  </section>`;
}

function sigBoardScanAddon() {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>板块技术信号</h2><p>保留上方排行与热力图，在同一页面补充可排序的技术触发</p></div><span class="sig-version"><i></i>行业 · 前 5</span></div>
    <div class="sig-table-wrap">
      <table class="sig-table">
        <thead><tr><th style="width:28%">板块</th><th style="width:20%">关键形态</th><th style="width:16%">相对强弱</th><th style="width:16%">状态</th><th style="width:20%">数据完整度</th></tr></thead>
        <tbody>${SIG_BOARDS.filter(row => row[2] === "industry").slice(0,5).map(row => `<tr data-sig-nav="board-detail" data-sig-code="${row[0]}">
          <td><strong>${row[1]}</strong><small>${row[0]} · 行业</small></td>
          <td><div class="sig-chip-row">${row[4].split(" · ").map(item => `<span class="sig-mini-chip">${item}</span>`).join("")}</div></td>
          <td>${row[3]}</td>
          <td>${sigStatusText(row[6], row[7])}</td>
          <td>${row[1] === "工业母机" ? "盈利覆盖 54%" : "可用"}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function sigStockScanAddon() {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>个股信号扫描</h2><p>不改现有行情表，只补充适合发现与排序的技术摘要</p></div><span class="sig-version"><i></i>44 项详情进入个股分析</span></div>
    <div class="sig-table-wrap">
      <table class="sig-table">
        <thead><tr><th style="width:24%">股票</th><th style="width:24%">关键信号</th><th style="width:16%">多因子</th><th style="width:16%">微观覆盖</th><th style="width:20%">状态</th></tr></thead>
        <tbody>${SIG_STOCKS.slice(0,5).map(row => `<tr data-sig-nav="stock-detail" data-sig-code="${row[0]}">
          <td><strong>${row[1]}</strong><small>${row[0]} · ${row[2]}</small></td>
          <td><div class="sig-chip-row">${row[5].split(" · ").map(item => `<span class="sig-mini-chip">${item}</span>`).join("")}</div></td>
          <td>${row[4]}</td>
          <td>${row[1] === "北方华创" ? "分笔近似" : "日线"}</td>
          <td>${sigStatusText(row[6], row[7])}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

renderMarketCenter = sigRenderMarketCenter;

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-sig-nav]");
  if (nav) {
    event.preventDefault();
    const target = nav.dataset.sigNav;
    if (target === "analysis") {
      const theme = sigQuery().get("theme") === "dark" ? "dark" : "light";
      location.href = `./quant-workbench-stock-analysis-signals-v1.html?view=detail&theme=${theme}`;
      return;
    }
    if (target === "dashboard") setPage("dashboard");
    else if (target === "market") sigNav("overview");
    else sigNav(target, nav.dataset.sigCode ? { code: nav.dataset.sigCode } : {});
    return;
  }
  const expand = event.target.closest("[data-sig-expand]");
  if (expand) {
    const detail = document.getElementById(expand.dataset.sigExpand);
    if (!detail) return;
    const open = !detail.classList.contains("is-open");
    detail.classList.toggle("is-open", open);
    expand.setAttribute("aria-expanded", String(open));
    expand.textContent = open ? "−" : "+";
    return;
  }
  const filter = event.target.closest("[data-sig-filter]");
  if (filter) {
    const panel = filter.closest(".sig-panel");
    panel.querySelectorAll("[data-sig-filter]").forEach(button => button.classList.toggle("is-active", button === filter));
    const status = filter.dataset.sigFilter;
    panel.querySelectorAll(".sig-matrix-row").forEach(row => {
      row.style.display = status === "all" || row.dataset.sigStatus === status ? "" : "none";
    });
    return;
  }
  const retry = event.target.closest("[data-sig-retry]");
  if (retry) {
    const params = sigQuery();
    params.delete("state");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}#market`);
    setPage("market");
    return;
  }
  const toast = event.target.closest("[data-sig-toast]");
  if (toast && typeof showToast === "function") showToast(toast.dataset.sigToast);
});

setPage("market");
