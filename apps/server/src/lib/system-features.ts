export interface SystemFeatures {
  dashboardMarketRadar: boolean;
}

export function getSystemFeatures(
  env: Record<string, string | undefined> = process.env,
): SystemFeatures {
  return {
    dashboardMarketRadar: env.DASHBOARD_MARKET_RADAR_ENABLED === "true",
  };
}
