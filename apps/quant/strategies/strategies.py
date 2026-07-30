"""量化交易策略实现模块。

基于 AKQuant 框架的 Strategy 基类，实现了四种经典技术分析策略：
- 双均线交叉（MA Cross）
- RSI 超买超卖
- MACD 信号交叉
- 布林带突破

每个策略通过类属性暴露可调参数，回测时通过子类化动态覆盖参数值。
"""

from akquant import Strategy
import numpy as np


# ============================================================================
# MA Cross — 双均线交叉策略
# ============================================================================


class MACrossStrategy(Strategy):
    """双均线交叉策略。

    核心思想：
      计算快线（短周期均线）和慢线（长周期均线），当快线上穿慢线时
      产生买入信号（金叉），快线下穿慢线时产生卖出信号（死叉）。

    方向：仅做多
    仓位：满仓进出（95% 仓位买入，100% 卖出）

    可调参数：
      fast  int  快线周期，默认 5（即 MA5）
      slow  int  慢线周期，默认 20（即 MA20）

    适用场景：趋势行情中表现较好，震荡行情中容易产生假信号。
    """

    # AKQuant 框架要求的预热周期数，策略需要至少 slow 根 bar 才能计算
    warmup_period = 20

    # 快线计算窗口（如 5 日均线）
    fast = 5

    # 慢线计算窗口（如 20 日均线）
    slow = 20

    def on_bar(self, bar):
        """每根 K 线触发一次的回调。

        1. 从历史数据中获取最近 slow+1 根 bar 的收盘价
        2. 计算当前周期和上一周期的快/慢均线值
        3. 检测交叉信号：
           - 快线上穿慢线（上一根快线 ≤ 慢线 且 当前快线 > 慢线）→ 买入
           - 快线下穿慢线（上一根快线 ≥ 慢线 且 当前快线 < 慢线）→ 卖出
        """
        # 获取历史收盘价，需要 slow+1 根才能计算上一周期的均线值
        closes = self.get_history(count=self.slow + 1, symbol=bar.symbol, field="close")
        if len(closes) < self.slow + 1:
            return

        c = np.array(closes, dtype=float)

        # 当前周期的快线和慢线
        fast_ma = c[-self.fast:].mean()
        slow_ma = c[-self.slow:].mean()

        # 上一周期的快线和慢线（用于检测交叉方向）
        fast_prev = c[-self.fast - 1:-1].mean()
        slow_prev = c[-self.slow - 1:-1].mean()

        pos = self.get_position(bar.symbol)

        # 金叉买入信号：快线从下方上穿慢线
        if fast_prev <= slow_prev and fast_ma > slow_ma:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)

        # 死叉卖出信号：快线从上方下穿慢线
        elif fast_prev >= slow_prev and fast_ma < slow_ma:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


# ============================================================================
# RSI — 相对强弱指标超买超卖策略
# ============================================================================


class RSIStrategy(Strategy):
    """RSI 超买超卖策略。

    核心思想：
      当 RSI 从高于超卖阈值下穿到低于超卖阈值时，认为市场超卖，产生买入信号；
      当 RSI 从低于超买阈值上穿到高于超买阈值时，认为市场超买，产生卖出信号。

    方向：仅做多
    仓位：满仓进出（95% 仓位买入，100% 卖出）

    可调参数：
      period      int  RSI 计算周期，默认 14
      oversold    int  超卖阈值，默认 30（RSI 跌破 30 → 买入）
      overbought  int  超买阈值，默认 70（RSI 突破 70 → 卖出）

    适用场景：震荡行情中表现较好，强趋势行情中可能过早止盈/止损。
    """

    # 预热周期 = period + 2，确保能计算当前和上一周期的 RSI
    warmup_period = 15

    # RSI 计算周期
    period = 14

    # 超卖阈值：RSI 跌破此值触发买入
    oversold = 30

    # 超买阈值：RSI 突破此值触发卖出
    overbought = 70

    def on_bar(self, bar):
        """每根 K 线触发一次的回调。

        1. 获取最近 period+2 根收盘价（确保能计算当前和上一周期的 RSI）
        2. 计算当前和上一周期的 RSI 值
        3. 检测穿越信号：
           - RSI 下穿 oversold（上一根 ≥ oversold 且 当前 < oversold）→ 买入
           - RSI 上穿 overbought（上一根 ≤ overbought 且 当前 > overbought）→ 卖出
        """
        closes = self.get_history(count=self.period + 2, symbol=bar.symbol, field="close")
        if len(closes) < self.period + 2:
            return

        c = np.array(closes, dtype=float)

        # 计算当前和上一周期的 RSI
        rsi_curr = _rsi(c, self.period)
        rsi_prev = _rsi(c[:-1], self.period)

        pos = self.get_position(bar.symbol)

        # 超卖买入信号：RSI 从上方下穿 oversold 阈值
        if rsi_prev >= self.oversold and rsi_curr < self.oversold:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)

        # 超买卖出信号：RSI 从下方上穿 overbought 阈值
        elif rsi_prev <= self.overbought and rsi_curr > self.overbought:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


# ============================================================================
# MACD — 指数平滑异同移动平均线策略
# ============================================================================


class MACDStrategy(Strategy):
    """MACD 信号交叉策略。

    核心思想：
      MACD 由 DIF（快线 EMA - 慢线 EMA）和 DEA（DIF 的信号线 EMA）组成。
      当 DIF 上穿 DEA 时产生买入信号（金叉），DIF 下穿 DEA 时产生卖出信号（死叉）。

    方向：仅做多
    仓位：满仓进出（95% 仓位买入，100% 卖出）

    可调参数：
      fast    int  快线 EMA 周期，默认 12
      slow    int  慢线 EMA 周期，默认 26
      signal  int  信号线（DEA）周期，默认 9

    适用场景：趋势行情中表现稳定，是中长线交易者常用的指标。
    """

    # 预热周期 = slow + signal + 1，确保有足够数据计算 MACD 交叉
    warmup_period = 35

    # 快线 EMA 周期（通常 12）
    fast = 12

    # 慢线 EMA 周期（通常 26）
    slow = 26

    # 信号线（DEA）周期（通常 9）
    signal = 9

    def on_bar(self, bar):
        """每根 K 线触发一次的回调。

        1. 获取足够的收盘价历史数据
        2. 计算当前和上一周期的 DIF 和 DEA
        3. 检测交叉信号：
           - DIF 上穿 DEA（上一根 DIF ≤ DEA 且 当前 DIF > DEA）→ 金叉买入
           - DIF 下穿 DEA（上一根 DIF ≥ DEA 且 当前 DIF < DEA）→ 死叉卖出
        """
        n = self.slow + self.signal + 1
        closes = self.get_history(count=n, symbol=bar.symbol, field="close")
        if len(closes) < n:
            return

        c = np.array(closes, dtype=float)

        # 计算当前和上一周期的 MACD（返回 (DIF, DEA) 元组）
        dif_curr, dea_curr = _macd(c, self.fast, self.slow, self.signal)
        dif_prev, dea_prev = _macd(c[:-1], self.fast, self.slow, self.signal)

        pos = self.get_position(bar.symbol)

        # DIF 金叉 DEA：买入信号
        if dif_prev <= dea_prev and dif_curr > dea_curr:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)

        # DIF 死叉 DEA：卖出信号
        elif dif_prev >= dea_prev and dif_curr < dea_curr:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


# ============================================================================
# Bollinger Bands — 布林带突破策略
# ============================================================================


class BollingerStrategy(Strategy):
    """布林带突破策略。

    核心思想：
      布林带由上轨（MA + k*σ）、中轨（MA）和下轨（MA - k*σ）组成。
      当价格从上方向下跌破下轨时，认为超卖，产生买入信号；
      当价格从下方向上突破上轨时，认为超买，产生卖出信号。

    方向：仅做多
    仓位：满仓进出（95% 仓位买入，100% 卖出）

    可调参数：
      period      int  布林带计算周期，默认 20
      multiplier  int  标准差倍数，默认 2（即上下轨 = MA ± 2σ）

    适用场景：震荡行情中利用均值回归思想捕捉反转点。
    """

    # 预热周期 = period + 1，确保能计算当前和上一周期的布林带
    warmup_period = 20

    # 布林带计算周期
    period = 20

    # 标准差倍数（经典布林带使用 2 倍标准差）
    multiplier = 2

    def on_bar(self, bar):
        """每根 K 线触发一次的回调。

        1. 获取最近 period+1 根收盘价
        2. 计算当前和上一周期的布林带上轨和下轨
        3. 检测穿越信号：
           - 价格跌破下轨（上一根 ≥ 下轨 且 当前 < 下轨）→ 买入
           - 价格突破上轨（上一根 ≤ 上轨 且 当前 > 上轨）→ 卖出
        """
        closes = self.get_history(count=self.period + 1, symbol=bar.symbol, field="close")
        if len(closes) < self.period + 1:
            return

        c = np.array(closes, dtype=float)

        # 当前周期的布林带上轨和下轨
        ma = c[-self.period:].mean()
        std = float(c[-self.period:].std())
        upper = ma + self.multiplier * std
        lower = ma - self.multiplier * std

        # 上一周期的布林带上轨和下轨（用于检测穿越方向）
        prev_ma = c[-self.period - 1:-1].mean()
        prev_std = float(c[-self.period - 1:-1].std())
        prev_lower = prev_ma - self.multiplier * prev_std
        prev_upper = prev_ma + self.multiplier * prev_std

        pos = self.get_position(bar.symbol)

        # 跌破下轨买入信号：价格从上方向下穿越下轨
        # c[-2] 是上一根收盘价，c[-1] 是当前收盘价
        if c[-2] >= prev_lower and c[-1] < lower:
            if pos <= 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.95)

        # 突破上轨卖出信号：价格从下方向上穿越上轨
        elif c[-2] <= prev_upper and c[-1] > upper:
            if pos > 0:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)


# ============================================================================
# Helper Functions — 技术指标计算
# ============================================================================


def _rsi(close: np.ndarray, period: int) -> float:
    """计算 RSI（相对强弱指标）。

    公式：
      RS = 周期内平均涨幅 / 周期内平均跌幅
      RSI = 100 - 100 / (1 + RS)

    当平均跌幅为 0 时，RSI = 100（表示只涨不跌）。

    Args：
      close   收盘价数组
      period  RSI 计算周期

    Returns：
      最新的 RSI 值（0-100 之间）
    """
    # 计算逐日涨跌幅（diff[i] = close[i+1] - close[i]）
    diff = np.diff(close)

    # 分离涨幅和跌幅：gain 只保留正值，loss 只保留跌的绝对值
    gain = np.maximum(diff, 0)
    loss = np.maximum(-diff, 0)

    # 取最近 period 天的平均涨跌幅
    avg_gain = gain[-period:].mean()
    avg_loss = loss[-period:].mean()

    # 没有跌幅时 RSI 为 100
    if avg_loss == 0:
        return 100

    return 100 - 100 / (1 + avg_gain / avg_loss)


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    """计算 EMA（指数移动平均）。

    公式：
      EMA(t) = price(t) * k + EMA(t-1) * (1 - k)
      其中 k = 2 / (period + 1)，即平滑因子。

    第一根 bar 直接用原始值作为 EMA 初始值。

    Args：
      values  价格数组
      period  EMA 周期

    Returns：
      与输入等长的 EMA 数组
    """
    # 平滑因子：周期越短，对新价格的权重越高
    k = 2 / (period + 1)

    result = values.copy()
    for i in range(1, len(result)):
        # EMA 递推公式：当前 EMA = 当前价 * k + 昨日 EMA * (1 - k)
        result[i] = result[i] * k + result[i - 1] * (1 - k)

    return result


def _macd(close: np.ndarray, fast: int, slow: int, signal: int) -> "tuple[float, float]":
    """计算 MACD 指标。

    计算步骤：
      1. DIF = EMA(价格, fast) - EMA(价格, slow)
      2. DEA = EMA(DIF, signal)

    Args：
      close   收盘价数组
      fast    快线 EMA 周期（如 12）
      slow    慢线 EMA 周期（如 26）
      signal  信号线周期（如 9）

    Returns：
      (DIF, DEA) 元组，均为最新值
    """
    # 分别计算快线和慢线的 EMA
    ef = _ema(close, fast)
    es = _ema(close, slow)

    # DIF = 快线 EMA - 慢线 EMA
    dif = float(ef[-1] - es[-1])

    # DEA = 最近 signal 个 DIF 值的 EMA
    ds = ef[-signal:] - es[-signal:]
    dea = float(_ema(ds, signal)[-1])

    return dif, dea
