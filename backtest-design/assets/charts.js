(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue("--accent").trim();
  var accent2 = style.getPropertyValue("--accent2").trim();
  var ink = style.getPropertyValue("--ink").trim();
  var muted = style.getPropertyValue("--muted").trim();
  var rule = style.getPropertyValue("--rule").trim();
  var bg = style.getPropertyValue("--bg").trim();
  var bg2 = style.getPropertyValue("--bg2").trim();

  // --- Chart: Dispatcher Lifecycle ---
  var chartDispatch = echarts.init(
    document.getElementById("chart-dispatch-lifecycle"),
    null,
    { renderer: "svg" },
  );
  chartDispatch.setOption({
    animation: false,
    tooltip: { trigger: "item", appendToBody: true },
    color: [accent, accent2, muted + "99", muted + "66"],
    legend: { bottom: 0, textStyle: { color: ink } },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "50%"],
        itemStyle: { borderRadius: 4, borderColor: bg, borderWidth: 2 },
        label: { color: ink },
        data: [
          { name: "pending → running", value: 45 },
          { name: "running → done", value: 35 },
          { name: "running → failed", value: 12 },
          { name: "done → archived", value: 8 },
        ],
      },
    ],
  });
  window.addEventListener("resize", function () {
    chartDispatch.resize();
  });

  // --- Chart: Equity Curve Mock ---
  var chartEquity = echarts.init(
    document.getElementById("chart-equity-curve"),
    null,
    { renderer: "svg" },
  );
  var dates = [];
  for (var i = 0; i < 120; i++) {
    var d = new Date(2025, 6, 1);
    d.setDate(d.getDate() + i * 2);
    dates.push(
      d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0"),
    );
  }
  var navBase = 1e6;
  var nav = [navBase];
  var bmk = [navBase];
  for (var j = 1; j < dates.length; j++) {
    nav.push(
      nav[j - 1] * (1 + (Math.random() - 0.47) * 0.04),
    );
    bmk.push(
      bmk[j - 1] * (1 + (Math.random() - 0.485) * 0.025),
    );
  }
  chartEquity.setOption({
    animation: false,
    tooltip: { trigger: "axis", appendToBody: true },
    legend: { bottom: 0, textStyle: { color: ink } },
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: "category",
      data: dates.filter(function (_, i) { return i % 10 === 0; }),
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: muted,
        formatter: function (v) { return (v / 1e4).toFixed(0) + "万"; },
      },
      splitLine: { lineStyle: { color: rule } },
    },
    series: [
      {
        name: "策略净值",
        type: "line",
        data: nav.filter(function (_, i) { return i % 10 === 0; }),
        smooth: true,
        symbol: "none",
        lineStyle: { color: accent, width: 2 },
      },
      {
        name: "基准净值",
        type: "line",
        data: bmk.filter(function (_, i) { return i % 10 === 0; }),
        smooth: true,
        symbol: "none",
        lineStyle: { color: muted, width: 1.5, type: "dashed" },
      },
    ],
  });
  window.addEventListener("resize", function () {
    chartEquity.resize();
  });

  // --- Chart: Metrics Radar ---
  var chartRadar = echarts.init(
    document.getElementById("chart-metrics-radar"),
    null,
    { renderer: "svg" },
  );
  chartRadar.setOption({
    animation: false,
    tooltip: { appendToBody: true },
    legend: { bottom: 0, textStyle: { color: ink } },
    radar: {
      center: ["50%", "50%"],
      radius: "65%",
      indicator: [
        { name: "年化收益率", max: 60 },
        { name: "夏普比率", max: 3 },
        { name: "最大回撤(-)", max: -10 },
        { name: "胜率", max: 70 },
        { name: "盈亏比", max: 4 },
        { name: "卡玛比率", max: 5 },
      ],
      axisName: { color: ink },
      splitArea: { areaStyle: { color: [bg, bg2] } },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } },
    },
    color: [accent, accent2],
    series: [
      {
        type: "radar",
        name: "均线策略",
        data: [
          { value: [28, 1.8, -22, 55, 2.1, 2.4], name: "均线策略" },
        ],
        areaStyle: { opacity: 0.12 },
      },
    ],
  });
  window.addEventListener("resize", function () {
    chartRadar.resize();
  });
})();
