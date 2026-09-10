export interface CronJobConfig {
  name: string;
  cron: string;
  enabled: boolean;
  /** 仅交易日收盘后执行（调度层用 isTradeDay + isAfterMarketClose 守卫） */
  marketCloseOnly?: boolean;
  /** 仅交易日活跃时段执行（调度层用 isTradeDay + 时间窗守卫，如 news 避免深夜空转） */
  marketHoursOnly?: boolean;
  /** 依赖的前置 jobType：今日该 job 成功后才会执行（如 features 依赖 kline-1d） */
  dependsOn?: string;
}

export const CRON_JOBS: CronJobConfig[] = [
  // 分钟 K 线 / 缺口检测管道尚未实现（空壳），暂不调度，避免同步中心显示"成功"误导
  { name: "kline-1m",   cron: "*/30 * * * * *", enabled: false },
  // 日 K 线：收盘后全市场增量拉取，15:00–16:59 每 10 分钟尝试，靠 hasSuccessToday 幂等；
  // 失败自动重试，避免单点 15:20 失败导致 features / kline-period 当天级联跳过
  { name: "kline-1d",   cron: "*/10 15-16 * * 1-5",  enabled: true, marketCloseOnly: true },
  { name: "gap-detect",  cron: "*/5 * * * *",    enabled: false },
  // 新闻：仅交易日活跃时段（07:00–23:00）运行，避免深夜/节假日空转
  { name: "news",        cron: "*/2 * * * *",    enabled: true, marketHoursOnly: true },
  { name: "boards",      cron: "30 15 * * 1-5",  enabled: true, marketCloseOnly: true },
  { name: "board-kline", cron: "40 15 * * 1-5",  enabled: true, marketCloseOnly: true, dependsOn: "boards" },
  { name: "constituents", cron: "45 15 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "boards" },
  { name: "fundflow",    cron: "35 15 * * 1-5",  enabled: true, marketCloseOnly: true },
  { name: "limit-up-pool", cron: "50 15 * * 1-5", enabled: true, marketCloseOnly: true },
  // 周期线：依赖日 K 线先完成，16:00–17:59 每 10 分钟尝试（dependsOn + hasSuccessToday 幂等），
  // 避免 kline-1d 重试较晚时 15:55 单点漏跑导致某个周期组永久缺失（直到下次 forceFull）
  { name: "kline-period", cron: "*/10 16-17 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "kline-1d" },
  // 特征计算：依赖日 K 线先完成，16:00–18:59 每 10 分钟尝试一次，直到 kline-1d 今日成功后算一次
  { name: "features",    cron: "*/10 16-18 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "kline-1d" },
  { name: "calendar",    cron: "0 2 * * 1",      enabled: true },
];
