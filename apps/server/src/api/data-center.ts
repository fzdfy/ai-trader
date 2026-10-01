import { Hono } from "hono";
import { db } from "../db";
import { sql, desc, inArray } from "drizzle-orm";
import { ok, notFound, serverError } from "../lib/response";
import { jobRun } from "../db/schema";
import { createLogger } from "../lib/logger";
import { SYNC_MODULES } from "./sync";
import { quant } from "../lib/quant";

const dataCenterRoute = new Hono();

const log = createLogger("data-center");

/**
 * 数据中心 —— 股票数据相关表的目录（表清单 + 表结构 + 更新记录）。
 *
 * 元信息（中文名 / 描述）与 schema 定义（db/schema/md.ts）保持一一对应，
 * 用静态注册表显式声明，避免运行时从 pg catalog 猜中文名。
 * `timeColumn` 既用于计算「更新时间」，也决定了该表的业务时间口径：
 *   - 时间序列表（K 线 / 盘口 / 日历）：取分区列 time / trade_date，走索引且语义为「最新数据时间」
 *   - 快照 / 排行表：取 updated_at / ingested_at / ts，语义为「最近一次写入时间」
 * `jobTypes` 为该表对应的同步任务，用于「更新记录」tab 检索 job_run。
 */
/** 上游真实接口：数据最终从哪个外部 HTTP 接口取得（含完整 URL 与请求方式） */
export interface UpstreamEndpoint {
  /** HTTP 请求方式 */
  method: "GET" | "POST";
  /** 完整上游 URL（协议 + 主机 + 路径） */
  url: string;
  /** 该接口取用的数据用途（同源多接口时用于区分） */
  target?: string;
}

/** 数据来源条目：「数据来源」tab 的一行，一个上游来源 */
export interface DataSourceMeta {
  /** 上游平台 / 提供方 */
  platform: string;
  /** 调用链 / 取数方法：如 quant.stockKline；本地派生则为派生说明 */
  endpoint: string;
  /**
   * 上游真实 HTTP 接口列表；本地派生 / 无外部 HTTP 源（如 mootdx TCP、stock-sdk 聚合）时缺省。
   * 有值时「接口 / 方法」展示为 `endpoint → METHOD url`；缺省时仅展示 `endpoint`。
   */
  upstream?: UpstreamEndpoint[];
  /** 复权口径 / 覆盖范围 / 备注 */
  note?: string;
}

/** 同步策略：「数据同步」tab · 同步策略块 */
export interface SyncPolicyMeta {
  /** 触发方式 */
  trigger: string;
  /** cron 表达式；无定时任务为 null */
  cron: string | null;
  /** 前置依赖 jobType（完成后才执行），无则 null */
  dependsOn: string | null;
  /** 重试截止时间 "HH:mm"，无则 null */
  deadline: string | null;
  /** 补充说明 */
  note?: string;
}

/** 回补：「数据同步」tab · 回补块 */
export interface BackfillMeta {
  /** 是否有独立回补任务 */
  separate: boolean;
  /** 回补触发方式；无独立任务为 null */
  trigger: string | null;
  /** cron；无独立任务为 null */
  cron: string | null;
  /** 回补范围 / 窗口说明 */
  note: string;
}

/** 降级：「数据同步」tab · 降级块 */
export interface FallbackMeta {
  /** quant 能力标识 */
  capability: string;
  /** 有序降级链，首项为主源；空数组表示无降级链 */
  chain: string[];
  /** 是否允许跨源降级（口径铁律场景为 false） */
  degrade: boolean;
  /** 说明 */
  note?: string;
}

export interface DataTableDef {
  /** 实际表名 */
  table: string;
  /** 中文名 */
  name: string;
  /** 描述 */
  description: string;
  /** 计算「更新时间」所聚合的时间列 */
  timeColumn: string;
  /**
   * 计算「更新时间」时实际聚合的物理表，缺省等于 table。
   * 仅当 table 是视图时使用：指向其底层基表，避免对视图做全量扫描
   * （如 bar1d_qfq 是 bar1d_raw ⋈ adj_factor 的 LATERAL 视图，
   *  `MAX(time)` 会退化为 16.9M 行逐行探测，从毫秒级恶化到分钟级）。
   */
  maxTable?: string;
  /** 写入该表的同步任务 jobType */
  jobTypes: string[];
  /** 数据来源（「数据来源」tab） */
  sources: DataSourceMeta[];
  /** 同步策略（「数据同步」tab） */
  syncPolicy: SyncPolicyMeta;
  /** 回补（「数据同步」tab） */
  backfill: BackfillMeta;
  /** 降级链（「数据同步」tab） */
  fallback: FallbackMeta;
  /** 风控要点（「数据同步」tab） */
  riskControl: string[];
}

export const DATA_CENTER_TABLES: DataTableDef[] = [
  {
    table: "board",
    name: "板块排行",
    description:
      "行业 / 概念板块实时排行快照（涨跌幅、热度、总市值、领涨股）。每次同步全量覆盖，行情页板块列表的数据源。",
    timeColumn: "updated_at",
    jobTypes: ["boards"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardList",
        upstream: [
          { method: "GET", url: "https://push2delay.eastmoney.com/api/qt/clist/get", target: "板块实时排行" },
        ],
        note: "行业 / 概念板块实时排行，含涨跌幅、热度、总市值、领涨股。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
      note: "仅交易日触发；失败由管道内部循环重试至 deadline，hasSuccessToday 保证每日只成功一次。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务——全量覆盖写，每次同步即整表刷新。",
    },
    fallback: {
      capability: "board_list",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "东财统一走 _em_get 串行限流（请求间隔 ≥ 1.5s，连续失败 5 次熔断 5 分钟），禁止直连。",
      "每次全量覆盖写，避免残留历史快照。",
    ],
  },
  {
    table: "board_history",
    name: "板块排行历史",
    description:
      "板块排行的每日快照，按交易日追加以支持板块轮动与历史涨幅回溯；同日重复同步只保留最后一次结果。",
    timeColumn: "updated_at",
    jobTypes: ["boards"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardList",
        upstream: [
          { method: "GET", url: "https://push2delay.eastmoney.com/api/qt/clist/get", target: "板块排行归档" },
        ],
        note: "与 board 同源，按交易日归档为历史快照。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
      note: "与 board 同一次同步写入。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "随 boards 同步；同日重复同步按交易日 UPSERT，只保留最后一次结果。",
    },
    fallback: {
      capability: "board_list",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "东财统一走 _em_get 串行限流（间隔 ≥ 1.5s，熔断 5 分钟）。",
      "按交易日 UPSERT，同日只留最后一次结果。",
    ],
  },
  {
    table: "board_constituent",
    name: "板块成分股",
    description:
      "板块与成分股的绑定关系，并缓存成分股最新行情（涨跌幅、换手率、成交额），供热力图二级节点直接读取。",
    timeColumn: "updated_at",
    jobTypes: ["constituents"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardConstituents",
        upstream: [
          { method: "GET", url: "https://push2delay.eastmoney.com/api/qt/clist/get", target: "板块成分股" },
        ],
        note: "板块↔成分股绑定，并缓存成分股最新行情。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10（依赖板块排行）",
      cron: "10 15 * * 1-5",
      dependsOn: "boards",
      deadline: "18:00",
      note: "需 boards 当日成功后才会执行。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务。",
    },
    fallback: {
      capability: "board_constituents",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "CONCURRENCY=1 逐板块串行，配合单板块超时兜底，避免被误判为连续失败。",
      "东财统一走 _em_get 串行限流。",
      "MISSING_TOLERANCE=10：应有成分股的板块中缺失 ≤10 个视为成功。",
    ],
  },
  {
    table: "board_kline",
    name: "板块指数日 K 线",
    description:
      "落库行业 / 概念板块指数的日 K 线，收盘后定时同步，供筹码分布等模块从库读取，避免实时拉取上游。",
    timeColumn: "time",
    jobTypes: ["board-kline"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardKline",
        upstream: [
          { method: "GET", url: "https://push2his.eastmoney.com/api/qt/stock/kline/get", target: "板块指数日 K" },
        ],
        note: "行业 / 概念板块指数全量历史日 K。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10（依赖板块排行）",
      cron: "10 15 * * 1-5",
      dependsOn: "boards",
      deadline: "18:00",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务。",
    },
    fallback: {
      capability: "board_kline",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "CONCURRENCY=2 + THROTTLE_MS=400 节流。",
      "东财统一走 _em_get 串行限流。",
      "MISSING_TOLERANCE=10。",
    ],
  },
  {
    table: "instrument",
    name: "交易标的基础信息",
    description:
      "整个系统的「股票字典」，存储 A 股全部标的（股票 / ETF / 可转债 / 指数）的元数据与上市、退市状态。",
    timeColumn: "updated_at",
    jobTypes: [],
    sources: [
      {
        platform: "多源聚合（stock-sdk）",
        endpoint: "sdk.codes.cn + sdk.batch.byCodes",
        note: "A 股全部标的（股票 / ETF / 可转债 / 指数）的代码与元数据、上市状态。",
      },
      {
        platform: "本地派生",
        endpoint: "bar1d_raw 的 MIN(time)",
        note: "上市日取该标的最早一根日线（上游行情接口不提供上市日）。",
      },
    ],
    syncPolicy: {
      trigger: "脚本按需执行（scripts/sync-instruments.ts）",
      cron: null,
      dependsOn: null,
      deadline: null,
      note: "未纳入定时同步，需要时手动重跑。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无回补；全量重建字典。",
    },
    fallback: {
      capability: "quote",
      chain: ["tencent", "mootdx"],
      degrade: true,
      note: "由 stock-sdk 内部多 provider 重试 / 降级。",
    },
    riskControl: [
      "东财 provider 令牌桶串行（QPS ≤ 2）+ 浏览器 UA / Referer。",
      "批量分片拉取，业务层 withSdkRetry 仅重试网络 / 超时 / 限流 / 熔断类错误。",
    ],
  },
  {
    table: "trading_calendar",
    name: "交易日历",
    description:
      "判断某一天是否交易、交易多久的唯一权威来源（全天 / 半日市 / 休市），供同步管道跳过非交易日与对账补洞推导分钟点。",
    timeColumn: "trade_date",
    jobTypes: [],
    sources: [
      {
        platform: "深圳证券交易所（官方）",
        endpoint: "sync-worker/calendar",
        upstream: [
          {
            method: "GET",
            url: "https://www.szse.cn/api/report/exchange/onepersistenthour/monthList",
            target: "交易日 / 休市标志",
          },
        ],
        note: "按月返回交易日 / 休市二元标志，无 key、无风控。",
      },
    ],
    syncPolicy: {
      trigger: "每周一凌晨 2:00",
      cron: "0 2 * * 1",
      dependsOn: null,
      deadline: null,
      note: "一次性补齐未来交易日。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务；每周巡检即补。",
    },
    fallback: {
      capability: "—",
      chain: [],
      degrade: false,
      note: "交易所官方接口直连，无 quant 能力域，不参与运行时降级状态。",
    },
    riskControl: [
      "官方接口无风控，低频一次性拉取。",
      "缺行按「非交易日」安全兜底。",
    ],
  },
  {
    table: "quote_latest",
    name: "最新行情快照",
    description:
      "每只股票一行、覆盖写的最新行情（价格、涨跌幅、量额、换手率、PE/PB、涨跌停价、盘口五档）。",
    timeColumn: "ts",
    jobTypes: [],
    sources: [
      {
        platform: "多源聚合（stock-sdk quotes.cn）",
        endpoint: "Quote Fetcher → quotes.cn",
        note: "价格、涨跌幅、量额、换手率、PE/PB、涨跌停价、盘口五档、交易状态。",
      },
    ],
    syncPolicy: {
      trigger: "盘中实时（Quote Fetcher 异步覆盖写）",
      cron: null,
      dependsOn: null,
      deadline: null,
      note: "hot pool 约 0.5~1s 一次、cold pool 约 3~10s 一次；非定时同步管道写入。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "覆盖写，无历史回补概念。",
    },
    fallback: {
      capability: "quote",
      chain: ["tencent", "mootdx"],
      degrade: true,
      note: "由 stock-sdk 内部多 provider 重试 / 降级。",
    },
    riskControl: [
      "hot / cold pool 分级拉取频率。",
      "ON CONFLICT(symbol) 覆盖写，high / low 用 MAX / MIN 合并。",
    ],
  },
  {
    table: "quote_snapshot",
    name: "盘口快照历史",
    description:
      "以「盘口变化事件」为记录单位、只追加不覆盖的流水表，记录价格跳动 / 放量 / 定时的盘口深度演变，用于盘中回放分析。",
    timeColumn: "time",
    jobTypes: [],
    sources: [
      {
        platform: "多源聚合（stock-sdk quotes.cn）",
        endpoint: "Quote Fetcher → quotes.cn",
        note: "盘口五档 + 成交事件。",
      },
    ],
    syncPolicy: {
      trigger: "盘中事件触发（price_tick / volume_spike / periodic）",
      cron: null,
      dependsOn: null,
      deadline: null,
      note: "第一期仅开启 cold pool 的 periodic 写入（每分钟 1 条）。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "只追加流水，无回补。",
    },
    fallback: {
      capability: "quote",
      chain: ["tencent", "mootdx"],
      degrade: true,
      note: "由 stock-sdk 内部多 provider 重试 / 降级。",
    },
    riskControl: [
      "同一 symbol 最快 0.5s 一条（应用层限流）。",
      "TimescaleDB：按 time 分区，7 天压缩、90 天保留。",
    ],
  },
  {
    table: "bar1m_adj",
    name: "1 分钟 K 线",
    description:
      "分钟级明细基表（前复权），5m / 15m / 30m / 60m 等粒度均通过连续聚合从此表派生。",
    timeColumn: "time",
    jobTypes: ["kline-1m"],
    sources: [
      {
        platform: "通达信",
        endpoint: "quant kline tf=1m（mootdx）",
        note: "分钟级明细；腾讯不支持分钟线，实际落到 mootdx。",
      },
    ],
    syncPolicy: {
      trigger: "未启用",
      cron: "*/30 * * * * *",
      dependsOn: null,
      deadline: null,
      note: "管道为空壳（未实现），cron 已置 disabled，暂不调度以免同步中心误显「成功」。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务。",
    },
    fallback: {
      capability: "kline",
      chain: ["tencent", "mootdx", "baidu"],
      degrade: true,
      note: "分钟线腾讯不支持，实际仅 mootdx 可用。",
    },
    riskControl: ["mootdx 为 TCP 直连，不封 IP。", "管道未实现，暂无写入。"],
  },
  {
    table: "bar1d_raw",
    name: "日 K 线（原始价基表）",
    description:
      "复权口径改造后的日线唯一价格基表，存上游不复权价（adjust=none），按 time 年度 RANGE 分区；前 / 后复权分别由 bar1d_qfq / bar1d_hfq 视图按需派生。",
    timeColumn: "time",
    jobTypes: ["kline-1d", "kline-1d-backfill"],
    sources: [
      {
        platform: "腾讯",
        endpoint: "quant.stockKline",
        upstream: [
          {
            method: "GET",
            url: "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get",
            target: "沪深不复权日 K（adjust=none）",
          },
        ],
        note: "沪深标的，落库不复权原始价。",
      },
      {
        platform: "东方财富",
        endpoint: "quant.stockKline",
        upstream: [
          { method: "GET", url: "https://push2his.eastmoney.com/api/qt/stock/kline/get", target: "北交所不复权日 K" },
        ],
        note: "北交所（.BJ）标的。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
      note: "全市场约 5552 只，源固定腾讯（北交所走东财），正常约 46 分钟跑完。",
    },
    backfill: {
      separate: true,
      trigger: "交易日 19:30",
      cron: "30 19 * * 1-5",
      note: "只补「窗口内缺失的历史交易日」（显式排除当日）；完成后内联重收敛 adj-factor 与 kline-period。",
    },
    fallback: {
      capability: "kline",
      chain: ["tencent", "eastmoney"],
      degrade: false,
      note: "口径铁律：源按市场固定（沪深腾讯 / 北交所东财），同链内不跨源降级，防复权口径污染。",
    },
    riskControl: [
      "KLINE_PAGE=600 分页拉取，不足一页即到底。",
      "CONCURRENCY=2 + THROTTLE_MS=800 节流。",
      "MAX_FETCH_ATTEMPTS=3 重试。",
      "北交所走东财 _em_get 串行限流。",
      "MISSING_TOLERANCE=10。",
    ],
  },
  {
    table: "adj_factor",
    name: "复权因子",
    description:
      "全市场复权参数唯一事实源，事件驱动稀疏表：按 (symbol, date) 存每段的乘法因子 qfq_ratio 与加法偏移 qfq_offset，送转 / 除权日只 append 一行、不改历史。",
    timeColumn: "date",
    jobTypes: ["adj-factor"],
    sources: [
      {
        platform: "腾讯",
        endpoint: "quant.adjustParams",
        upstream: [
          {
            method: "GET",
            url: "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get",
            target: "沪深复权参数（反解分段仿射）",
          },
        ],
        note: "沪深标的，反解分段仿射参数。",
      },
      {
        platform: "东方财富",
        endpoint: "quant.adjustParams",
        upstream: [
          { method: "GET", url: "https://push2his.eastmoney.com/api/qt/stock/kline/get", target: "北交所复权参数" },
        ],
        note: "北交所（.BJ）标的。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10（依赖日 K 线）",
      cron: "10 15 * * 1-5",
      dependsOn: "kline-1d",
      deadline: "18:00",
      note: "反解腾讯仿射复权参数，是 qfq / hfq 视图的数据来源，须先于读视图的下游。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补；由 kline-1d-backfill 完成后内联重收敛。",
    },
    fallback: {
      capability: "kline",
      chain: ["tencent", "eastmoney"],
      degrade: false,
      note: "反解 /adjust-params（kline 能力域）：源按市场固定（沪深腾讯 / 北交所东财），绝不同链跨源降级。",
    },
    riskControl: [
      "PARAM_LIMIT=800 分段拉取。",
      "CONCURRENCY=2 + THROTTLE_MS=800 节流。",
      "MAX_ATTEMPTS=3 退避重试（5000ms × attempt）。",
      "MISSING_TOLERANCE=10：仍有 >10 只未取到参数则判未完全成功。",
    ],
  },
  {
    table: "adj_factor_latest",
    name: "最新复权因子快照",
    description:
      "每只标的一行的后复权全局仿射常量（scale / hfq_base），由 adj-factor 管道按 adj_factor 重算 upsert，使后复权视图退化为一次 hash join。",
    timeColumn: "updated_at",
    jobTypes: ["adj-factor"],
    sources: [
      {
        platform: "本地派生",
        endpoint: "读取 adj_factor 重算",
        note: "由 adj-factor 管道按 adj_factor upsert scale / hfq_base。",
      },
    ],
    syncPolicy: {
      trigger: "随 adj-factor 管道（交易日收盘后 15:10）",
      cron: "10 15 * * 1-5",
      dependsOn: "kline-1d",
      deadline: "18:00",
      note: "与 adj_factor 同属一个同步任务。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "随 adj-factor 重收敛一并 upsert。",
    },
    fallback: {
      capability: "kline",
      chain: [],
      degrade: false,
      note: "本地派生（自 adj_factor）；运行态反映上游 kline 能力域，视图本身无降级链。",
    },
    riskControl: ["每标的一行 upsert，后复权视图退化为一次 hash join。"],
  },
  {
    table: "bar1d_qfq",
    name: "日 K 线",
    description:
      "权威日线读取视图（前复权），由原始价基表 bar1d_raw 与复权因子表按分段仿射模型实时派生；回测读取层 load_kline 的唯一数据源。",
    timeColumn: "time",
    maxTable: "bar1d_raw",
    jobTypes: ["kline-1d", "kline-1d-backfill"],
    sources: [
      {
        platform: "本地派生",
        endpoint: "bar1d_raw ⋈ adj_factor（分段仿射）",
        note: "实时派生视图，无独立同步任务。",
      },
    ],
    syncPolicy: {
      trigger: "随基表与复权因子更新",
      cron: null,
      dependsOn: null,
      deadline: null,
      note: "普通视图（非物化），无需重刷。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立任务；随 bar1d_raw / adj_factor 回补自动生效。",
    },
    fallback: {
      capability: "kline",
      chain: [],
      degrade: false,
      note: "派生视图（自 bar1d_raw ⋈ adj_factor）；运行态反映上游 kline 能力域，视图本身无降级链。",
    },
    riskControl: [
      "LATERAL 分段仿射，按需计算。",
      "更新时间取基表 bar1d_raw，避免视图 16.9M 行全量扫描。",
    ],
  },
  {
    table: "bar1d_hfq",
    name: "后复权日 K 线",
    description:
      "后复权读取视图（派生），复刻腾讯全局仿射式 hfq = scale · qfq + hfq_base；无独立同步任务，随 bar1d_raw 与复权因子表更新。",
    timeColumn: "time",
    maxTable: "bar1d_raw",
    jobTypes: [],
    sources: [
      {
        platform: "本地派生",
        endpoint: "bar1d_raw ⋈ adj_factor_latest（全局仿射）",
        note: "hfq = scale · qfq + hfq_base，随基表更新。",
      },
    ],
    syncPolicy: {
      trigger: "随基表与复权因子更新",
      cron: null,
      dependsOn: null,
      deadline: null,
      note: "普通视图（非物化），无独立同步任务。",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立任务；随基表 / 复权因子回补自动生效。",
    },
    fallback: {
      capability: "kline",
      chain: [],
      degrade: false,
      note: "派生视图（自 bar1d_raw ⋈ adj_factor_latest）；运行态反映上游 kline 能力域，视图本身无降级链。",
    },
    riskControl: ["依赖 adj_factor_latest 的全局仿射常量，退化为一次 hash join。"],
  },
  {
    table: "bar_period_adj",
    name: "周期 K 线",
    description:
      "由日线聚合生成的派生周期线（5 日 / 周 / 月），不再向上游拉取，保证与日线复权口径完全一致。",
    timeColumn: "time",
    jobTypes: ["kline-period"],
    sources: [
      {
        platform: "本地派生",
        endpoint: "由 bar1d_qfq 聚合",
        note: "5 日 / 周 / 月，不向上游拉取，口径与日线完全一致。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10（依赖复权因子）",
      cron: "10 15 * * 1-5",
      dependsOn: "adj-factor",
      deadline: "18:00",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立任务；由 kline-1d-backfill 完成后内联整段重建。",
    },
    fallback: {
      capability: "kline",
      chain: [],
      degrade: false,
      note: "本地聚合（自 bar1d_qfq）；运行态反映上游 kline 能力域，无独立降级链。",
    },
    riskControl: ["MISSING_TOLERANCE=10：可交易标的中缺失 >10 只则判未完全成功。"],
  },
  {
    table: "fund_flow_rank",
    name: "资金流排行",
    description:
      "行业 / 概念 / 个股三档资金流排行快照，含主力、超大单、大单、中单、小单净流入净额与净占比。",
    timeColumn: "updated_at",
    jobTypes: ["fundflow"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardFundFlow + quant.fundFlowRank",
        upstream: [
          {
            method: "GET",
            url: "https://push2delay.eastmoney.com/api/qt/clist/get",
            target: "行业 / 概念 / 个股三档资金流",
          },
        ],
        note: "行业 / 概念 / 个股三档。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务。",
    },
    fallback: {
      capability: "fund_flow_rank",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: ["东财统一走 _em_get 串行限流（间隔 ≥ 1.5s，熔断 5 分钟）。"],
  },
  {
    table: "limit_up_pool",
    name: "涨停池",
    description:
      "每日涨停 / 曾涨停个股快照，含连板数、首次封板时间、炸板次数、封单金额、涨停类型与题材标签，是主线识别的核心输入。",
    timeColumn: "updated_at",
    jobTypes: ["limit-up-pool", "limit-up-pool-backfill"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.limitUpPool",
        upstream: [
          { method: "GET", url: "https://push2ex.eastmoney.com/getTopicZTPool", target: "涨停 / 曾涨停个股" },
        ],
        note: "每日涨停 / 曾涨停个股快照。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
    },
    backfill: {
      separate: true,
      trigger: "交易日 19:00",
      cron: "0 19 * * 1-5",
      note: "只补窗口内缺失的历史交易日；与当日彻底分离，独立 jobType / 幂等状态 / 重试窗口。",
    },
    fallback: {
      capability: "limit_up_pool",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "东财统一走 _em_get 串行限流；三个快照回补错峰 5 分钟。",
      "当日同步空数据抛错重试；回补遇缺失历史日跳过并自愈。",
    ],
  },
  {
    table: "board_fund_flow_period",
    name: "板块周期资金流",
    description:
      "板块级 5 日 / 10 日周期资金流排行快照，用于判断资金聚焦的持续性；单日资金流见资金流排列表。",
    timeColumn: "updated_at",
    jobTypes: ["board-fund-flow"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.boardFundFlow",
        upstream: [
          { method: "GET", url: "https://push2delay.eastmoney.com/api/qt/clist/get", target: "板块 5 / 10 日周期资金流" },
        ],
        note: "板块 5 日 / 10 日周期资金流。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
    },
    backfill: {
      separate: false,
      trigger: null,
      cron: null,
      note: "无独立回补任务。",
    },
    fallback: {
      capability: "board_fund_flow",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: ["东财统一走 _em_get 串行限流（间隔 ≥ 1.5s，熔断 5 分钟）。"],
  },
  {
    table: "dragon_tiger_daily",
    name: "龙虎榜",
    description:
      "全市场龙虎榜日快照（个股级），含上榜原因、收盘价、涨跌幅与净买入额（万元），是机构 / 游资确认维度的原始数据源。",
    timeColumn: "updated_at",
    jobTypes: ["dragon-tiger", "dragon-tiger-backfill"],
    sources: [
      {
        platform: "东方财富",
        endpoint: "quant.dailyDragonTiger",
        upstream: [
          { method: "GET", url: "https://datacenter-web.eastmoney.com/api/data/v1/get", target: "个股龙虎榜日快照" },
        ],
        note: "全市场个股龙虎榜日快照。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
    },
    backfill: {
      separate: true,
      trigger: "交易日 19:05",
      cron: "5 19 * * 1-5",
      note: "只补窗口内缺失的历史交易日，与当日分离。",
    },
    fallback: {
      capability: "daily_dragon_tiger",
      chain: ["eastmoney"],
      degrade: false,
      note: "东财独有数据，无备选源。",
    },
    riskControl: [
      "东财统一走 _em_get 串行限流；快照回补与 limit-up-pool 错峰 5 分钟。",
      "当日同步空数据抛错重试；回补遇缺失历史日跳过并自愈。",
    ],
  },
  {
    table: "hot_reason",
    name: "题材归因",
    description:
      "同花顺强势股当日题材归因快照（个股级），reason 为核心题材标签字段，是题材催化维度的原始数据源。",
    timeColumn: "updated_at",
    jobTypes: ["hot-reason", "hot-reason-backfill"],
    sources: [
      {
        platform: "同花顺",
        endpoint: "quant.hotReason",
        upstream: [
          { method: "GET", url: "http://zx.10jqka.com.cn/event/api/getharden/", target: "强势股题材归因" },
        ],
        note: "强势股当日题材归因，reason 为核心题材标签。",
      },
    ],
    syncPolicy: {
      trigger: "交易日收盘后 15:10",
      cron: "10 15 * * 1-5",
      dependsOn: null,
      deadline: "18:00",
    },
    backfill: {
      separate: true,
      trigger: "交易日 19:10",
      cron: "10 19 * * 1-5",
      note: "只补窗口内缺失的历史交易日，与当日分离。",
    },
    fallback: {
      capability: "hot_reason",
      chain: ["ths"],
      degrade: false,
      note: "同花顺独有数据，无备选源。",
    },
    riskControl: [
      "同花顺源；快照回补错峰运行。",
      "当日同步空数据抛错重试；回补遇缺失历史日跳过并自愈。",
    ],
  },
];

/** jobType → 中文名（与同步中心共用一份映射，未知 jobType 回退原始值） */
const JOB_TYPE_NAMES = new Map(SYNC_MODULES.map((m) => [m.jobType, m.name]));

function jobTypeName(jobType: string): string {
  return JOB_TYPE_NAMES.get(jobType) ?? jobType;
}

/** SQL 标识符白名单校验：注册表内的表名 / 列名才允许拼接进 SQL */
function isSafeIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

function assertDefIsSafe(def: DataTableDef): void {
  if (
    !isSafeIdentifier(def.table) ||
    !isSafeIdentifier(def.timeColumn) ||
    (def.maxTable != null && !isSafeIdentifier(def.maxTable))
  ) {
    throw new Error(`data-center 非法标识符: ${def.table}.${def.timeColumn}`);
  }
}

/** 计算「更新时间」时实际聚合的物理表（视图场景回落到其基表） */
function maxSourceTable(def: DataTableDef): string {
  return def.maxTable ?? def.table;
}

/** pg 返回值统一序列化为 ISO 字符串（timestamp / date 都会被驱动解析为 Date） */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 单表最近更新时间（MAX(timeColumn)） */
async function queryTableUpdatedAt(def: DataTableDef): Promise<string | null> {
  assertDefIsSafe(def);
  const res = await db.execute(
    sql`SELECT MAX(${sql.raw(`"${def.timeColumn}"`)}) AS updated_at FROM ${sql.raw(`"${maxSourceTable(def)}"`)}`,
  );
  return toIso(res.rows[0]?.updated_at);
}

/** 全部表最近更新时间，合并为单条 UNION ALL 查询，避免逐表往返 */
async function queryAllUpdatedAt(): Promise<Map<string, string | null>> {
  const parts = DATA_CENTER_TABLES.map((def) => {
    assertDefIsSafe(def);
    return sql`SELECT ${sql.raw(`'${def.table}'`)} AS table_name, MAX(${sql.raw(`"${def.timeColumn}"`)}) AS updated_at FROM ${sql.raw(`"${maxSourceTable(def)}"`)}`;
  });

  const res = await db.execute(sql.join(parts, sql` UNION ALL `));
  const map = new Map<string, string | null>();
  for (const row of res.rows) {
    map.set(String(row.table_name), toIso(row.updated_at));
  }
  return map;
}

function findDef(table: string): DataTableDef | undefined {
  return DATA_CENTER_TABLES.find((d) => d.table === table);
}

/**
 * GET /api/v1/data-center/tables
 *
 * 数据中心表清单：中文名 + 实际表名 + 描述 + 更新时间。
 */
dataCenterRoute.get("/tables", async (c) => {
  try {
    const updatedAtMap = await queryAllUpdatedAt();
    return ok(c, {
      tables: DATA_CENTER_TABLES.map((def) => ({
        table: def.table,
        name: def.name,
        description: def.description,
        updatedAt: updatedAtMap.get(def.table) ?? null,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "query data-center tables failed");
    return serverError(c, "查询数据表清单失败");
  }
});

/**
 * GET /api/v1/data-center/tables/:table
 *
 * 单表详情：基础元信息 + 表结构（information_schema + 主键标记）+ 更新记录（job_run）。
 */
dataCenterRoute.get("/tables/:table", async (c) => {
  const table = c.req.param("table");
  const def = findDef(table);
  if (!def) return notFound(c, `未收录的数据表：${table}`);

  try {
    const [updatedAt, columnRes, records] = await Promise.all([
      queryTableUpdatedAt(def),
      db.execute(sql`
        SELECT
          c.column_name    AS name,
          c.data_type      AS data_type,
          c.is_nullable    AS is_nullable,
          c.column_default AS column_default,
          (pk.column_name IS NOT NULL) AS is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT a.attname AS column_name
          FROM pg_index i
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE n.nspname = 'public' AND t.relname = ${def.table} AND i.indisprimary
        ) pk ON pk.column_name = c.column_name
        WHERE c.table_schema = 'public' AND c.table_name = ${def.table}
        ORDER BY c.ordinal_position
      `),
      def.jobTypes.length > 0
        ? db
            .select()
            .from(jobRun)
            .where(inArray(jobRun.jobType, def.jobTypes))
            .orderBy(desc(jobRun.id))
            .limit(50)
        : Promise.resolve([] as (typeof jobRun.$inferSelect)[]),
    ]);

    return ok(c, {
      table: def.table,
      name: def.name,
      description: def.description,
      updatedAt,
      sources: def.sources,
      syncPolicy: def.syncPolicy,
      backfill: def.backfill,
      fallback: def.fallback,
      riskControl: def.riskControl,
      columns: columnRes.rows.map((row) => ({
        name: String(row.name),
        dataType: String(row.data_type),
        isNullable: row.is_nullable === "YES",
        columnDefault: row.column_default == null ? null : String(row.column_default),
        isPrimaryKey: Boolean(row.is_primary_key),
      })),
      records: records.map((r) => ({
        id: r.id,
        jobType: r.jobType,
        jobName: jobTypeName(r.jobType),
        tradeDate: r.tradeDate,
        status: r.status,
        total: r.total,
        processed: r.processed,
        message: r.message,
        error: r.error,
        startedAt: toIso(r.startedAt),
        finishedAt: toIso(r.finishedAt),
        durationMs:
          r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      })),
    });
  } catch (error) {
    log.error({ err: error, table }, "query data-center table detail failed");
    return serverError(c, "查询数据表详情失败");
  }
});

/**
 * GET /api/v1/data-center/sources/health
 *
 * 数据源健康 / 熔断状态 + 各能力降级链运行态（代理 quant GET /sources/health）。
 * 供「数据同步 · 降级」块展示运行时状态：当前生效源 / 是否已降级 / 是否熔断。
 * 纯运行时读快照，不触发外部取数。
 */
dataCenterRoute.get("/sources/health", async (c) => {
  try {
    const health = await quant.dataSourcesHealth();
    return ok(c, health);
  } catch (error) {
    log.error({ err: error }, "query data source health failed");
    return serverError(c, "查询数据源运行状态失败");
  }
});

export { dataCenterRoute };
