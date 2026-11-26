const stockSignalBasic = [
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

const stockSignalPatterns = [
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

const stockSignalAdvanced = [
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

const stockSignalMicro = [
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

function stockSignalStatus(status, label) {
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

function stockSignalRows(items) {
  return items.map(([id, label, status, statusLabel, value, note]) => {
    const detailId = `stock-signal-${id}`;
    return `<tr class="sig-matrix-row" data-sig-status="${status}">
      <td><div class="sig-matrix-name"><strong>${label}</strong><small>${id}</small></div></td>
      <td>${stockSignalStatus(status, statusLabel)}</td>
      <td><span class="sig-matrix-value">${value}</span></td>
      <td><span class="sig-matrix-note">${note}</span></td>
      <td><button class="sig-matrix-more" type="button" data-stock-signal-expand="${detailId}" aria-label="展开${label}证据" aria-expanded="false">+</button></td>
    </tr>
    <tr class="sig-detail-row" id="${detailId}">
      <td colspan="5"><div class="sig-evidence">
        <section><b>确认条件</b><p>${note}；状态由 signals 1.0.0 计算。</p></section>
        <section><b>失效条件</b><p>价格结构、趋势斜率或数据质量跌破定义阈值时撤销。</p></section>
        <section><b>数据证据</b><p>as-of 11/20 · ${status === "missing" ? "所需数据尚未接入" : "日线、资金或宽度按定义可用"}。</p></section>
      </div></td>
    </tr>`;
  }).join("");
}

function stockSignalGroup(title, kicker, items) {
  return `<section class="sig-panel">
    <div class="sig-panel-head"><div><h2>${title}</h2><p>${kicker}</p></div><span class="sig-version">${items.length} 项</span></div>
    <div class="sig-toolbar">
      <button class="sig-filter is-active" type="button" data-stock-signal-filter="all">全部</button>
      <button class="sig-filter" type="button" data-stock-signal-filter="on">触发</button>
      <button class="sig-filter" type="button" data-stock-signal-filter="risk">风险</button>
      <button class="sig-filter" type="button" data-stock-signal-filter="low">低置信</button>
      <button class="sig-filter" type="button" data-stock-signal-filter="missing">不可用</button>
    </div>
    <div class="sig-table-wrap">
      <table class="sig-table sig-signal-table">
        <thead><tr><th style="width:28%">信号</th><th style="width:12%">状态</th><th style="width:14%">当前值</th><th style="width:38%">证据</th><th style="width:8%"></th></tr></thead>
        <tbody>${stockSignalRows(items)}</tbody>
      </table>
    </div>
  </section>`;
}

function insertStockSignalMatrix() {
  const params = new URLSearchParams(location.search);
  if ((params.get("view") || "landing") !== "detail") return;
  const mainGrid = document.querySelector(".sa-grid-main");
  if (!mainGrid) return;
  const section = document.createElement("section");
  section.className = "sig-analysis-insert";
  section.setAttribute("aria-label", "技术信号矩阵");
  section.innerHTML = `
    <div class="sig-stats">
      <div class="sig-stat"><span>技术矩阵</span><strong>44</strong><small>4 个层级</small></div>
      <div class="sig-stat"><span>已触发</span><strong>12</strong><small>含 3 个风险</small></div>
      <div class="sig-stat"><span>低置信</span><strong>5</strong><small>样本/覆盖不足</small></div>
      <div class="sig-stat"><span>不可用</span><strong>7</strong><small>Level 2 / 宏观</small></div>
      <div class="sig-stat"><span>验证状态</span><strong>待验证</strong><small>无统一回测证据</small></div>
    </div>
    <div class="sig-analysis-intro">
      <div>
        <span class="sig-summary-state">技术结论：趋势延续，拥挤度上升</span>
        <h2>完整技术证据</h2>
        <p>保留现有价格趋势与研究摘要，在下方补充基础信号、K 线形态、高级模型和微观结构；结论可回到关键证据核对。</p>
      </div>
      <div class="sig-analysis-links">
        <span class="sig-mini-chip">平台突破</span>
        <span class="sig-mini-chip">多头排列</span>
        <span class="sig-mini-chip">龙头共振</span>
        <span class="sig-mini-chip">拥挤升温</span>
      </div>
    </div>
    ${stockSignalGroup("基础信号 · 10", "单指标原子证据，不重复计算形态", stockSignalBasic)}
    ${stockSignalGroup("K 线形态 · 12", "由趋势、价格结构与量能组合形成", stockSignalPatterns)}
    ${stockSignalGroup("高级个股模型 · 10", "选股、资金、质量、事件与多因子", stockSignalAdvanced)}
    ${stockSignalGroup("微观结构 · 12", "盘口与成交事实、代理和缺失数据分层", stockSignalMicro)}`;
  mainGrid.insertAdjacentElement("afterend", section);
}

document.addEventListener("click", event => {
  const expand = event.target.closest("[data-stock-signal-expand]");
  if (expand) {
    const detail = document.getElementById(expand.dataset.stockSignalExpand);
    if (!detail) return;
    const open = !detail.classList.contains("is-open");
    detail.classList.toggle("is-open", open);
    expand.setAttribute("aria-expanded", String(open));
    expand.textContent = open ? "−" : "+";
    return;
  }
  const filter = event.target.closest("[data-stock-signal-filter]");
  if (filter) {
    const panel = filter.closest(".sig-panel");
    panel.querySelectorAll("[data-stock-signal-filter]").forEach(button => button.classList.toggle("is-active", button === filter));
    const status = filter.dataset.stockSignalFilter;
    panel.querySelectorAll(".sig-matrix-row").forEach(row => {
      row.style.display = status === "all" || row.dataset.sigStatus === status ? "" : "none";
    });
  }
});

requestAnimationFrame(insertStockSignalMatrix);
