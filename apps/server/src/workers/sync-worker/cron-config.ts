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
  /** 重试截止时间（本地 "HH:mm"）：收盘后任务在此时间前内部循环重试，超过则标 failed */
  deadline?: string;
  /** 重试间隔（毫秒），默认 5 分钟 */
  retryIntervalMs?: number;
}

export const CRON_JOBS: CronJobConfig[] = [
  // 分钟 K 线 / 缺口检测管道尚未实现（空壳），暂不调度，避免同步中心显示"成功"误导
  { name: "kline-1m",   cron: "*/30 * * * * *", enabled: false },
  { name: "gap-detect",  cron: "*/5 * * * *",    enabled: false },
  // 新闻：仅交易日活跃时段（07:00–23:00）运行，高频独立触发，不走重试循环
  { name: "news",        cron: "*/2 * * * *",    enabled: true, marketHoursOnly: true },
  // ============================ 收盘后任务 ============================
  // 统一交易日 15:10 触发一次（腾讯日线收盘后即定稿，无需等 16:00），
  // 失败由管道内部循环重试到 deadline（18:00），不再靠 cron 多次触发；
  // hasSuccessToday 保证每天只成功一次。
  // 依赖关系（下游在内部等待上游成功）：
  //   boards → board-kline / constituents
  //   kline-1d → kline-period / features
  { name: "kline-1d",      cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, deadline: "18:00" },
  { name: "boards",        cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, deadline: "18:00" },
  { name: "board-kline",   cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "boards", deadline: "18:00" },
  { name: "constituents",  cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "boards", deadline: "18:00" },
  { name: "fundflow",      cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, deadline: "18:00" },
  { name: "limit-up-pool", cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, deadline: "18:00" },
  { name: "mainline-signals", cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, deadline: "18:00" },
  { name: "kline-period",  cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "kline-1d", deadline: "18:00" },
  { name: "features",      cron: "10 15 * * 1-5", enabled: true, marketCloseOnly: true, dependsOn: "kline-1d", deadline: "18:00" },
  // 交易日历：每周一凌晨 2 点一次性补未来交易日
  { name: "calendar",      cron: "0 2 * * 1",      enabled: true },
];
