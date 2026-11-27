(() => {
  const root = document.querySelector("#workspace-root");
  const signalDrawerRoot = document.querySelector("#signal-drawer-root");
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
  const initialDrawer = params.get("drawer");
  const initialDrawerItem = params.get("item");
  let activeSignalGroup = null;
  let expandedDrawerItem = null;
  let signalTrigger = null;

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

  const signalCatalog = {
    "ma-bearish": {
      group: "趋势与均线",
      title: "均线空头排列",
      status: "已触发",
      tone: "risk",
      value: "MA5 77.70 · MA10 78.98 · MA20 81.55",
      summary: "短中期均线依次向下，收盘价位于 MA20 下方，趋势仍由空方主导。",
      evidence: [
        "MA5 < MA10 < MA20，三条均线间距继续扩大。",
        "收盘价低于 MA20 约 9.7%，且连续 8 个交易日未重新站上。",
        "趋势组共 12 / 16 项信号触发，方向一致。",
      ],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
      rule: "比较均线排列、斜率与动量方向，并以收盘价相对关键均线的位置确认趋势。",
      parameterNote: "period=5/10/20/60/200 · slope_window=20 · min_history=252",
      confirmation: "收盘重新站上 MA20，且 MA5 / MA10 斜率转向向上。",
      invalidation: "收盘跌破 20D 支撑，且趋势组仍保持偏空。",
    },
    "macd-below": {
      group: "趋势与均线",
      title: "MACD 水下",
      status: "已触发",
      tone: "risk",
      value: "DIF -1.82 · DEA -1.41 · 柱值 -0.41",
      summary: "DIF 与 DEA 均位于零轴下方，动能仍处修复前的偏弱阶段。",
      evidence: ["DIF 连续 12 个交易日位于零轴下。", "柱体仍为负值，但缩短速度放缓。", "暂未形成金叉。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "support-20d": {
      group: "趋势与均线",
      title: "接近 20D 支撑",
      status: "观察",
      tone: "observe",
      value: "支撑位 72.80 · 收盘 73.62",
      summary: "价格仍在 20 日支撑上方，但距离不足 1.2%，需要观察放量承接。",
      evidence: ["距支撑位仅 1.12%。", "近 3 日成交量低于 20 日均量。", "若收盘跌破 72.80，支撑判断失效。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "volume-down": {
      group: "成交量与资金",
      title: "缩量下行",
      status: "已触发",
      tone: "risk",
      value: "量比 0.78 · 5 日均量 -18%",
      summary: "价格回落但成交量同步收缩，抛压没有放大，反转仍缺主动买盘确认。",
      evidence: ["成交量低于 20 日均量。", "下跌日成交额未明显放大。", "尾盘未出现放量回补。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "main-outflow": {
      group: "成交量与资金",
      title: "主力连续流出",
      status: "已触发",
      tone: "risk",
      value: "近 5 日 -2.58 亿元",
      summary: "超大单与大单延续净流出，资金面尚未出现持续回流。",
      evidence: ["近 5 日主力资金均为净流出。", "超大单占净流出约 70%。", "中小单净流入未形成趋势确认。"],
      source: "东方财富资金流",
      asOf: "2026-11-25",
      params: "technical-signals-1.0.0",
    },
    "tail-bid": {
      group: "成交量与资金",
      title: "尾盘承接",
      status: "未触发",
      tone: "neutral",
      value: "尾盘主动买入占比 46.8%",
      summary: "尾盘买盘占比未超过阈值，暂不构成资金反转证据。",
      evidence: ["阈值为 55%。", "尾盘成交额占全天 11.4%。", "下一交易日继续观察。"],
      source: "腾讯分时",
      asOf: "2026-11-26 14:57",
      params: "technical-signals-1.0.0",
    },
    "channel": {
      group: "K 线形态",
      title: "下降通道",
      status: "已触发",
      tone: "risk",
      value: "通道斜率 -0.63% / 日",
      summary: "近期高低点持续下移，价格仍在短期下降通道内运行。",
      evidence: ["近 12 个交易日形成两次更低高点。", "下轨与 20D 支撑接近。", "突破上轨需要放量。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "lower-shadow": {
      group: "K 线形态",
      title: "长下影",
      status: "未触发",
      tone: "neutral",
      value: "下影线占比 22%",
      summary: "当日下影线长度未达到形态阈值，暂未出现明确承接信号。",
      evidence: ["阈值为实体长度的 1.5 倍。", "收盘仍位于日内中位下方。", "形态需下一交易日确认。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "gap": {
      group: "K 线形态",
      title: "跳空缺口",
      status: "未触发",
      tone: "neutral",
      value: "今日无有效缺口",
      summary: "开盘价与前收连续，未形成可跟踪的跳空结构。",
      evidence: ["开盘 75.50，前收 74.44。", "最低价未跌破昨日低点。", "不生成缺口支撑或压力。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "volatility-up": {
      group: "高级与微观",
      title: "波动率抬升",
      status: "已触发",
      tone: "risk",
      value: "20D 年化波动率 22.1%",
      summary: "波动率较 20 日均值抬升，短线区间可能是常态，不宜使用过窄止损假设。",
      evidence: ["波动率分位 68%。", "ATR 连续 3 日高于 20 日均值。", "风险区间随之放宽。"],
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
    },
    "active-selling": {
      group: "高级与微观",
      title: "主动卖盘占优",
      status: "已触发",
      tone: "risk",
      value: "主动卖出占比 57.6%",
      summary: "成交方向仍由主动卖盘主导，微观结构只调整置信度，不单独改变核心层方向。",
      evidence: ["主动买卖比为 0.74。", "大单卖压集中在 14:20 后。", "与资金净流出方向一致。"],
      source: "腾讯逐笔成交",
      asOf: "2026-11-26 15:00",
      params: "technical-signals-1.0.0",
    },
    liquidity: {
      group: "高级与微观",
      title: "流动性正常",
      status: "已触发",
      tone: "positive",
      value: "买卖价差 0.03%",
      summary: "盘口价差和成交深度处于正常范围，未发现流动性快速恶化。",
      evidence: ["五档价差保持在 1 个最小价位。", "成交额 22.97 亿元。", "未触发流动性风险降级。"],
      source: "腾讯盘口",
      asOf: "2026-11-26 15:00",
      params: "technical-signals-1.0.0",
    },
  };

  const signalGroups = {
    trend: {
      title: "趋势与均线",
      total: 16,
      triggered: 12,
      summary: "趋势组整体偏空，均线、斜率与动量方向一致；均线空头排列和 MACD 水下是主要风险证据。",
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
      rule: "比较均线排列、斜率与动量方向，并以收盘价相对关键均线的位置确认趋势。",
      parameterNote: "period=5/10/20/60/200 · slope_window=20 · min_history=252",
      confirmation: "收盘重新站上 MA20，且 MA5 / MA10 斜率转向向上。",
      invalidation: "收盘跌破 20D 支撑，且趋势组仍保持偏空。",
      items: [
        ["均线空头排列", "已触发", "risk", "MA5 < MA10 < MA20"],
        ["MACD 水下", "已触发", "risk", "DIF -1.82 · 柱值 -0.41"],
        ["接近 20D 支撑", "观察", "observe", "支撑 72.80 · 收盘 73.62"],
        ["MA5 / MA10 死叉", "已触发", "risk", "死叉持续 8 日"],
        ["MA5 斜率向下", "已触发", "risk", "-0.41% / 日"],
        ["MA10 斜率向下", "已触发", "risk", "-0.33% / 日"],
        ["MA20 斜率向下", "已触发", "risk", "-0.27% / 日"],
        ["MA60 斜率向下", "已触发", "risk", "-0.18% / 日"],
        ["价格相对 MA200", "低置信", "warning", "历史样本不足"],
        ["跌破布林下轨", "已失效", "neutral", "收盘重新回到轨道内"],
        ["布林带宽扩张", "已触发", "risk", "带宽分位 74%"],
        ["ADX 趋势强度", "已触发", "risk", "ADX 27.4"],
        ["三周期方向一致", "已触发", "risk", "日 / 周 / 月均为空"],
        ["平台突破失败", "已触发", "risk", "未站稳 76.20"],
        ["线性回归斜率", "已触发", "risk", "-0.63% / 日"],
        ["成交量加权趋势", "不可用", "neutral", "长周期成交样本不足"],
      ],
    },
    volume: {
      title: "成交量与资金",
      total: 11,
      triggered: 8,
      summary: "成交量收缩但资金持续流出，尾盘承接不足，当前没有形成主动买盘反转证据。",
      source: "腾讯行情 · 东方财富资金流",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
      rule: "联合成交量、主动买卖与资金净流入方向判断承接强弱；资金口径不等同于全部成交。",
      parameterNote: "volume_window=20 · fund_window=5 · tail_window=30m",
      confirmation: "主力资金连续 2 日净流入，且尾盘主动买入占比超过 55%。",
      invalidation: "缩量状态结束，主动买盘与成交额同步扩大。",
      items: [
        ["缩量下行", "已触发", "risk", "量比 0.78"],
        ["主力连续流出", "已触发", "risk", "近 5 日 -2.58 亿"],
        ["尾盘承接", "未触发", "neutral", "尾盘主动买入 46.8%"],
        ["成交量低于 MA20", "已触发", "risk", "-18.2%"],
        ["成交额萎缩", "已触发", "risk", "22.97 亿"],
        ["大单净流出", "已触发", "risk", "-0.76 亿"],
        ["超大单净流出", "已触发", "risk", "-1.82 亿"],
        ["中单净流入", "已触发", "risk", "+0.43 亿"],
        ["融资余额变化", "不可用", "neutral", "数据未接入"],
        ["北向资金变化", "不可用", "neutral", "数据未接入"],
        ["筹码集中度", "已触发", "risk", "集中度变化 +2.1%"],
      ],
    },
    pattern: {
      title: "K 线形态",
      total: 10,
      triggered: 7,
      summary: "下降通道和连续阴线占优；长下影、十字星等潜在止跌形态尚未得到次日确认。",
      source: "沪深腾讯日线",
      asOf: "2026-11-26 收盘",
      params: "technical-signals-1.0.0",
      rule: "从 OHLC 结构与连续交易日关系识别趋势、反转与缺口；未确认形态不升级为结论。",
      parameterNote: "pattern_window=3–10 sessions · shadow_ratio=1.5 · gap_min=0.3%",
      confirmation: "形态在下一交易日收盘后得到价格与成交量确认。",
      invalidation: "价格回到形态区间，且未形成有效突破。",
      items: [
        ["下降通道", "已触发", "risk", "-0.63% / 日"],
        ["长下影", "未触发", "neutral", "下影线占比 22%"],
        ["跳空缺口", "未触发", "neutral", "今日无有效缺口"],
        ["小实体连续", "已触发", "risk", "连续 3 日"],
        ["三连阴", "已触发", "risk", "收盘逐日下移"],
        ["十字星", "已触发", "risk", "实体占比 6%"],
        ["长上影", "已触发", "risk", "上影线占比 38%"],
        ["看跌吞没", "已触发", "risk", "11/25 形态"],
        ["平台破位", "已触发", "risk", "跌破 75.40"],
        ["潜在双底", "未触发", "neutral", "右侧低点尚未确认"],
      ],
    },
    advanced: {
      title: "高级与微观",
      total: 7,
      triggered: 5,
      summary: "波动率与主动卖盘占优；流动性保持正常，微观结构只调整置信度，不覆盖核心层方向。",
      source: "腾讯逐笔 · 盘口 · 日线",
      asOf: "2026-11-26 15:00",
      params: "technical-signals-1.0.0",
      rule: "使用波动率、主动买卖、盘口价差和逐笔成交质量补充核心层判断，只调整置信度。",
      parameterNote: "vol_window=20 · rsi_window=14 · orderbook_depth=5 · min_trades=200",
      confirmation: "微观结构改善，并提高核心层判断的置信度。",
      invalidation: "流动性恶化或主动卖盘继续扩大。",
      items: [
        ["波动率抬升", "已触发", "risk", "20D 年化 22.1%"],
        ["主动卖盘占优", "已触发", "risk", "主动卖出 57.6%"],
        ["流动性正常", "已触发", "positive", "买卖价差 0.03%"],
        ["RSI 弱势区", "已触发", "risk", "RSI 41.5"],
        ["ATR 放大", "已触发", "risk", "高于 20 日均值 18%"],
        ["OBV 下行", "不可用", "neutral", "微观成交样本不足"],
        ["盘口失衡", "低置信", "warning", "五档样本偏薄"],
      ],
    },
  };

  const signalDetailOverrides = {
    "均线空头排列": {
      rule: "MA5 < MA10 < MA20，且收盘价位于 MA20 下方时判定为空头排列。",
      params: "period=5/10/20 · confirmation_days=3",
      confirmation: "收盘重新站上 MA10，且 MA5 斜率转正。",
      invalidation: "MA5 上穿 MA10，或收盘连续 3 日站上 MA20。",
    },
    "MACD 水下": {
      rule: "DIF 与 DEA 均位于零轴下方时判定为水下；柱值用于辅助动能强弱。",
      params: "fast=12 · slow=26 · signal=9",
      confirmation: "DIF 上穿 DEA 且柱值连续 3 日放大。",
      invalidation: "DIF 与 DEA 回到零轴上方。",
    },
    "接近 20D 支撑": {
      rule: "收盘价距离 20 日支撑不足 1.5% 时进入观察。",
      params: "support_window=20 · distance_threshold=1.5%",
      confirmation: "支撑位附近出现放量阳线并收复 MA5。",
      invalidation: "收盘有效跌破 20 日支撑。",
    },
    "布林带宽扩张": {
      rule: "计算布林带宽度 (upper - lower) / middle 的 252 日历史分位，并区分压缩、常态与带外突破。",
      params: "period=20 · std_dev=2 · percentile_window=252 · expansion_percentile=80 · compression_percentile=20",
      confirmation: "带宽自低位回升，且收盘突破带边界。",
      invalidation: "价格回到带内，且带宽继续收缩。",
    },
    "主力连续流出": {
      rule: "统计近 5 个交易日超大单与大单净额；连续为负时判定为主力流出。",
      params: "fund_window=5 · order_size=large+super_large",
      confirmation: "主力资金连续 2 日净流入。",
      invalidation: "5 日累计净流入转正。",
    },
    "下降通道": {
      rule: "连接近期摆动高点与低点，确认至少两个更低高点与更低低点。",
      params: "swing_window=3 · min_touches=2 · slope_threshold=-0.2%",
      confirmation: "价格放量突破通道上轨。",
      invalidation: "通道结构被向上突破，或形成更高高点与更高低点。",
    },
    "波动率抬升": {
      rule: "比较 20 日年化波动率与其历史分位，超过阈值时判定为抬升。",
      params: "vol_window=20 · percentile_window=252 · threshold=65%",
      confirmation: "波动率连续 3 日高于阈值，且 ATR 同步抬升。",
      invalidation: "波动率回到 20 日均值下方。",
    },
  };

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
      plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
      dashboard:
        '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      tasks:
        '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
      review:
        '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
      screens:
        '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
      market:
        '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
      analysis:
        '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
      research:
        '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
      strategy:
        '<path d="M14 2v6a2 2 0 0 0 .2.9l5.5 10.1A2 2 0 0 1 18 22H6a2 2 0 0 1-1.8-3l5.6-10.1A2 2 0 0 0 10 8V2"/><path d="M6.5 15h11"/><path d="M8.5 2h7"/>',
      factors:
        '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2"/><path d="M10 12h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h8"/><path d="M16 18h4"/><circle cx="14" cy="18" r="2"/>',
      backtest: '<path d="m3 17 5-5 4 4 8-8"/><path d="M15 8h5v5"/>',
      decay: '<path d="m3 7 5 5 4-4 8 8"/><path d="M15 16h5v-5"/>',
      sparkles:
        '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z"/>',
      workflow:
        '<rect x="3" y="3" width="7" height="7" rx="2"/><path d="M10 6.5h4A4.5 4.5 0 0 1 19 11v.5"/><path d="m16 9 3 3 3-3"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>',
      close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    };
    return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
  }

  function miniCandleChart({ compact = false, empty = false, includeForecast = false } = {}) {
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
    const height = compact ? 294 : 316;
    const left = compact ? 30 : 48;
    const right = width - (compact ? 14 : 58);
    const top = 20;
    const chartBottom = compact ? 190 : 218;
    const volumeTop = compact ? 204 : 233;
    const volumeBottom = compact ? 250 : 275;
    const axisY = compact ? 283 : 304;
    const visible = compact ? candles.slice(-24) : candles;
    const min = 67.8;
    const max = 81;
    const historyShare = includeForecast ? (compact ? 0.66 : 0.76) : 1;
    const historyRight = left + (right - left) * historyShare;
    const innerWidth = historyRight - left;
    const step = innerWidth / visible.length;
    const bodyWidth = Math.max(3.5, Math.min(compact ? 5.2 : 7.5, step * 0.56));

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
         <text x="${historyRight}" y="${axisY}" text-anchor="end" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="10">11/26</text>
         ${includeForecast ? `<text x="${right}" y="${axisY}" text-anchor="end" fill="var(--primary)" font-family="var(--font-family-code)" font-size="10">12/03</text>` : ""}`
      : `<text x="${left}" y="${axisY}" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">10/13</text>
         <text x="${(left + historyRight) / 2}" y="${axisY}" text-anchor="middle" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">11/04</text>
         <text x="${historyRight}" y="${axisY}" text-anchor="end" fill="var(--quote-axis)" font-family="var(--font-family-code)" font-size="11">11/26</text>
         ${includeForecast ? `<text x="${right}" y="${axisY}" text-anchor="end" fill="var(--primary)" font-family="var(--font-family-code)" font-size="11">12/03</text>` : ""}`;

    let forecastMarkup = "";
    if (includeForecast) {
      const p10 = [71.8, 70.9, 70.1, 69.3, 68.5];
      const p50 = [73.5, 73.3, 73.0, 72.8, 72.5];
      const p90 = [75.1, 75.8, 76.6, 77.3, 78.1];
      const forecastStart = historyRight + (compact ? 14 : 24);
      const forecastStep = (right - forecastStart) / 5;
      const forecastX = (index) => forecastStart + forecastStep * index;
      const medianPoints = [
        [historyRight, y(73.62)],
        ...p50.map((price, index) => [forecastX(index), y(price)]),
      ];
      const band = [
        ...p90.map((price, index) => [forecastX(index), y(price)]),
        ...p10
          .map((price, index) => [forecastX(index), y(price)])
          .reverse(),
      ];
      const toPath = (points) =>
        points
          .map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
          .join(" ");
      forecastMarkup = `
        <line x1="${historyRight + 5}" x2="${historyRight + 5}" y1="${top - 2}" y2="${volumeBottom}" stroke="color-mix(in srgb, var(--primary) 38%, var(--line))" stroke-width="1" stroke-dasharray="4 4"/>
        <path d="${toPath(band)} Z" fill="color-mix(in srgb, var(--primary) 14%, transparent)"/>
        <path d="${toPath(medianPoints)}" fill="none" stroke="var(--primary)" stroke-width="${compact ? 1.8 : 2.1}" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${historyRight}" cy="${y(73.62)}" r="${compact ? 2.8 : 3.4}" fill="var(--primary)" stroke="var(--quote-canvas)" stroke-width="1.5"/>
        ${p50
          .map(
            (price, index) =>
              `<circle cx="${forecastX(index)}" cy="${y(price)}" r="${compact ? 2.2 : 2.8}" fill="var(--primary)" stroke="var(--quote-canvas)" stroke-width="1.2"/>`,
          )
          .join("")}
        <text x="${forecastStart}" y="${top - 5}" text-anchor="start" fill="var(--primary)" font-family="var(--font-family-code)" font-size="${compact ? 9 : 10}">未来 5D · 1 条 P50</text>
        <text x="${right}" y="${y(p50[4]) - 8}" text-anchor="end" fill="var(--primary)" font-family="var(--font-family-code)" font-size="${compact ? 9 : 10}">72.50</text>`;
    }

    return `<svg class="candle-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="比亚迪最近一个月的日 K 线与${includeForecast ? "未来一周单一路径" : "成交量"}">
      <title>比亚迪日 K 线与未来一周单一路径</title>
      ${grid}
      ${volumeGrid}
      ${candleMarkup}
      <path d="${ma5}" fill="none" stroke="var(--ink)" stroke-width="1.2" opacity=".7"/>
      <path d="${ma20}" fill="none" stroke="#8e6ac9" stroke-width="1.2" opacity=".78"/>
      <line x1="${left}" x2="${historyRight}" y1="${y(73.62)}" y2="${y(73.62)}" stroke="var(--primary)" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>
      <rect x="${historyRight - (compact ? 40 : 56)}" y="${Math.max(3, y(73.62) - 18)}" width="${compact ? 40 : 56}" height="17" rx="4" fill="var(--primary)"/>
      <text x="${historyRight - (compact ? 20 : 28)}" y="${Math.max(15, y(73.62) - 6)}" text-anchor="middle" fill="var(--primary-foreground)" font-family="var(--font-family-code)" font-size="${compact ? 8 : 9}">73.62</text>
      <line x1="${left}" x2="${right}" y1="${volumeBottom + 1}" y2="${volumeBottom + 1}" stroke="var(--quote-line)" stroke-width="1"/>
      ${forecastMarkup}
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

  function singleForecastPath({ compact = false } = {}) {
    const dates = ["11/27", "11/30", "12/01", "12/02", "12/03"];
    const p10 = [71.8, 70.9, 70.1, 69.3, 68.5];
    const p50 = [73.5, 73.3, 73.0, 72.8, 72.5];
    const p90 = [75.1, 75.8, 76.6, 77.3, 78.1];
    const width = compact ? 360 : 620;
    const height = compact ? 116 : 138;
    const left = compact ? 28 : 42;
    const right = width - (compact ? 18 : 26);
    const top = 12;
    const chartBottom = compact ? 78 : 94;
    const axisY = compact ? 102 : 122;
    const min = 67.5;
    const max = 79;
    const step = (right - left) / dates.length;
    const x = (index) => left + step * index;
    const y = (price) => top + ((max - price) / (max - min)) * (chartBottom - top);
    const upper = p90.map((price, index) => [x(index + 1), y(price)]);
    const lower = p10.map((price, index) => [x(index + 1), y(price)]).reverse();
    const band = [...upper, ...lower]
      .map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");
    const median = [73.62, ...p50]
      .map((price, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(price).toFixed(1)}`)
      .join(" ");
    const labels = compact
      ? `<text x="${x(1)}" y="${axisY}" text-anchor="start">${dates[0]}</text>
         <text x="${x(dates.length)}" y="${axisY}" text-anchor="end">${dates[4]}</text>`
      : dates
          .map(
            (date, index) =>
              `<text x="${x(index + 1)}" y="${axisY}" text-anchor="middle">${date}</text>`,
          )
          .join("");
    return `<svg class="forecast-path-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="未来五个交易日仅一条 P50 中位路径，配 80% 概率区间">
      <title>未来一周 P50 中位路径</title>
      <line x1="${left}" x2="${right}" y1="${top}" y2="${top}" class="forecast-grid"/>
      <line x1="${left}" x2="${right}" y1="${(top + chartBottom) / 2}" y2="${(top + chartBottom) / 2}" class="forecast-grid"/>
      <line x1="${left}" x2="${right}" y1="${chartBottom}" y2="${chartBottom}" class="forecast-grid"/>
      <path d="${band} Z" class="forecast-band"/>
      <path d="${median}" class="forecast-median"/>
      <line x1="${left}" x2="${left}" y1="${top - 2}" y2="${chartBottom + 2}" class="forecast-start"/>
      ${[73.62, ...p50].map((price, index) => `<circle cx="${x(index)}" cy="${y(price)}" r="${compact ? 2.6 : 3.2}" class="forecast-point"/>`).join("")}
      <text x="${x(0)}" y="${top - 1}" text-anchor="start" class="forecast-axis-label">预测起点</text>
      <text x="${x(dates.length)}" y="${y(p50[4]) - 8}" text-anchor="end" class="forecast-end-label">P50 ${p50[4].toFixed(2)}</text>
      <g class="forecast-date-label">${labels}</g>
      <text x="${x(0)}" y="${y(73.62) - 6}" text-anchor="start" class="forecast-axis-label">今收 73.62</text>
    </svg>`;
  }

  function marketSparkline() {
    const values = candles.slice(-26).map((bar) => bar[3]);
    const width = 340;
    const height = 46;
    const left = 2;
    const right = width - 2;
    const top = 4;
    const bottom = height - 4;
    const min = Math.min(...values) - 0.2;
    const max = Math.max(...values) + 0.2;
    const points = values
      .map((value, index) => {
        const x = left + (index / (values.length - 1)) * (right - left);
        const y = top + ((max - value) / (max - min)) * (bottom - top);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 26 个交易日走势，弱势下行">
      <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function stockHeader() {
    const missing = state === "market-missing";
    return `<header class="stock-header" aria-labelledby="stock-title">
      <div class="stock-header-main">
        <div class="stock-identity">
          <div class="stock-eyebrow">
            <span>STOCK WORKSPACE</span>
            <span class="exchange">· 002594.SZ · 深交所主板</span>
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
                ? '<span class="status-chip warn"><i></i>行情暂缺</span>'
                : '<span class="status-chip"><i></i>资金可用</span>'
            }
          </div>
        </div>

        <div class="stock-quote${missing ? " missing" : ""}">
          <div class="quote-value-row">
            <strong>${missing ? "—" : "73.62"}</strong>
            <span>${missing ? "行情暂缺" : "-1.11%"}</span>
          </div>
          <div class="quote-note">
            <span>${missing ? "等待行情源恢复" : "quant-live · 11/26 15:00"}</span>
            <span>${missing ? "研究数据不受影响" : "成交额 22.97亿"}</span>
          </div>
        </div>

        <div class="stock-actions" aria-label="个股操作">
          <button class="action-button" type="button">${icon("star")}<span class="action-label">自选</span></button>
          <button class="action-button" type="button">${icon("compare")}<span class="action-label secondary">加入对比</span></button>
          <button class="action-button" type="button">${icon("plus")}<span class="action-label secondary">加入工作任务</span></button>
          ${
            state === "error"
              ? ""
              : state === "quick"
                ? `<button class="action-button" type="button">${icon("refresh")}<span class="action-label">刷新行情</span></button>`
                : `<button class="action-button primary" type="button">${icon("refresh")}<span class="action-label">重新分析</span></button>`
          }
          <button class="action-button icon-only" type="button" aria-label="更多操作">${icon("more")}</button>
        </div>
      </div>
      <div class="stock-status-strip${state === "quick" ? " is-quick" : ""}" aria-label="${state === "quick" ? "快速行情数据状态" : "研究内容数据状态"}">${healthStrip()}</div>
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
          <h2 id="chart-title">日 K 与未来一周</h2>
          <p>历史日线来自沪深腾讯；未来五日只展示 1 条 P50 中位路径</p>
        </div>
        <div class="card-head-tools">
          <span class="quiet-badge ${empty ? "warning" : "primary"}">${empty ? "预测暂缺" : "未来 5D · 1 条 P50"}</span>
          <span class="quiet-badge ${empty ? "warning" : ""}">${empty ? "行情暂缺" : "11/26 收盘"}</span>
        </div>
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
        <div class="candle-frame">${miniCandleChart({ empty, includeForecast: !empty })}</div>
      </div>
      ${
        empty
          ? ""
          : `<section class="forecast-inline" aria-labelledby="quick-forecast-title">
              <div class="forecast-inline-head">
                <div>
                  <h3 id="quick-forecast-title">未来一周路径预测</h3>
                  <p>仅一条 P50 中位路径 · 阴影为 80% 概率区间</p>
                </div>
                <div class="forecast-inline-value">
                  <strong>今收 73.62 → 12/03 中位 72.50</strong>
                  <span>5 个交易日 · 上涨概率 31%</span>
                </div>
              </div>
              <div class="forecast-inline-metrics">
                <div><span>5D 中位路径</span><strong>72.50</strong></div>
                <div><span>80% 概率区间</span><strong>68.50–78.10</strong></div>
                <div><span>方向概率</span><strong>上涨 31% · 下跌 42%</strong></div>
              </div>
              <p class="forecast-inline-note">概率情景，不是目标价。图中只绘制一条中位路径，区间用于表达不确定性。</p>
            </section>`
      }
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
        <div class="ribbon-mobile-sparkline">${missing ? "" : marketSparkline()}</div>
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
      quick: [
        ["实时行情", "11/26 15:00 · 可用", ""],
        ["日 K 线", "11/26 · 可用", ""],
        ["资金结构", "11/25 · 可用", ""],
        ["技术摘要", "4 项 · 偏弱", "warn"],
      ],
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
          <p>每张矩阵卡显示目录前 3 项预览，点击整张卡查看全部</p>
        </div>
        <span class="quiet-badge warning">32 / 44 触发</span>
      </div>
      <div class="signal-groups">
        ${Object.entries(signalGroups)
          .map(
            ([key, group]) => `<button class="signal-group" type="button" data-signal-group="${key}" aria-label="查看${group.title}全部 ${group.total} 项信号">
              <span class="signal-group-head"><strong>${group.title}</strong><span>${group.triggered} / ${group.total}</span></span>
              <span class="signal-group-caption">目录预览 · 前 3 项</span>
              <span class="signal-rows">
                ${group.items
                  .slice(0, 3)
                  .map(
                    ([title, status, tone]) => `<span class="signal-row">
                      <span>${title}</span>
                      <span class="signal-state ${tone}">${status}</span>
                    </span>`,
                  )
                  .join("")}
              </span>
              <span class="signal-group-more">查看全部 ${group.total} 项${icon("chevron")}</span>
            </button>`,
          )
          .join("")}
      </div>
    </section>`;
  }

  function renderSignalDrawer() {
    const group = activeSignalGroup ? signalGroups[activeSignalGroup] : null;
    if (!group) {
      signalDrawerRoot.innerHTML = "";
      document.body.classList.remove("signal-drawer-open");
      return;
    }
    document.body.classList.add("signal-drawer-open");
    signalDrawerRoot.innerHTML = `<div class="signal-drawer-layer">
      <button class="signal-drawer-backdrop" type="button" data-close-signal-drawer tabindex="-1" aria-label="关闭技术信号详情"></button>
      <aside class="signal-drawer" role="dialog" aria-modal="true" aria-labelledby="signal-drawer-title">
        <header class="signal-drawer-head">
          <div>
            <span class="signal-drawer-kicker">SIGNAL MATRIX · ${group.total} 项</span>
            <h2 id="signal-drawer-title">${group.title}</h2>
          </div>
          <button class="signal-drawer-close" type="button" data-close-signal-drawer aria-label="关闭${group.title}全部信号">${icon("close")}</button>
        </header>
        <div class="signal-drawer-scroll">
          <div class="signal-drawer-state-row">
            <span class="signal-state risk">已触发 ${group.triggered} / ${group.total}</span>
            <span>${group.asOf}</span>
          </div>
          <p class="signal-drawer-summary">${group.summary}</p>
          <section class="signal-drawer-section" aria-labelledby="signal-list-title">
            <h3 id="signal-list-title">全部 ${group.total} 项</h3>
            <div class="signal-drawer-list">
              ${group.items
                .map(([title, status, tone, value], index) => {
                  const expanded = expandedDrawerItem === index;
                  const override = signalDetailOverrides[title];
                  const signalId = `${activeSignalGroup}.stock.signal_${String(index + 1).padStart(2, "0")}`;
                  const evidence =
                    status === "不可用"
                      ? "所需数据未接入或历史样本不足，本项不参与方向投票。"
                      : status === "低置信"
                        ? "当前读数可用，但覆盖率不足，只影响置信度，不进入核心方向投票。"
                        : status === "已失效"
                          ? "此前的触发条件已经解除，本项不再计入当前触发数。"
                          : status === "未触发"
                            ? `当前读数 ${value} 尚未达到规则阈值。`
                            : `规则阈值已满足，当前读数 ${value}。`;
                  const rule =
                    override?.rule ??
                    `${title}按该信号的目录定义独立计算；当前读数 ${value} 与阈值比较后为${status}。`;
                  const params =
                    override?.params ??
                    `signal=${signalId} · catalog=${group.params}`;
                  const confirmation =
                    override?.confirmation ??
                    `${title}的读数继续保持当前方向，并与同层信号一致。`;
                  const invalidation =
                    override?.invalidation ??
                    `${title}的读数跨越反向阈值、数据不足或同层证据分歧。`;
                  return `<div class="signal-drawer-item${expanded ? " is-expanded" : ""}">
                    <button class="signal-drawer-item-toggle" type="button" data-drawer-signal-index="${index}" aria-expanded="${expanded}" aria-controls="signal-detail-${index}">
                      <span class="signal-drawer-index">${String(index + 1).padStart(2, "0")}</span>
                      <span class="signal-drawer-item-copy"><strong>${title}</strong><small>${value}</small></span>
                      <span class="signal-state ${tone}">${status}</span>
                      <span class="signal-drawer-expand-label">${expanded ? "收起" : "详情"}</span>
                      <span class="signal-drawer-chevron">${icon("chevron")}</span>
                    </button>
                    ${
                      expanded
                        ? `<div class="signal-drawer-item-detail" id="signal-detail-${index}">
                            <div class="signal-drawer-detail-grid">
                              <div><span>组成证据</span><p>${evidence}</p></div>
                              <div><span>数据边界</span><p>${signalId}<br>${group.source} · ${group.asOf}</p></div>
                              <div><span>版本与时间</span><p>${group.params}<br>计算时间 2026-11-26T15:30:48.613Z</p></div>
                              <div><span>规则与参数</span><p>${rule}<br><code>${params}</code></p></div>
                              <div><span>确认与失效</span><p>确认：${confirmation}<br>失效：${invalidation}</p></div>
                            </div>
                          </div>`
                        : ""
                    }
                  </div>`;
                })
                .join("")}
            </div>
          </section>
          <section class="signal-drawer-section" aria-labelledby="signal-boundary-title">
            <h3 id="signal-boundary-title">数据边界</h3>
            <dl class="signal-drawer-boundary">
              <div><dt>数据源</dt><dd>${group.source}</dd></div>
              <div><dt>截止时间</dt><dd>${group.asOf}</dd></div>
              <div><dt>规则版本</dt><dd>${group.params}</dd></div>
            </dl>
          </section>
          <p class="signal-drawer-note">矩阵卡前三项按信号目录固定顺序展示，只作为预览，不按实时强弱排序；完整项和状态以本抽屉为准。</p>
          <p class="signal-drawer-note">信号是研究证据，不构成买卖建议；缺失或低置信数据不会补为零值。</p>
        </div>
      </aside>
    </div>`;
  }

  function openSignalDrawer(groupId, trigger, { item = null } = {}) {
    activeSignalGroup = groupId;
    expandedDrawerItem = item;
    signalTrigger = trigger;
    renderSignalDrawer();
    requestAnimationFrame(() => signalDrawerRoot.querySelector(".signal-drawer-close")?.focus());
  }

  function closeSignalDrawer({ restoreFocus = true } = {}) {
    activeSignalGroup = null;
    expandedDrawerItem = null;
    renderSignalDrawer();
    if (restoreFocus) signalTrigger?.focus();
    signalTrigger = null;
  }

  function forecastCard() {
    return `<section class="surface-card" aria-labelledby="forecast-title">
      <div class="card-head">
        <div>
          <h2 id="forecast-title">未来一周与风险区间</h2>
          <p>1 条 P50 中位路径 · 5 / 20 / 60 日区间摘要</p>
        </div>
        <span class="quiet-badge primary">可用</span>
      </div>
      <div class="forecast-path-panel">${singleForecastPath()}</div>
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
      <p class="research-footnote">本页为研究辅助，不构成投资建议。未来一周仅展示一条 P50 中位路径，以概率区间表达不确定性；正式结论需通过滚动样本外验证。</p>
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
    closeSignalDrawer({ restoreFocus: false });
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
    const signalGroup = event.target.closest("[data-signal-group]");
    if (signalGroup) {
      openSignalDrawer(signalGroup.getAttribute("data-signal-group"), signalGroup);
      return;
    }
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      const nextMode = modeButton.getAttribute("data-mode");
      setState(nextMode);
    }
  });

  signalDrawerRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-signal-drawer]")) {
      closeSignalDrawer();
      return;
    }
    const item = event.target.closest("[data-drawer-signal-index]");
    if (item && activeSignalGroup) {
      const index = Number(item.getAttribute("data-drawer-signal-index"));
      expandedDrawerItem = expandedDrawerItem === index ? null : index;
      renderSignalDrawer();
      requestAnimationFrame(() => {
        const trigger = signalDrawerRoot.querySelector(
          `[data-drawer-signal-index="${index}"]`,
        );
        trigger?.focus();
        trigger?.scrollIntoView({ block: "center" });
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!activeSignalGroup) return;
    if (event.key === "Escape") {
      closeSignalDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...signalDrawerRoot.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => node.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  addEventListener("popstate", () => {
    const nextParams = new URLSearchParams(location.search);
    state = allowedStates.has(nextParams.get("state"))
      ? nextParams.get("state")
      : "quick";
    render();
  });

  document.querySelectorAll("[data-nav-icon]").forEach((node) => {
    node.innerHTML = icon(node.dataset.navIcon);
  });

  render();
  if (initialDrawer && signalGroups[initialDrawer]) {
    const item =
      initialDrawerItem != null && Number.isInteger(Number(initialDrawerItem))
        ? Number(initialDrawerItem)
        : null;
    requestAnimationFrame(() => openSignalDrawer(initialDrawer, null, { item }));
  }
})();
