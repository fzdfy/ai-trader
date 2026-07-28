import {
  pgTable,
  text,
  timestamp,
  date,
  numeric,
  jsonb,
  primaryKey,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// md schema — ODS + DWS 层，所有行情数据的权威存储
// ============================================================================

/**
 * board — 行业板块 / 概念板块表
 *
 * 定位：存储 A 股行业板块和概念板块的实时排行数据。
 * 通过 type 字段区分行业 (industry) 和概念 (concept)。
 *
 * 写入策略：每次同步全量覆盖（DELETE + INSERT），确保排行与涨幅最新。
 * 主要读者：前端板块列表页面。
 */
export const board = pgTable("board", {
  /** 板块代码，如 BK1027 */
  code: text("code").primaryKey(),
  /** 板块类型：industry / concept */
  type: text("type").notNull(),
  /** 板块名称 */
  name: text("name").notNull(),
  /** 排名 */
  rank: text("rank").notNull(),
  /** 涨幅(%) */
  changePercent: text("change_percent"),
  /** 热度指标（换手率） */
  popularity: text("popularity"),
  /** 数据更新时间 */
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================

/**
 * instrument — 交易标的基础信息表
 *
 * 定位：整个系统的"股票字典"。
 * 存储 A 股所有标的（股票、ETF、可转债、指数等）的元数据。
 * 每只标的一行，上市 / 退市 / 暂停上市通过 status 区分。
 *
 * 写入策略：每日 / 每周从上游全量刷新，UPSERT。
 * 主要读者：前端自选搜索、K 线查询跨库 JOIN、同步 Worker 取列表。
 */
export const instrument = pgTable("instrument", {
  /** 唯一标识，格式如 000001.SZ / 600000.SH */
  symbol: text("symbol").primaryKey(),
  /** 上游原始代码，如 sh600519 / sz000001 */
  code: text("code"),
  /** 中文名称，如 平安银行 */
  name: text("name").notNull(),
  /** 交易所代码：SZ（深交所）/ SH（上交所）/ BJ（北交所） */
  exchange: text("exchange").notNull(),
  /** 市场：CN / HK / US */
  market: text("market"),
  /** 上市日期，用于全量回灌的起始点 */
  listDate: date("list_date"),
  /** 退市日期，已退市标的不再同步行情 */
  delistDate: date("delist_date"),
  /**
   * 当前状态：
   * - listed    正常上市
   * - suspended 停牌
   * - delisted  已退市
   */
  status: text("status").notNull().default("active"),
  /** 元数据最后更新时间 */
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================

/**
 * trading_calendar — 交易日历表
 *
 * 定位：整个系统判断"某一天是否交易、交易多久"的唯一权威来源。
 *
 * 使用场景：
 * - 同步 Worker 的 kline-1m/kline-1d 管道：非交易日直接 return，不拉数据。
 * - 对账补洞的 gap-detect 管道：从 trade_type 推导出当天应有分钟点集合。
 * - 前端日历组件：标注哪些天有行情、哪些天半日市。
 *
 * 写入策略：每月初从上游抓取当月 + 下月日历，全量 UPSERT。
 *
 * ── 关键设计决策 ──
 *
 * 1. exchange 不作为主键
 *    A 股沪深北三所交易日历完全相同。不放 exchange 进 PK 意味着
 *    `SELECT * WHERE trade_date = '2026-07-20'` 一行即答，不需要额外条件。
 *    如果将来接入港股通，再加 exchange 列但不上 PK。
 *
 * 2. is_trading_day 默认 false
 *    这是安全底线。如果某天没有写入记录（例如新系统未初始化），
 *    默认 false 会让同步 Worker 认为"今天不开盘，跳过"，
 *    而不是默认 true 导致在非交易日疯狂调上游 API。
 *
 * 3. trade_type 区分全/半日市
 *    - full    : 标准交易日（09:30-11:30, 13:00-15:00）
 *    - half_am : 仅上午交易（除夕等，09:30-11:30 之后休市）
 *    - half_pm : 仅下午交易（极少见，13:00-15:00）
 *    - closed  : 非交易日
 *    对账补洞时根据 trade_type 生成对应分钟点集合，而不是永远 240 分钟。
 *
 * 4. open_time / close_time 不存库
 *    A 股交易时段是常数（上午 09:30-11:30，下午 13:00-15:00），
 *    存在每行里是纯冗余。如需接入其他市场（港股/美股），
 *    在 calendar.ts 工具层用常量映射 exchange → 时段即可。
 *
 * 5. reason 列追溯"为什么不是交易日"
 *    方便运维排查：周末、法定节假日（春节/国庆）、特殊休市（台风/熔断）。
 */
export const tradingCalendar = pgTable("trading_calendar", {
  /**
   * 日期，主键。
   * 一行 = 一天，不区分交易所。
   */
  tradeDate: date("trade_date").primaryKey(),

  /**
   * 是否为交易日。
   * 默认 false：缺行 = 不开盘（安全兜底）。
   */
  isTradingDay: boolean("is_trading_day").notNull().default(false),

  /**
   * 交易日类型：
   * - full    标准全天交易（09:30-11:30, 13:00-15:00）
   * - half_am 仅上午（09:30-11:30）
   * - half_pm 仅下午（13:00-15:00）
   * - closed  非交易日
   *
   * gap-detect 管道根据此字段生成应有分钟点：
   *   full    → 240 分钟（上午 120 + 下午 120）
   *   half_am → 120 分钟（仅上午）
   *   half_pm → 120 分钟（仅下午）
   *   closed  → 0 分钟
   */
  tradeType: text("trade_type").notNull().default("closed"),

  /**
   * 非交易日原因（仅在 is_trading_day = false 时有意义）：
   * - weekday  普通工作日（应当交易但未交易，极少见）
   * - weekend  周末
   * - holiday  法定节假日（春节/国庆/五一等）
   * - special  特殊休市（台风/熔断/临时停市）
   *
   * 交易日时此列为 null。
   */
  reason: text("reason"),
});

// ============================================================================

/**
 * quote_latest — 最新行情快照表
 *
 * 定位：每只股票只有一行，永远覆盖写。反映的是"此刻"的最新行情。
 *
 * 存储内容：quotes.cn 返回的全部核心字段——价格、涨跌幅、成交量、换手率、
 * PE/PB、涨跌停价、盘口五档、交易状态，以及上游所有长尾字段的 jsonb 兜底。
 *
 * 写入策略：Quote Fetcher 每次拉取后异步 UPSERT，ON CONFLICT (symbol) 覆盖。
 * 频率：hot pool 约 0.5~1s 一次，cold pool 约 3~10s 一次。
 *
 * 主要读者：Hono API 首屏快照、后端 Worker 获取当前价、进程重启兜底。
 * 不是为"实时推送"准备的（那靠内存热缓存 + SSE）。
 */
export const quoteLatest = pgTable("quote_latest", {
  /** 股票代码，唯一主键，如 000001.SZ */
  symbol: text("symbol").primaryKey(),
  /** 中文名称，冗余字段，方便单表查询不用 JOIN instrument */
  name: text("name"),
  /** 上游数据时间戳，即报价的生成时间 */
  ts: timestamp("ts").notNull(),
  /** 最新成交价 */
  last: numeric("last"),
  /** 今日开盘价（不变） */
  open: numeric("open"),
  /** 日内最高价（只升不降，UPSERT 用 MAX 逻辑） */
  high: numeric("high"),
  /** 日内最低价（只降不升，UPSERT 用 MIN 逻辑） */
  low: numeric("low"),
  /** 昨日收盘价 */
  preClose: numeric("pre_close"),
  /** 当日累计成交量（股） */
  volume: numeric("volume"),
  /** 当日累计成交额（元） */
  amount: numeric("amount"),
  /** 涨跌额 = last - pre_close */
  change: numeric("change"),
  /** 涨跌幅（%） */
  changePct: numeric("change_pct"),
  /** 换手率（%） */
  turnoverRate: numeric("turnover_rate"),
  /** 市盈率（动态） */
  pe: numeric("pe"),
  /** 市净率 */
  pb: numeric("pb"),
  /** 涨停价（含精度） */
  limitUp: numeric("limit_up"),
  /** 跌停价（含精度） */
  limitDown: numeric("limit_down"),
  /** 买一价（买盘最优价） */
  bid1: numeric("bid1"),
  /** 买一量（股） */
  bid1Vol: numeric("bid1_vol"),
  /** 卖一价（卖盘最优价） */
  ask1: numeric("ask1"),
  /** 卖一量（股） */
  ask1Vol: numeric("ask1_vol"),
  /** 买二~买五盘口快照，JSON 数组 [{price, vol}, ...] */
  bid2To5: jsonb("bid2_5"),
  /** 卖二~卖五盘口快照，JSON 数组 [{price, vol}, ...] */
  ask2To5: jsonb("ask2_5"),
  /** 交易状态：trading / suspended / halted */
  status: text("status"),
  /**
   * 上游其他长尾字段的兜底存储，jsonb 格式。
   * 可包含：委比、委差、振幅、量比、流通市值、总市值、涨停封单等。
   * 放在 jsonb 里避免频繁 ALTER TABLE。
   */
  extra: jsonb("extra"),
  /** 上游返回的更新时间 */
  sourceUpdatedAt: timestamp("source_updated_at"),
  /** 后端写入时间，用于监控延迟 */
  ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
});

// ============================================================================

/**
 * quote_snapshot — 盘口快照历史表
 *
 * 定位：记录"某只股票在某个精确时刻的盘口和成交发生了什么"。
 * 这是全系统唯一一张以"盘口变化事件"为记录单位、只追加不做覆盖的流水表。
 *
 * 与 quote_latest 的区别：
 *   quote_latest  = 每标的一行，覆盖写，"此刻"行情
 *   quote_snapshot = 每标的多行，追加写，"历史"盘口流水
 *
 * ── 字段选取原则 ──
 *
 * 只存"每个快照之间真正有差异"的字段。放入以下 4 类的字段被移除：
 *
 *   a) 日内常量——开盘价 open
 *      全天不变，同一 symbol 的所有快照行中值完全相同。
 *      回放时从 bar_1d_adj 的当日 open 取即可。
 *
 *   b) 日内滚动极值——high / low
 *      只在突破前高/新低时变化，99% 的快照中不变。
 *      真正的分析应该从 bar_1m_adj 聚合得到（结果等价且更省空间）。
 *
 *   c) 慢变量——pe / turnover_rate
 *      PE 和换手率在子分钟粒度下几乎不变化，每秒存一次没有分析价值。
 *      需要时从 quote_latest 或 bar_1d_adj 关联。
 *
 *   d) 快照间不变量——volume / amount / changePct
 *      这些是累计值，只在有新成交时有差异。
 *      对于 price_tick 触发的快照（last 变化），volume/amount 大概率也跟着变了——
 *      但变化幅度对回放分析的价值远低于 bid_ask_depth 的变化。
 *      如果需要精确的 秒级 volume，从 trade tick 数据重建更可靠。
 *
 * ── 写入策略 ──
 *
 * 触发条件（由 Fetcher 层判定）：
 *
 *   price_tick     last 相比上一快照变化 ≥ 1 个最小报价单位 → 写
 *                  这是最常见的触发，尤其在活跃标的。
 *   volume_spike   3 秒内成交量超过前 30s 均值的 3 倍 → 写
 *                  用于捕捉"突然放量"时刻的盘口快照。
 *   periodic       超过 60s 没有任何触发 → 兜底写一条
 *                  防止长时间无成交的标的完全没有记录。
 *
 * 频率上限：同一 symbol 最快 0.5s 一条（应用层限流）。
 *
 * ── TimescaleDB 策略 ──
 *
 * hypertable 按 time 分区，chunk_interval = 1 day。
 * 7 天后压缩（segmentby = symbol，orderby = time desc）。
 * 保留 90 天（快照数据价值随时间快速衰减，超过一季度没必要存）。
 *
 * ── 典型分析查询 ──
 *
 * "为什么 10:15 突然拉升"  → 取该秒前后 30 条 price_tick 快照，看 bid_ask_depth 的演变
 * "今天哪些股票出现了价格异动" → group by symbol, trigger='price_tick', count(*) desc
 * "回放某只股票昨天的盘口" → SELECT * WHERE symbol=... AND time BETWEEN... ORDER BY time
 *
 * ── 第一期策略 ──
 *
 * 表结构先行创建，写入代码后续补上。
 * 初期只开启 cold pool 的 periodic 写入（每分钟 1 条），数据量可控。
 */
export const quoteSnapshot = pgTable(
  "quote_snapshot",
  {
    /**
     * 快照时刻，hypertable 的时间分区列。
     * 精度到毫秒：hot pool 同 symbol 最快 0.5s 一条，
     * 结合应用层限流，time + symbol 碰撞的概率极低。
     */
    time: timestamp("time").notNull(),

    /** 股票代码 */
    symbol: text("symbol").notNull(),

    /**
     * 最新成交价。
     * 与上一快照的 last 对比 delta 是 price_tick 触发的判断依据。
     */
    last: numeric("last"),

    /**
     * 买一价（买盘最优价）。
     * 盘口回放核心字段——看买盘是否被吃掉、是否有大单垫在买一。
     */
    bid1: numeric("bid1"),
    /** 买一量（股） */
    bid1Vol: numeric("bid1_vol"),

    /**
     * 卖一价（卖盘最优价）。
     * 盘口回放核心字段——看卖盘是否被击穿、是否有大单压在卖一。
     */
    ask1: numeric("ask1"),
    /** 卖一量（股） */
    ask1Vol: numeric("ask1_vol"),

    /**
     * 五档盘口完整快照，JSON 数组：
     * [{side: "bid"|"ask", level: 1-5, price, vol}, ...]
     *
     * 回放中最有价值的数据——从盘口深度演变可以看到：
     * - 主力挂单行为（大单撤单/加单）
     * - 支撑/压力位的形成与突破
     * - 流动性变化
     */
    bidAskDepth: jsonb("bid_ask_depth"),

    /**
     * 快照触发原因，由 Fetcher 层在写库前判定：
     * - price_tick    价格跳动触发（最活跃）
     * - volume_spike  成交量异动触发
     * - periodic      兜底定时采样
     *
     * 回放时据此区分"有事件发生"和"只是定时记录"。
     */
    trigger: text("trigger"),

    /**
     * 扩展字段，jsonb 格式。
     * 可包含：量比、振幅、涨停封单量等不需要单独建列的长尾指标。
     */
    extra: jsonb("extra"),

    /** 上游数据生成时间 */
    sourceUpdatedAt: timestamp("source_updated_at"),

    /** 后端写入时间，用于监控写延迟 */
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (table) => [
    /**
     * 主键：(time, symbol)，时间在前。
     *
     * 理由：
     * 1. TimescaleDB hypertable 按 time 分区，time 在前的 PK 让 chunk 路由
     *    在 INSERT 时直接定位到正确分区，不需要先跨 chunk 扫描 symbol。
     * 2. 99% 的查询都是时间范围扫描（WHERE time BETWEEN ...），
     *    time 在前直接走 hypertable 的 chunk 裁剪，symbol 在后做二次过滤。
     * 3. 压缩策略 segmentby = symbol + orderby = time desc ——
     *    (time, symbol) 的顺序与压缩列对齐，解压时无需额外排序。
     * 4. 这块表是 append-only 流水，不存在按 symbol 点查最新 N 条的场景
     *    （那是 quote_latest 和 bar1m_adj 的职责）。
     */
    primaryKey({ columns: [table.time, table.symbol] }),
  ],
);

// ============================================================================

/**
 * bar_1m_adj — 1 分钟 K 线表（后复权）
 *
 * 定位：整个系统唯一的分钟级明细基表。所有多分钟粒度（5m/15m/30m/60m）
 * 均通过 TimescaleDB 连续聚合（cagg）从此表派生，不再建独立的宽表。
 *
 * 存储内容：每只股票每个交易分钟一根 Bar 的 OHLCV。
 * 复权口径：后复权，与 bar_1d_adj 口径一致，可无缝拼接。
 *
 * ── 写入策略 ──
 *
 * Sync Worker 每 30s 调用 kline.cnMinute，带 60 分钟 overlap 增量拉取，
 * INSERT ... ON CONFLICT (time, symbol) DO UPDATE，幂等安全。
 * 最后一根未收盘 candle 从 quotes.cn 前端 overlay，不落库。
 *
 * ── TimescaleDB 策略 ──
 *
 * - hypertable，按 time 分区，chunk_interval = 1 day
 * - 7 天后压缩（segmentby = symbol，orderby = time desc）
 *   → PK 是 (time, symbol)，time 在前，与压缩列完全对齐，解压无需额外排序
 * - 额外 idx: (symbol, time) 用于 "查某股票 K 线列表" 的 API 查询
 * - 保留 3 年
 *
 * ── 为何 PK 是 (time, symbol) 而非 (symbol, time) ──
 *
 * 两种查询模式都需要高效支持：
 *   a) INSERT/ON CONFLICT  —— 走 PK → time 在前让 hypertable chunk 路由直达
 *   b) WHERE symbol=... ORDER BY time  —— 不走 PK，走 (symbol, time) 辅助索引
 *
 * 如果 PK 是 (symbol, time)：查询 b 走 PK 完美，但查询 a 每次 INSERT
 * 都要先 hash symbol 再找 chunk，写入吞吐下降，chunk 裁剪也无法利用 PK。
 *
 * 结论：PK 服务于写入 + hypertable 压缩，查询靠辅助索引。
 */
export const bar1mAdj = pgTable(
  "bar1m_adj",
  {
    /**
     * Bar 的分钟起始时间。
     * 如 2026-07-12 09:30:00。
     * PK 首列 = hypertable 分区列 = 压缩 orderby 列。
     */
    time: timestamp("time").notNull(),
    /** 股票代码 */
    symbol: text("symbol").notNull(),
    /** 该分钟第一笔成交价 */
    open: numeric("open").notNull(),
    /** 该分钟最高成交价 */
    high: numeric("high").notNull(),
    /** 该分钟最低成交价 */
    low: numeric("low").notNull(),
    /** 该分钟最后一笔成交价 */
    close: numeric("close").notNull(),
    /** 该分钟成交量（股） */
    volume: numeric("volume").notNull(),
    /** 该分钟成交额（元） */
    amount: numeric("amount"),
    /** 该分钟均价 = amount / volume，用于连续聚合时加权 */
    avgPrice: numeric("avg_price"),
    /** 上游数据更新时间，监控上游延迟 */
    sourceUpdatedAt: timestamp("source_updated_at"),
    /** 后端写入时间，监控同步延迟 */
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (table) => [
    /** (time, symbol) —— 服务于 INSERT 性能 + hypertable 压缩对齐 */
    primaryKey({ columns: [table.time, table.symbol] }),
    /** (symbol, time) —— 服务于 "查某股票 K 线" 的 API 查询 */
    index("bar1m_adj_symbol_time_idx").on(table.symbol, table.time),
  ],
);

// ============================================================================

/**
 * bar_1d_adj — 日 K 线表（后复权）
 *
 * 定位：权威日线数据，从上游 kline.cn 独立同步。
 * 不依赖于 bar_1m_adj 聚合——上游日线可能含集合竞价数据（09:25 开盘价），
 * 分钟线聚合无法还原集合竞价产生的开盘价和成交量，因此日线有自己的权威来源。
 *
 * 周线 / 月线可通过 TimescaleDB cagg 从本表派生。
 *
 * ── 写入策略 ──
 *
 * Sync Worker 每 5 分钟检查一次，仅在交易日收盘后拉取（isAfterMarketClose）。
 * 增量拉取时带 30 交易日 overlap。
 * 新 symbol 全量回灌从 instrument.list_date 开始。
 *
 * ── TimescaleDB 策略 ──
 *
 * - hypertable，按 time 分区，chunk_interval = 1 month
 * - 30 天后压缩（segmentby = symbol，orderby = time desc）
 * - 保留 10 年
 *
 * ── 与 bar_1m_adj 的结构差异 ──
 *
 * 两表除表名和 time 语义外完全相同：
 *   bar_1m_adj.time = 精确到分钟的时刻
 *   bar_1d_adj.time = 交易日日期（概念上是 date，但 TimescaleDB 分区要求 timestamp）
 *
 * DDL 层面共用相同的列定义和索引策略。
 */
export const bar1dAdj = pgTable(
  "bar1d_adj",
  {
    /** 交易日对应日期 00:00:00，PK 首列兼 hypertable 分区列 */
    time: timestamp("time").notNull(),
    /** 股票代码 */
    symbol: text("symbol").notNull(),
    /** 当日开盘价（含集合竞价，与 bar1m 聚合的 09:30 open 可能不同） */
    open: numeric("open").notNull(),
    /** 当日最高价 */
    high: numeric("high").notNull(),
    /** 当日最低价 */
    low: numeric("low").notNull(),
    /** 当日收盘价 */
    close: numeric("close").notNull(),
    /** 当日成交量（股） */
    volume: numeric("volume").notNull(),
    /** 当日成交额（元） */
    amount: numeric("amount"),
    /** 当日均价 = amount / volume */
    avgPrice: numeric("avg_price"),
    /** 技术指标数据，jsonb 格式：{ ma: {5: [...], 10: [...]}, macd: {...}, ... } */
    indicators: jsonb("indicators"),
    /** 上游数据更新时间 */
    sourceUpdatedAt: timestamp("source_updated_at"),
    /** 后端写入时间 */
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.time, table.symbol] }),
    index("bar1d_adj_symbol_time_idx").on(table.symbol, table.time),
  ],
);
