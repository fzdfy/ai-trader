export interface CronJobConfig {
  name: string;
  cron: string;
  enabled: boolean;
}

export const CRON_JOBS: CronJobConfig[] = [
  { name: "kline-1m",   cron: "*/30 * * * * *", enabled: true },
  { name: "kline-1d",   cron: "*/5 * * * *",    enabled: true },
  { name: "gap-detect",  cron: "*/5 * * * *",    enabled: true },
  { name: "news",        cron: "*/30 * * * * *", enabled: true },
  { name: "heartbeat",   cron: "0 * * * * *",    enabled: true },
];
