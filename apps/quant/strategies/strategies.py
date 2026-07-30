from akquant import Strategy
import numpy as np


class MACrossStrategy(Strategy):
    warmup_period = 20
    fast = 5
    slow = 20

    def on_bar(self, bar):
        closes = self.get_history(count=self.slow + 1, symbol=bar.symbol, field="close")
        if len(closes) < self.slow + 1:
            return

        c = np.array(closes, dtype=float)
        fast_ma = c[-self.fast:].mean()
        slow_ma = c[-self.slow:].mean()
        fast_prev = c[-self.fast - 1:-1].mean()
        slow_prev = c[-self.slow - 1:-1].mean()

        pos = self.get_position(bar.symbol)
        if fast_prev <= slow_prev and fast_ma > slow_ma:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif fast_prev >= slow_prev and fast_ma < slow_ma:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


class RSIStrategy(Strategy):
    warmup_period = 15
    period = 14
    oversold = 30
    overbought = 70

    def on_bar(self, bar):
        closes = self.get_history(count=self.period + 2, symbol=bar.symbol, field="close")
        if len(closes) < self.period + 2:
            return

        c = np.array(closes, dtype=float)
        rsi_curr = _rsi(c, self.period)
        rsi_prev = _rsi(c[:-1], self.period)

        pos = self.get_position(bar.symbol)
        if rsi_prev >= self.oversold and rsi_curr < self.oversold:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif rsi_prev <= self.overbought and rsi_curr > self.overbought:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


class MACDStrategy(Strategy):
    warmup_period = 35
    fast = 12
    slow = 26
    signal = 9

    def on_bar(self, bar):
        n = self.slow + self.signal + 1
        closes = self.get_history(count=n, symbol=bar.symbol, field="close")
        if len(closes) < n:
            return

        c = np.array(closes, dtype=float)
        dif_curr, dea_curr = _macd(c, self.fast, self.slow, self.signal)
        dif_prev, dea_prev = _macd(c[:-1], self.fast, self.slow, self.signal)

        pos = self.get_position(bar.symbol)
        if dif_prev <= dea_prev and dif_curr > dea_curr:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif dif_prev >= dea_prev and dif_curr < dea_curr:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


class BollingerStrategy(Strategy):
    warmup_period = 20
    period = 20
    multiplier = 2

    def on_bar(self, bar):
        closes = self.get_history(count=self.period + 1, symbol=bar.symbol, field="close")
        if len(closes) < self.period + 1:
            return

        c = np.array(closes, dtype=float)
        ma = c[-self.period:].mean()
        std = float(c[-self.period:].std())
        upper = ma + self.multiplier * std
        lower = ma - self.multiplier * std

        prev_ma = c[-self.period - 1:-1].mean()
        prev_std = float(c[-self.period - 1:-1].std())
        prev_lower = prev_ma - self.multiplier * prev_std
        prev_upper = prev_ma + self.multiplier * prev_std

        pos = self.get_position(bar.symbol)
        if c[-2] >= prev_lower and c[-1] < lower:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif c[-2] <= prev_upper and c[-1] > upper:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


# ---------- helpers ----------

def _rsi(close: np.ndarray, period: int) -> float:
    diff = np.diff(close)
    gain = np.maximum(diff, 0)
    loss = np.maximum(-diff, 0)
    avg_gain = gain[-period:].mean()
    avg_loss = loss[-period:].mean()
    if avg_loss == 0:
        return 100
    return 100 - 100 / (1 + avg_gain / avg_loss)


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    k = 2 / (period + 1)
    result = values.copy()
    for i in range(1, len(result)):
        result[i] = result[i] * k + result[i - 1] * (1 - k)
    return result


def _macd(close: np.ndarray, fast: int, slow: int, signal: int) -> "tuple[float, float]":
    ef = _ema(close, fast)
    es = _ema(close, slow)
    dif = float(ef[-1] - es[-1])
    ds = ef[-signal:] - es[-signal:]
    dea = float(_ema(ds, signal)[-1])
    return dif, dea
