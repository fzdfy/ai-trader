/** 单根 K 线的 OHLCV 数据 */
export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 策略参数 */
export interface StrategyConfig {
  type: "maCross" | "rsi" | "macd" | "bollinger";
  params: Record<string, number>;
}

/** 单笔交易记录 */
export interface Trade {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  side: "long";
  pnl: number;
  pnlPct: number;
}

/** 回测结果 */
export interface BacktestResult {
  symbol: string;
  strategy: StrategyConfig;
  startDate: string;
  endDate: string;
  metrics: {
    totalReturn: number;
    annualReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    totalTrades: number;
    avgPnlPct: number;
  };
  equity: { time: string; value: number }[];
  trades: Trade[];
}

// ---------- indicators ----------

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    result.push(i >= period - 1 ? sum / period : null);
  }
  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      result.push(values[i] ?? null);
    } else {
      const prev = result[i - 1];
      result.push(prev != null ? (values[i] ?? 0) * k + prev * (1 - k) : null);
    }
  }
  return result;
}

function rsi(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [null];

  if (values.length < period + 1) {
    for (let i = 1; i < values.length; i++) result.push(null);
    return result;
  }

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const diff = (values[i] ?? 0) - (values[i - 1] ?? 0);
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  for (let i = 1; i <= period; i++) result.push(null);

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length - 1; i++) {
    avgGain = (avgGain * (period - 1) + (gains[i] ?? 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (losses[i] ?? 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
}

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    macdLine.push(f != null && s != null ? f - s : null);
  }
  const validMacd = macdLine.filter((v): v is number => v != null);
  const signalLine = ema(validMacd, signal);

  return { macdLine, signalLine };
}

function bollinger(values: number[], period = 20, multiplier = 2) {
  const ma = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < values.length; i++) {
    const m = ma[i];
    if (m == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(Math.max(0, i - period + 1), i + 1);
    const std = Math.sqrt(slice.reduce((sum, v) => sum + (v - m) ** 2, 0) / slice.length);
    upper.push(m + multiplier * std);
    lower.push(m - multiplier * std);
  }

  return { ma, upper, lower };
}

// ---------- signal generators ----------

type Signal = "buy" | "sell" | "hold";

function maCrossSignals(bars: Bar[], fast = 5, slow = 20): Signal[] {
  const closes = bars.map((b) => b.close);
  const fastMa = sma(closes, fast);
  const slowMa = sma(closes, slow);
  const signals: Signal[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { signals.push("hold"); continue; }
    const f = fastMa[i]; const fp = fastMa[i - 1];
    const s = slowMa[i]; const sp = slowMa[i - 1];
    if (f == null || s == null || fp == null || sp == null) {
      signals.push("hold");
      continue;
    }
    if (fp <= sp && f > s) signals.push("buy");
    else if (fp >= sp && f < s) signals.push("sell");
    else signals.push("hold");
  }

  return signals;
}

function rsiSignals(bars: Bar[], period = 14, oversold = 30, overbought = 70): Signal[] {
  const closes = bars.map((b) => b.close);
  const rsiVals = rsi(closes, period);
  const signals: Signal[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { signals.push("hold"); continue; }
    const curr = rsiVals[i]; const prev = rsiVals[i - 1];
    if (curr == null || prev == null) { signals.push("hold"); continue; }
    if (prev >= oversold && curr < oversold) signals.push("buy");
    else if (prev <= overbought && curr > overbought) signals.push("sell");
    else signals.push("hold");
  }

  return signals;
}

function macdSignals(bars: Bar[], fast = 12, slow = 26, signal = 9): Signal[] {
  const closes = bars.map((b) => b.close);
  const { macdLine, signalLine } = macd(closes, fast, slow, signal);
  const signals: Signal[] = [];
  const offset = signalLine.length > 0 ? bars.length - signalLine.length : 0;

  for (let i = 0; i < bars.length; i++) {
    const currMacd = macdLine[i]; const prevMacd = macdLine[i - 1];
    const si = i - offset;
    if (currMacd == null || prevMacd == null || si < 1) {
      signals.push("hold"); continue;
    }
    const currSig = signalLine[si]; const prevSig = signalLine[si - 1];
    if (currSig == null || prevSig == null) { signals.push("hold"); continue; }
    if (prevMacd <= prevSig && currMacd > currSig) signals.push("buy");
    else if (prevMacd >= prevSig && currMacd < currSig) signals.push("sell");
    else signals.push("hold");
  }

  return signals;
}

function bollingerSignals(bars: Bar[], period = 20, multiplier = 2): Signal[] {
  const closes = bars.map((b) => b.close);
  const { lower, upper } = bollinger(closes, period, multiplier);
  const signals: Signal[] = ["hold"];

  for (let i = 1; i < bars.length; i++) {
    const l = lower[i]; const u = upper[i];
    if (l == null || u == null) { signals.push("hold"); continue; }
    if ((bars[i - 1]?.close ?? 0) >= l && (bars[i]?.close ?? 0) < l) signals.push("buy");
    else if ((bars[i - 1]?.close ?? 0) <= u && (bars[i]?.close ?? 0) > u) signals.push("sell");
    else signals.push("hold");
  }

  return signals;
}

// ---------- engine ----------

export function runBacktest(bars: Bar[], config: StrategyConfig, capital = 100_000): BacktestResult {
  if (bars.length === 0) throw new Error("No data");

  let signals: Signal[];
  const p = config.params;

  switch (config.type) {
    case "maCross":
      signals = maCrossSignals(bars, p.fast ?? 5, p.slow ?? 20);
      break;
    case "rsi":
      signals = rsiSignals(bars, p.period ?? 14, p.oversold ?? 30, p.overbought ?? 70);
      break;
    case "macd":
      signals = macdSignals(bars, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
      break;
    case "bollinger":
      signals = bollingerSignals(bars, p.period ?? 20, p.multiplier ?? 2);
      break;
  }

  const equity: { time: string; value: number }[] = [];
  const trades: Trade[] = [];
  let cash = capital;
  let position = 0;
  let entryPrice = 0;
  let entryTime = "";
  let baseCapital = capital;
  const peakEquity: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;
    const sig = signals[i] ?? "hold";
    const currentEquity = cash + position * bar.close;
    const peak = i === 0 ? currentEquity : Math.max(peakEquity[i - 1] ?? currentEquity, currentEquity);
    peakEquity.push(peak);
    equity.push({ time: bar.time, value: Math.round(currentEquity * 100) / 100 });

    if (sig === "buy" && position === 0 && cash > 0) {
      position = cash / bar.close;
      cash = 0;
      entryPrice = bar.close;
      entryTime = bar.time;
    } else if (sig === "sell" && position > 0) {
      cash = position * bar.close;
      trades.push({
        entryTime, exitTime: bar.time, entryPrice, exitPrice: bar.close,
        side: "long", pnl: cash - baseCapital,
        pnlPct: (bar.close - entryPrice) / entryPrice,
      });
      baseCapital = cash;
      position = 0;
    }
  }

  // 强制平仓
  const last = bars[bars.length - 1];
  if (position > 0 && last) {
    cash = position * last.close;
    trades.push({
      entryTime, exitTime: last.time, entryPrice, exitPrice: last.close,
      side: "long", pnl: cash - baseCapital,
      pnlPct: (last.close - entryPrice) / entryPrice,
    });
  }

  const finalEquity = cash > 0 ? cash : position * (last?.close ?? 0);
  const totalReturn = (finalEquity / capital - 1) * 100;

  const first = bars[0]!;
  const days = (new Date(last?.time ?? "").getTime() - new Date(first.time).getTime()) / 86400000;
  const annualReturn = days > 0 ? ((finalEquity / capital) ** (365 / days) - 1) * 100 : 0;

  // 最大回撤
  let maxDrawdown = 0;
  for (let i = 0; i < equity.length; i++) {
    const p = peakEquity[i];
    if (!p || p === 0) continue;
    const dd = (p - equity[i]!.value) / p;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // 夏普比率
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]?.value;
    const curr = equity[i]?.value;
    if (prev && prev > 0) dailyReturns.push(curr! / prev - 1);
  }
  const avgDaily = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + (r - avgDaily) ** 2, 0) / dailyReturns.length : 0;
  const sharpeRatio = variance > 0 ? (avgDaily / Math.sqrt(variance)) * Math.sqrt(252) : 0;

  const wins = trades.filter((t) => t.pnlPct > 0).length;

  return {
    symbol: "",
    strategy: config,
    startDate: first.time,
    endDate: last?.time ?? "",
    metrics: {
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualReturn: Math.round(annualReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      winRate: trades.length > 0 ? Math.round((wins / trades.length) * 10000) / 100 : 0,
      totalTrades: trades.length,
      avgPnlPct: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length * 10000) / 100 : 0,
    },
    equity,
    trades,
  };
}
